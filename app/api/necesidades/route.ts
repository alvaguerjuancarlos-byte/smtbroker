import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { municipioCanonico } from '@/lib/matching'
import {
  validarNecesidad, cumpleNecesidad, resumenNecesidad, detalleCaracteristicas, MAX_PROPUESTAS_POR_BROKER,
} from '@/lib/necesidad'
import { guardarNecesidad, inventarioQueCumple, vigente, COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'

// Necesidades del comprador (Documento Maestro V8, Parte 1, §19).
//
// GET  comprador → sus fichas y su BANDEJA (§19.4): todas sus opciones en un solo lugar, con la
//                  etiqueta de origen: propuesta por broker verificado, certificada, particular o
//                  de portal (no certificada).
//      broker    → el PANEL DE NECESIDADES (§19.3): fichas vigentes publicadas, ANÓNIMAS (sin nombre
//                  ni contacto del comprador: §19.5 regla 2), con las propiedades de su cartera que
//                  cumplen cada ficha y cuántas propuestas lleva.
// POST comprador → una ficha nueva (hasta 3 activas).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

interface ActivoPublico {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null
  superficie: number | null; precio_total: number | null; broker_id: string | null; status: string | null
}

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (s.rol === 'broker') {
      const { data } = await s.admin.from('necesidades').select(COLS_NECESIDAD)
        .eq('es_demo', s.esDemo).eq('activa', true).eq('publicada_brokers', true)
        .gt('vence_at', new Date().toISOString()).order('created_at', { ascending: false })
      const N = (data as FilaNecesidad[]) || []
      const [{ data: activos }, { data: props }] = await Promise.all([
        s.admin.from('activos').select('id, nombre, tipo, municipio, colonia, superficie, precio_total, broker_id, status')
          .eq('broker_id', s.uid).neq('status', 'cerrado'),
        N.length ? s.admin.from('propuestas').select('necesidad_id, activo_id, broker_id, precio_mercado').in('necesidad_id', N.map((n) => n.id)) : Promise.resolve({ data: [] }),
      ])
      const A = (activos as ActivoPublico[]) || []
      const P = (props as { necesidad_id: string; activo_id: string; broker_id: string; precio_mercado: { semaforo?: { estado: string | null; texto: string } } | null }[]) || []
      const misZonas = new Set(A.map((a) => municipioCanonico(a.municipio)))
      const orden = { ya: 0, '3_meses': 1, '6_meses': 2, explorando: 3 } as Record<string, number>

      const panel = N.map((n) => {
        const mias = P.filter((p) => p.necesidad_id === n.id && p.broker_id === s.uid).map((p) => p.activo_id)
        return {
          id: n.id, resumen: resumenNecesidad(n), detalle: detalleCaracteristicas(n), tipo: n.tipo,
          proposito: n.proposito, plazo: n.plazo, created_at: n.created_at,
          enMiZona: misZonas.has(municipioCanonico(n.municipio)),
          propuestasTotal: P.filter((p) => p.necesidad_id === n.id).length,
          misPropuestas: mias,
          // §20.5 regla 4: de su propuesta, el broker ve solo el precio contra mercado.
          detallePropuestas: P.filter((p) => p.necesidad_id === n.id && p.broker_id === s.uid).map((p) => ({
            activoId: p.activo_id, nombre: A.find((a) => a.id === p.activo_id)?.nombre ?? 'Tu propiedad',
            precioMercado: p.precio_mercado?.semaforo ?? null,
          })),
          puedeProponer: mias.length < MAX_PROPUESTAS_POR_BROKER,
          compatibles: A.filter((a) => !mias.includes(a.id) && cumpleNecesidad(a, n).cumple)
            .map((a) => ({ activoId: a.id, nombre: a.nombre, precio_total: a.precio_total, superficie: a.superficie })),
        }
      }).sort((x, y) => Number(y.enMiZona) - Number(x.enMiZona) || (orden[x.plazo ?? 'explorando'] - orden[y.plazo ?? 'explorando']))
      return NextResponse.json({ necesidades: panel })
    }

    if (s.rol !== 'inversionista') return NextResponse.json({ error: 'Solo para compradores y brokers' }, { status: 403 })

    const [{ data: data }, { data: perfil }] = await Promise.all([
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('usuario_id', s.uid).order('created_at', { ascending: false }),
      s.admin.from('perfiles_intencion').select('id, representado_por').eq('usuario_id', s.uid).maybeSingle(),
    ])
    const N = (data as FilaNecesidad[]) || []
    const p = perfil as { id: string; representado_por: string | null } | null
    const conBroker = !!p?.representado_por

    // Propuestas de brokers: la propiedad (columnas públicas), el broker con su nivel y si está certificada.
    const { data: props } = N.length
      ? await s.admin.from('propuestas').select('necesidad_id, activo_id, broker_id, created_at').in('necesidad_id', N.map((n) => n.id))
      : { data: [] }
    const P = (props as { necesidad_id: string; activo_id: string; broker_id: string; created_at: string }[]) || []
    const idsProp = [...new Set(P.map((x) => x.activo_id))]
    const [{ data: activosProp }, { data: certs }, brokers] = await Promise.all([
      idsProp.length ? s.admin.from('activos').select('id, nombre, tipo, municipio, colonia, superficie, precio_total, broker_id, status').in('id', idsProp) : Promise.resolve({ data: [] }),
      idsProp.length ? s.admin.from('certificaciones').select('activo_id').eq('estado', 'certificada').in('activo_id', idsProp) : Promise.resolve({ data: [] }),
      P.length ? perfilesBrokers(s.admin, s.esDemo) : Promise.resolve([]),
    ])
    const activoDe = new Map(((activosProp as ActivoPublico[]) || []).map((a) => [a.id, a]))
    const certificadas = new Set(((certs as { activo_id: string }[]) || []).map((c) => c.activo_id))
    const brokerDe = new Map(brokers.map((b) => [b.id, b]))

    type Opcion = {
      clave: string; origen: 'broker' | 'certificada' | 'particular' | 'portal'; titulo: string; tipo: string | null
      municipio: string | null; precio: number | null; superficie: number | null; url?: string; fuente?: string
      broker?: { nombre: string; nivel: string }; certificada?: boolean; activoId?: string; necesidadId?: string
      opcionId?: string; anuncioId?: string; lectura?: string | null; colonia?: string | null
    }
    const bandeja: Opcion[] = []
    const vistos = new Set<string>()
    for (const x of P.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const a = activoDe.get(x.activo_id)
      if (!a || a.status === 'cerrado' || vistos.has(a.id)) continue
      vistos.add(a.id)
      const b = brokerDe.get(x.broker_id)
      bandeja.push({
        clave: `p:${a.id}`, origen: 'broker', titulo: a.nombre, tipo: a.tipo, municipio: a.municipio, precio: a.precio_total,
        superficie: a.superficie, broker: { nombre: b?.nombre ?? 'Broker verificado', nivel: b?.nivel.nombre ?? '' },
        certificada: certificadas.has(a.id), activoId: a.id, necesidadId: x.necesidad_id,
      })
    }
    // Búsqueda directa en la plataforma (camino A). Por su cuenta solo particulares; con broker, toda la red (V7.2).
    for (const n of N.filter((n) => vigente(n) && n.busqueda_directa)) {
      for (const o of await inventarioQueCumple(s.admin, n, { esDemo: s.esDemo, incluirBrokers: conBroker })) {
        if (vistos.has(o.activoId)) continue
        vistos.add(o.activoId)
        bandeja.push({
          clave: `a:${o.activoId}`, origen: o.certificada ? 'certificada' : 'particular', titulo: o.nombre, tipo: o.tipo,
          municipio: o.municipio, precio: o.precio_total, superficie: o.superficie, certificada: o.certificada,
          activoId: o.activoId, necesidadId: n.id,
        })
      }
    }
    // Anuncios de portales del Radar (los del motor, los que pegó él y los que agregó Operación).
    if (p) {
      const { data: radar } = await s.admin.from('radar_opciones')
        .select('id, anuncio_id, radar_anuncios(url, fuente, titulo, precio, superficie, tipo, municipio, colonia, lectura)').eq('perfil_id', p.id).order('created_at', { ascending: false }).limit(20)
      type Anuncio = { url: string; fuente: string; titulo: string | null; precio: number | null; superficie: number | null; tipo: string | null; municipio: string | null; colonia: string | null; lectura: string | null }
      for (const o of (radar as unknown as { id: string; anuncio_id: string; radar_anuncios: Anuncio }[]) || []) {
        const a = o.radar_anuncios
        // V8 (opción 2): lo leído de la página o capturado por el comprador; con precio y m² se analiza.
        bandeja.push({
          clave: `r:${o.id}`, origen: 'portal', titulo: a.titulo || a.url, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia,
          precio: a.precio, superficie: a.superficie, url: a.url, fuente: a.fuente, opcionId: o.id, anuncioId: o.anuncio_id, lectura: a.lectura,
        })
      }
    }

    const { data: an } = await s.admin.from('analisis').select('activo_id, anuncio_id').eq('usuario_id', s.uid).eq('descartado', false)
    return NextResponse.json({
      conBroker,
      analizados: [...new Set(((an as { activo_id: string | null; anuncio_id: string | null }[]) || []).map((x) => (x.activo_id ?? x.anuncio_id)!))],
      necesidades: N.map((n) => ({
        id: n.id, resumen: resumenNecesidad(n), detalle: detalleCaracteristicas(n), activa: n.activa, vigente: vigente(n),
        vence_at: n.vence_at, busqueda_directa: n.busqueda_directa, publicada_brokers: n.publicada_brokers,
        propuestas: P.filter((x) => x.necesidad_id === n.id).length,
      })),
      bandeja,
    })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'inversionista') return NextResponse.json({ error: 'Solo los compradores crean búsquedas' }, { status: 403 })
    const r = validarNecesidad(await req.json().catch(() => ({})))
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    const g = await guardarNecesidad(s.admin, s.uid, r.necesidad, { esDemo: s.esDemo })
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    return NextResponse.json({ ok: true, id: g.id })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
