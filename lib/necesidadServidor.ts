// Necesidades del comprador: piezas de servidor (solo con supabaseAdmin) compartidas por
// app/api/registro-cliente, app/api/necesidades y app/api/propuestas (Documento Maestro V8, §19).
//
//   guardarNecesidad   crea la ficha (hasta 3 activas) y actualiza perfiles_intencion, para que el
//                      matching, el Radar y las oportunidades de la V7 sigan funcionando.
//   busquedaDirecta    camino A (§19.2): inventario de la plataforma que cumple la ficha y anuncios
//                      de portales (solo título y liga a la fuente: §18, términos de los portales).
//   avisarBrokersZona  camino B (§19.3): aviso a los brokers con propiedades en ese municipio.
//   mercadoDeZonas     V9 §23.2: precio por m² típico de cada zona ("lo que rinde tu dinero").
//   registro           guion v12, momento 3 (19-nov-2026): al guardar la ficha queda en busquedas_registro TODO
//                      lo que se revisó (plataforma, portales y comparables), de dónde vino y si pasó o por qué no.
//
// V9 (§23): una ficha busca en hasta 3 zonas. Todo lo de aquí trabaja por zona.
// V9 (§22): una ficha es de compra o de renta. En renta cuenta la renta mensual de la propiedad, los
// portales se buscan "en renta" y el precio por m² de la zona es renta mensual por m².
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarUsuario } from '@/lib/avisos'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { municipioCanonico } from '@/lib/matching'
import { buscarComparables } from '@/lib/comparables'
import { calcularPrecioMercado, clasificarComparables } from '@/lib/precioMercado'
import { fuenteDeUrl, resumirRegistro, type ItemRegistro } from '@/lib/registroBusqueda'
import { ordenDelMotor } from '@/lib/motorBusqueda'
import {
  cumpleNecesidad, resumenNecesidad, presupuestoPerfil, etiquetaTipo, TIPOS_NECESIDAD, zonasDe, nombreZona,
  zonaDeActivo, puntajeOpcion, precioPara, detalleRentaActivo, CAMPO_AREA, MAX_NECESIDADES_ACTIVAS, type Necesidad, type ZonaBusqueda, type MercadoZona,
  type OperacionActivo, type RentaActivo,
} from '@/lib/necesidad'

export interface FilaNecesidad extends Necesidad {
  id: string
  usuario_id: string
  activa: boolean
  vence_at: string
  es_demo: boolean
  created_at: string
}

export const COLS_NECESIDAD = 'id, usuario_id, operacion, renta, tipo, caracteristicas, estado, municipio, zona, colonias, zonas, presupuesto_min, presupuesto_max, forma_pago, plazo, proposito, busqueda_directa, publicada_brokers, camino, activa, vence_at, es_demo, created_at'

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
    zona: zonasDe(n).map((z) => [z.municipio, ...z.colonias].join(', ')).join(' / '),
    presupuesto: presupuestoPerfil(n),
    detalles: { ...n.caracteristicas, zonas: zonasDe(n).map(nombreZona).join(', ') },
  }
  const { data: p } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', uid).maybeSingle()
  let perfilId = (p as { id: string } | null)?.id
  if (perfilId) await admin.from('perfiles_intencion').update(perfil).eq('id', perfilId)
  else {
    const { data: nuevo } = await admin.from('perfiles_intencion').insert({ usuario_id: uid, fuente_captura: 'registro_directo', ...perfil }).select('id').single()
    perfilId = (nuevo as { id: string } | null)?.id
  }

  const id = (data as { id: string }).id
  if (n.publicada_brokers) after(() => avisarBrokersZona(admin, n, opts))
  after(async () => {
    const vacio = { anuncios: [] as OpcionPortal[], registro: [] as ItemRegistro[] }
    const [portales, mercado, plataforma] = await Promise.all([
      n.busqueda_directa ? anunciosDePortalesConRegistro(n) : Promise.resolve(vacio),
      mercadoDeZonasConRegistro(n),
      n.busqueda_directa ? revisarInventario(admin, n, { esDemo: opts.esDemo, incluirBrokers: n.camino === 'con_asesor' }) : Promise.resolve([]),
    ])
    // Camino A con el mercado: los anuncios de portales quedan en su Radar (una búsqueda por zona).
    if (n.busqueda_directa && perfilId) await guardarEnRadar(admin, perfilId, portales.anuncios, n, opts)
    // "Lo que rinde tu dinero" (§23.2) queda guardado en cada zona para el panel del comprador.
    await admin.from('necesidades').update({ zonas: zonasDe(n).map((z, i) => ({ ...z, mercado: mercado.mercado[i] })) }).eq('id', id)
    // Momento 3 (guion v12): todo lo revisado. Si la tabla aún no existe (migración 20261119000000), no pasa nada.
    const items = [...plataforma, ...portales.registro, ...mercado.registro]
    await admin.from('busquedas_registro').upsert({ necesidad_id: id, usuario_id: uid, es_demo: opts.esDemo, resumen: resumirRegistro(items), items })
  })
  return { id }
}

