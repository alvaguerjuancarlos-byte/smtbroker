// Necesidades del comprador: piezas de servidor (solo con supabaseAdmin) compartidas por
// app/api/registro-cliente, app/api/necesidades y app/api/propuestas (Documento Maestro V8, §19).
//
//   guardarNecesidad   crea la ficha (hasta 3 activas) y actualiza perfiles_intencion, para que el
//                      matching, el Radar y las oportunidades de la V7 sigan funcionando.
//   busquedaDirecta    camino A (§19.2): inventario de la plataforma que cumple la ficha y anuncios
//                      de portales (solo título y liga a la fuente: §18, términos de los portales).
//   avisarBrokersZona  camino B (§19.3): aviso a los brokers con propiedades en ese municipio.
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarUsuario } from '@/lib/avisos'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { municipioCanonico } from '@/lib/matching'
import {
  cumpleNecesidad, resumenNecesidad, presupuestoPerfil, etiquetaTipo, TIPOS_NECESIDAD,
  MAX_NECESIDADES_ACTIVAS, type Necesidad,
} from '@/lib/necesidad'

export interface FilaNecesidad extends Necesidad {
  id: string
  usuario_id: string
  activa: boolean
  vence_at: string
  es_demo: boolean
  created_at: string
}

export const COLS_NECESIDAD = 'id, usuario_id, tipo, caracteristicas, estado, municipio, zona, colonias, presupuesto_min, presupuesto_max, forma_pago, plazo, proposito, busqueda_directa, publicada_brokers, activa, vence_at, es_demo, created_at'

/** Activa y sin vencer: la que cuenta para el tope de 3 y la que ven los brokers. */
export const vigente = (n: Pick<FilaNecesidad, 'activa' | 'vence_at'>) => n.activa && new Date(n.vence_at).getTime() > Date.now()

export async function guardarNecesidad(admin: SupabaseClient, uid: string, n: Necesidad, opts: { esDemo: boolean }): Promise<{ id: string } | { error: string; status: number }> {
  const { data: previas } = await admin.from('necesidades').select('id, activa, vence_at').eq('usuario_id', uid)
  const activas = ((previas as Pick<FilaNecesidad, 'id' | 'activa' | 'vence_at'>[]) || []).filter(vigente)
  if (activas.length >= MAX_NECESIDADES_ACTIVAS) {
    return { error: `Ya tienes ${MAX_NECESIDADES_ACTIVAS} búsquedas activas. Pausa una para crear otra.`, status: 409 }
  }
  const { data, error } = await admin.from('necesidades').insert({ usuario_id: uid, ...n }).select('id').single()
  if (error) return { error: error.message, status: 500 }

  // perfiles_intencion (uno por comprador) refleja su búsqueda más reciente.
  const perfil = {
    tipo_activo_interes: etiquetaTipo(n.tipo),
    zona: [n.municipio, ...n.colonias].join(', '),
    presupuesto: presupuestoPerfil(n),
    detalles: { ...n.caracteristicas, zonas: n.colonias.join(', ') },
  }
  const { data: p } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', uid).maybeSingle()
  let perfilId = (p as { id: string } | null)?.id
  if (perfilId) await admin.from('perfiles_intencion').update(perfil).eq('id', perfilId)
  else {
    const { data: nuevo } = await admin.from('perfiles_intencion').insert({ usuario_id: uid, fuente_captura: 'registro_directo', ...perfil }).select('id').single()
    perfilId = (nuevo as { id: string } | null)?.id
  }

  if (n.publicada_brokers) after(() => avisarBrokersZona(admin, n, opts))
  // Camino A con el mercado: los anuncios de portales quedan en su Radar (una búsqueda por ficha).
  if (n.busqueda_directa && perfilId) after(async () => guardarEnRadar(admin, perfilId!, await anunciosDePortales(n), n, opts))
  return { id: (data as { id: string }).id }
}

export async function avisarBrokersZona(admin: SupabaseClient, n: Necesidad, opts: { esDemo: boolean }): Promise<void> {
  const zona = municipioCanonico(n.municipio)
  const brokers = (await perfilesBrokers(admin, opts.esDemo)).filter((b) => b.municipios.has(zona))
  await Promise.all(brokers.map((b) => avisarUsuario(admin, b.id, {
    asunto: `Nueva necesidad en ${n.municipio}: ${etiquetaTipo(n.tipo).toLowerCase()}`,
    titulo: 'Un comprador busca en tu zona',
    lineas: [resumenNecesidad(n), 'Si tienes una propiedad que cumpla, propónla desde tu panel: el comprador la verá en su bandeja.'],
    enlace: { texto: 'Ver necesidades', ruta: '/portal-broker?pestana=necesidades' },
  }, opts)))
}