export async function avisarBrokersZona(admin: SupabaseClient, n: Necesidad, opts: { esDemo: boolean }): Promise<void> {
  // V9: a los brokers con propiedades en CUALQUIERA de sus zonas, un solo aviso por broker.
  const municipios = new Set(zonasDe(n).map((z) => municipioCanonico(z.municipio)))
  const brokers = (await perfilesBrokers(admin, opts.esDemo)).filter((b) => [...municipios].some((m) => b.municipios.has(m)))
  const donde = zonasDe(n).map(nombreZona).join(', ')
  await Promise.all(brokers.map((b) => avisarUsuario(admin, b.id, {
    asunto: `Nueva necesidad en ${donde}: ${etiquetaTipo(n.tipo).toLowerCase()}${n.operacion === 'renta' ? ' en renta' : ''}`,
    titulo: n.operacion === 'renta' ? 'Alguien busca rentar en tu zona' : 'Un comprador busca en tu zona',
    lineas: [resumenNecesidad(n), 'Si tienes una propiedad que cumpla, propónla desde tu panel: el comprador la verá en su bandeja.'],
    enlace: { texto: 'Ver necesidades', ruta: '/portal-broker?pestana=necesidades' },
  }, opts)))
}

export interface OpcionPlataforma {
  activoId: string
  nombre: string
  tipo: string
  municipio: string
  colonia: string | null
  superficie: number | null
  precio_total: number | null
  /** V9: la operación de la propiedad y su renta mensual; `precio` es el que cuenta en esta ficha. */
  operacion: OperacionActivo
  renta_mensual: number | null
  precio: number | null
  /** En una ficha de renta: depósito, plazo mínimo, garantía, etc. */
  detalleRenta?: string[]
  certificada: boolean
  deBroker: boolean
  /** El asesor que la ofrece (cartera), o null si es de un particular. */
  brokerId: string | null
  /** V9: índice de la zona de la ficha donde cae, su puntaje (0-100) y por qué. Con el motor (§29), el
   *  puntaje es su % de coincidencia; null = recién publicada, el motor todavía no la tiene. */
  zona: number
  puntaje: number | null
  razones: string[]
}

export interface OpcionPortal { url: string; titulo: string; fuente: string; zona: number }

interface ActivoDirecta {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null
  superficie: number | null; precio_total: number | null; broker_id: string | null
  operacion: OperacionActivo | null; renta_mensual: number | null; renta: RentaActivo | null
}

/** Columnas de activos para comparar contra una ficha: las de siempre más su operación (V9, §22). */
export const COLS_ACTIVO_FICHA = 'id, nombre, tipo, municipio, colonia, superficie, precio_total, operacion, renta_mensual, renta, broker_id'

/** Camino A con el inventario de la plataforma. Por su cuenta: solo particulares (V7.2). */
export async function inventarioQueCumple(admin: SupabaseClient, n: Necesidad, opts: { esDemo: boolean; incluirBrokers: boolean }): Promise<OpcionPlataforma[]> {
  let q = admin.from('activos').select(COLS_ACTIVO_FICHA)
    .neq('status', 'cerrado').eq('es_demo', opts.esDemo)
  if (!opts.incluirBrokers) q = q.is('broker_id', null)
  // El motor (§29) se consulta en paralelo; solo reordena y explica lo que SMT Match aprueba aquí.
  const [{ data }, motor] = await Promise.all([q, ordenDelMotor(n)])
  const A = ((data as ActivoDirecta[]) || []).filter((a) => cumpleNecesidad(a, n).cumple)
  if (!A.length) return []
  const { data: certs } = await admin.from('certificaciones').select('activo_id').eq('estado', 'certificada').in('activo_id', A.map((a) => a.id))
  const certificadas = new Set(((certs as { activo_id: string }[]) || []).map((c) => c.activo_id))
  const opciones = A.map((a) => {
    const { puntaje, razones } = puntajeOpcion(a, n)
    return {
      activoId: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia, superficie: a.superficie,
      precio_total: a.precio_total, operacion: a.operacion ?? 'venta', renta_mensual: a.renta_mensual, precio: precioPara(a, n.operacion),
      detalleRenta: n.operacion === 'renta' ? detalleRentaActivo(a.renta) : undefined,
      certificada: certificadas.has(a.id), deBroker: !!a.broker_id, brokerId: a.broker_id ?? null,
      zona: zonaDeActivo(a, n), puntaje, razones,
    }
  }).sort((x, y) => y.puntaje - x.puntaje || Number(y.certificada) - Number(x.certificada))
  return motor ? conOrdenDelMotor(opciones, motor) : opciones
}

/**
 * Registro (momento 3): cada propiedad de la plataforma del tipo que pide, con si cumple su ficha o
 * por qué no. Las de otro tipo no se listan (no se "revisaron" para esta búsqueda). Yendo por su
 * cuenta, las de asesores no salen en la banda 1: llegan solo si el asesor se las propone.
 */
export async function revisarInventario(admin: SupabaseClient, n: Necesidad, opts: { esDemo: boolean; incluirBrokers: boolean }): Promise<ItemRegistro[]> {
  const { data } = await admin.from('activos').select(COLS_ACTIVO_FICHA).neq('status', 'cerrado').eq('es_demo', opts.esDemo)
  return ((data as ActivoDirecta[]) || []).filter((a) => cumpleNecesidad(a, n).motivos.every((m) => !m.startsWith('No es '))).map((a) => {
    const { cumple, motivos } = cumpleNecesidad(a, n)
    const deAsesor = cumple && !!a.broker_id && !opts.incluirBrokers
    const zona = zonaDeActivo(a, n)
    return {
      revision: 'plataforma', fuente: 'SMT Match', titulo: a.nombre || `${a.tipo} en ${a.colonia || a.municipio}`, url: null,
      precio: precioPara(a, n.operacion), m2: a.superficie, zona: zona >= 0 ? zona : null,
      resultado: cumple && !deAsesor ? 'mostrada' : 'descartada',
      razon: deAsesor ? 'Es de un asesor: vas por tu cuenta, así que llega solo si te la propone' : cumple ? null : motivos.join('; '),
    } satisfies ItemRegistro
  })
}

/**
 * Con el motor (§29): el porcentaje es el % de coincidencia del motor (lo pedido que cumple cada
 * propiedad) y la lista se ordena por él; en los empates manda el orden del motor. Las que el motor
 * todavía no tiene (recién cargadas) van al final, sin %, como "recién publicada". Nada de lo que
 * SMT Match aprobó desaparece.
 */