export interface OpcionPlataforma {
  activoId: string
  nombre: string
  tipo: string
  municipio: string
  superficie: number | null
  precio_total: number | null
  certificada: boolean
  deBroker: boolean
}

export interface OpcionPortal { url: string; titulo: string; fuente: string }

interface ActivoDirecta {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null
  superficie: number | null; precio_total: number | null; broker_id: string | null
}

/** Camino A con el inventario de la plataforma. Por su cuenta: solo particulares (V7.2). */
export async function inventarioQueCumple(admin: SupabaseClient, n: Necesidad, opts: { esDemo: boolean; incluirBrokers: boolean }): Promise<OpcionPlataforma[]> {
  let q = admin.from('activos').select('id, nombre, tipo, municipio, colonia, superficie, precio_total, broker_id')
    .neq('status', 'cerrado').eq('es_demo', opts.esDemo)
  if (!opts.incluirBrokers) q = q.is('broker_id', null)
  const { data } = await q
  const A = ((data as ActivoDirecta[]) || []).filter((a) => cumpleNecesidad(a, n).cumple)
  if (!A.length) return []
  const { data: certs } = await admin.from('certificaciones').select('activo_id').eq('estado', 'certificada').in('activo_id', A.map((a) => a.id))
  const certificadas = new Set(((certs as { activo_id: string }[]) || []).map((c) => c.activo_id))
  return A.map((a) => ({
    activoId: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, superficie: a.superficie,
    precio_total: a.precio_total, certificada: certificadas.has(a.id), deBroker: !!a.broker_id,
  })).sort((x, y) => Number(y.certificada) - Number(x.certificada))
}

/** Guarda los anuncios del motor en el Radar del comprador (origen 'motor', sin "me interesa"). */
export async function guardarEnRadar(admin: SupabaseClient, perfilId: string, anuncios: OpcionPortal[], n: Necesidad, opts: { esDemo: boolean }): Promise<void> {
  for (const a of anuncios) {
    const { data: existente } = await admin.from('radar_anuncios').select('id').eq('url', a.url).eq('es_demo', opts.esDemo).maybeSingle()
    let id = (existente as { id: string } | null)?.id
    if (!id) {
      const { data } = await admin.from('radar_anuncios').insert({
        url: a.url, fuente: a.fuente, titulo: a.titulo.slice(0, 200), tipo: etiquetaTipo(n.tipo), municipio: n.municipio, es_demo: opts.esDemo,
      }).select('id').single()
      id = (data as { id: string } | null)?.id
    }
    if (id) await admin.from('radar_opciones').upsert({ perfil_id: perfilId, anuncio_id: id, origen: 'motor' }, { onConflict: 'perfil_id,anuncio_id', ignoreDuplicates: true })
  }
}

// Portales inmobiliarios reconocidos. Con varios `site:` juntos el buscador no devuelve nada
// (probado el 10-nov-2026), así que se busca simple y se quedan solo los resultados de estos dominios.
const FUENTES = ['inmuebles24.com', 'lamudi.com.mx', 'vivanuncios.com.mx', 'propiedades.com', 'mercadolibre.com.mx', 'doorvel.com', 'spot2.mx', 'casasyterrenos.com', 'easybroker.com']

/**
 * Camino A con el mercado: anuncios de portales vía búsqueda web. Solo título y liga a la fuente
 * (§18: los portales prohíben copiar sus anuncios); se marcan "no certificados". Sin SERPER_API_KEY
 * devuelve vacío.
 */
export async function anunciosDePortales(n: Necesidad): Promise<OpcionPortal[]> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return []
  const plural = TIPOS_NECESIDAD.find((t) => t.id === n.tipo)?.plural ?? n.tipo
  const lugar = [n.colonias[0], n.municipio, n.estado].filter(Boolean).join(' ')
  const q = `${plural} en venta ${lugar}`
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'mx', hl: 'es', num: 10 }),
    })
    if (!r.ok) return []
    const j = await r.json() as { organic?: { link: string; title: string }[] }
    return (j.organic ?? []).flatMap((o) => {
      const fuente = FUENTES.find((f) => o.link.includes(f))
      return fuente ? [{ url: o.link, titulo: o.title, fuente: fuente.split('.')[0] }] : []
    }).slice(0, 8)
  } catch {
    return []
  }
}