function conOrdenDelMotor(opciones: OpcionPlataforma[], motor: Awaited<ReturnType<typeof ordenDelMotor>> & object): OpcionPlataforma[] {
  const pos = new Map(motor.map((m) => [m.activoId, m]))
  const extra = (o: OpcionPlataforma): OpcionPlataforma => {
    const m = pos.get(o.activoId)
    if (!m) return { ...o, puntaje: null, razones: ['recién publicada', ...o.razones] }
    // Lo que el motor agrega a las razones de SMT Match: características, coincidencias y datos faltantes.
    const cumple = m.cumple.filter((c, i) => i > 0 && !c.startsWith('precio'))
    // "Sin descripción" solo si ninguna preferencia coincidió con lo que sí tiene el anuncio.
    const faltan = m.faltanDatos.flatMap((f) => (f.startsWith('sin dato: descripción') ? (m.preferencias.length ? [] : ['sin descripción para comparar con tus preferencias']) : [f.replace(/^sin dato: /, 'no indica ')]))
    const coincide = m.preferencias.length ? [`coincide con: ${m.preferencias.join(', ')}`] : []
    return { ...o, puntaje: m.coincidencia ?? o.puntaje, razones: [...new Set([...o.razones, ...cumple, ...coincide, ...faltan])] }
  }
  const conMotor = opciones.filter((o) => pos.has(o.activoId)).map(extra)
    .sort((x, y) => (y.puntaje ?? 0) - (x.puntaje ?? 0) || pos.get(x.activoId)!.posicion - pos.get(y.activoId)!.posicion)
  return [...conMotor, ...opciones.filter((o) => !pos.has(o.activoId)).map(extra)]
}

/** Guarda los anuncios del motor en el Radar del comprador (origen 'motor', sin "me interesa"). */
export async function guardarEnRadar(admin: SupabaseClient, perfilId: string, anuncios: OpcionPortal[], n: Necesidad, opts: { esDemo: boolean }): Promise<void> {
  for (const a of anuncios) {
    const { data: existente } = await admin.from('radar_anuncios').select('id').eq('url', a.url).eq('es_demo', opts.esDemo).maybeSingle()
    let id = (existente as { id: string } | null)?.id
    if (!id) {
      const { data } = await admin.from('radar_anuncios').insert({
        url: a.url, fuente: a.fuente, titulo: a.titulo.slice(0, 200), tipo: etiquetaTipo(n.tipo), es_demo: opts.esDemo,
        // La zona donde se buscó: así la bandeja lo acomoda en su columna (V9, §23.4).
        municipio: zonasDe(n)[a.zona]?.municipio ?? n.municipio, colonia: zonasDe(n)[a.zona]?.colonias[0] ?? null,
      }).select('id').single()
      id = (data as { id: string } | null)?.id
    }
    if (id) await admin.from('radar_opciones').upsert({ perfil_id: perfilId, anuncio_id: id, origen: 'motor' }, { onConflict: 'perfil_id,anuncio_id', ignoreDuplicates: true })
  }
}

// Portales inmobiliarios reconocidos. Con varios `site:` juntos el buscador no devuelve nada
// (probado el 10-nov-2026), así que se busca simple y se quedan solo los resultados de estos dominios.
const FUENTES = ['inmuebles24.com', 'lamudi.com.mx', 'vivanuncios.com.mx', 'propiedades.com', 'mercadolibre.com.mx', 'doorvel.com', 'spot2.mx', 'casasyterrenos.com', 'easybroker.com', 'avisosdeocasion.com']
// Avisos de Ocasión (El Norte, Reforma y Mural; 19-nov-2026): muchos anuncios de dueños directos que no
// salen en los otros portales. En la búsqueda general casi nunca llega a los primeros 10, así que tiene
// su propia búsqueda (un solo `site:` sí funciona).
const AVISOS = 'avisosdeocasion.com'
const NOMBRE_FUENTE: Record<string, string> = { [AVISOS]: 'Avisos de Ocasión' }
const MAX_AVISOS = 2

/**
 * Camino A con el mercado: anuncios de portales vía búsqueda web. Solo título y liga a la fuente
 * (§18: los portales prohíben copiar sus anuncios); se marcan "no certificados". Sin SERPER_API_KEY
 * devuelve vacío.
 */
export async function anunciosDePortales(n: Necesidad): Promise<OpcionPortal[]> {
  return (await anunciosDePortalesConRegistro(n)).anuncios
}

/** Los anuncios y, para el registro (momento 3), todo lo que trajo el buscador con lo descartado. */
export async function anunciosDePortalesConRegistro(n: Necesidad): Promise<{ anuncios: OpcionPortal[]; registro: ItemRegistro[] }> {
  const zonas = zonasDe(n)
  const porZona = await Promise.all(zonas.map((z, i) => anunciosDeZona(n, z, i, zonas.length > 1 ? 5 : 8)))
  return { anuncios: porZona.flatMap((x) => x.anuncios), registro: porZona.flatMap((x) => x.registro) }
}

async function anunciosDeZona(n: Necesidad, z: ZonaBusqueda, zona: number, max: number): Promise<{ anuncios: OpcionPortal[]; registro: ItemRegistro[] }> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return { anuncios: [], registro: [] }
  const plural = TIPOS_NECESIDAD.find((t) => t.id === n.tipo)?.plural ?? n.tipo
  const lugar = [z.nombre || z.colonias[0], z.municipio, z.estado].filter(Boolean).join(' ')
  const operacion = n.operacion === 'renta' ? 'renta' : 'venta'
  const q = `${plural} en ${operacion} ${lugar}`
  const buscar = async (consulta: string) => {
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: consulta, gl: 'mx', hl: 'es', num: 10 }),
      })
      if (!r.ok) return []
      return ((await r.json()) as { organic?: { link: string; title: string }[] }).organic ?? []
    } catch {
      return []
    }
  }
  const [general, avisos] = await Promise.all([buscar(q), buscar(`site:${AVISOS} ${q}`)])
  const deFuente = (o: { link: string; title: string }): OpcionPortal | null => {
    let host = ''
    try { host = new URL(o.link).hostname } catch { return null }
    const fuente = FUENTES.find((f) => host === f || host.endsWith('.' + f))
    return fuente ? { url: o.link, titulo: o.title, fuente: NOMBRE_FUENTE[fuente] ?? fuente.split('.')[0], zona } : null
  }
  const registro: ItemRegistro[] = []
  const anotar = (o: { link: string; title: string }, razon: string) => registro.push({
    revision: 'portal', fuente: fuenteDeUrl(o.link), titulo: o.title, url: o.link, precio: null, m2: null, zona, resultado: 'descartada', razon,
  })
  // De Avisos de Ocasión, solo los de la operación que pide (sus títulos dicen "Venta de…" o "Renta de…").
  const contraria = operacion === 'venta' ? /\brenta\b/i : /\bventa\b/i
  // Y solo páginas de bienes raíces (el sitio también tiene empleos y autos).
  const inmueble = /\/(Detalle\/BienesRaices|br\/|Portada\/Indice\/(venta|renta)-)/i
  const deAvisos: OpcionPortal[] = []
  for (const o of avisos) {
    const f = deFuente(o)
    if (!inmueble.test(o.link)) anotar(o, 'No es un anuncio de inmuebles')
    else if (contraria.test(o.title)) anotar(o, operacion === 'venta' ? 'Es de renta y buscas comprar' : 'Es de venta y buscas rentar')
    else if (!f) anotar(o, 'No es un portal inmobiliario reconocido')
    else if (deAvisos.length >= MAX_AVISOS) anotar(o, `Ya había ${MAX_AVISOS} de este portal para la zona`)
    else deAvisos.push(f)
  }
  const resto: OpcionPortal[] = []
  for (const o of general) {
    if (deAvisos.some((a) => a.url === o.link)) continue
    const f = deFuente(o)
    if (!f) anotar(o, 'No es un portal inmobiliario reconocido')
    else if (resto.length >= max - deAvisos.length) anotar(o, 'Ya había suficientes resultados de portales para la zona')
    else resto.push(f)
  }
  const anuncios = [...resto, ...deAvisos]
  for (const a of anuncios) registro.push({ revision: 'portal', fuente: fuenteDeUrl(a.url), titulo: a.titulo, url: a.url, precio: null, m2: null, zona, resultado: 'mostrada', razon: null })
  return { anuncios, registro }
}

// ── "Lo que rinde tu dinero" (V9, §23.2) ─────────────────────────────────────────────────────

// Los comparables cuestan (búsqueda + extracción con Claude). Se guardan 12 h por tipo y zona en la
// memoria de la instancia: la búsqueda antes de la cuenta y la ficha guardada suelen pedir lo mismo.
const DOCE_HORAS = 12 * 3600_000
const cacheMercado = new Map<string, { valor: MercadoZona; registro: ItemRegistro[]; t: number }>()

/** Precio por m² típico (mediana de comparables reales, sin atípicos) de cada zona de la ficha. */
export async function mercadoDeZonas(n: Necesidad): Promise<(MercadoZona | null)[]> {
  return (await mercadoDeZonasConRegistro(n)).mercado
}

const RAZON_COMPARABLE = {
  sin_precio: 'Sin precio por m² que se pueda usar',
  otro_tamano: 'De un tamaño muy distinto al que pides',
  atipico: 'Precio atípico para la zona',
  pocos: 'Muy pocos comparables para dar un precio de zona',
} as const

/** "Lo que rinde tu dinero" y, para el registro (momento 3), cada comparable con si se usó o por qué no. */
export async function mercadoDeZonasConRegistro(n: Necesidad): Promise<{ mercado: (MercadoZona | null)[]; registro: ItemRegistro[] }> {
  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  const porZona = await Promise.all(zonasDe(n).map(async (z, zona): Promise<{ valor: MercadoZona | null; registro: ItemRegistro[] }> => {
    const lugar = z.nombre || z.colonias[0] || null
    const clave = [n.operacion, n.tipo, municipioCanonico(z.municipio), lugar ?? '', typeof area === 'number' ? area : ''].join('|').toLowerCase()
    const c = cacheMercado.get(clave)
    if (c && Date.now() - c.t < DOCE_HORAS) return { valor: c.valor, registro: c.registro.map((r) => ({ ...r, zona })) }
    try {
      // En renta: renta mensual por m², sin redondear a cientos (lib/precioMercado.ts).
      const enRenta = n.operacion === 'renta'
      const { comparables, fuentesConsultadas } = await buscarComparables({ tipo: etiquetaTipo(n.tipo), municipio: z.municipio, colonia: lugar, estado: z.estado }, enRenta ? 'renta' : 'venta')
      const sup = typeof area === 'number' ? area : null
      const pm = calcularPrecioMercado(comparables, sup, null, enRenta ? { total: 1_000, m2: 1 } : undefined)
      const valor: MercadoZona = { precioM2: pm.precioPromedioM2Zona, comparables: pm.comparablesUsados, fecha: new Date().toISOString() }
      const registro: ItemRegistro[] = clasificarComparables(comparables, sup).map(({ comparable: k, uso }) => ({
        revision: 'comparable', fuente: fuenteDeUrl(k.url), titulo: k.nombre, url: k.url, precio: k.precioTotal, m2: k.superficieM2, zona,
        resultado: uso === 'usado' ? 'referencia' : 'descartada', razon: uso === 'usado' ? null : RAZON_COMPARABLE[uso],
      }))
      // Las páginas que el buscador trajo y de las que no salió ningún comparable.
      for (const f of fuentesConsultadas) {
        if (comparables.some((k) => k.url === f.url)) continue
        registro.push({ revision: 'comparable', fuente: fuenteDeUrl(f.url), titulo: f.titulo, url: f.url, precio: null, m2: null, zona, resultado: 'descartada', razon: 'No trae un precio que se pueda usar' })
      }
      cacheMercado.set(clave, { valor, registro, t: Date.now() })
      return { valor, registro }
    } catch {
      return { valor: null, registro: [] }
    }
  }))
  return { mercado: porZona.map((x) => x.valor), registro: porZona.flatMap((x) => x.registro) }
}
