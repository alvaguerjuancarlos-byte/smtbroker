import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { municipioCanonico, normalizarTipos } from '@/lib/matching'
import {
  validarNecesidad, cumpleNecesidad, resumenNecesidad, detalleCaracteristicas, MAX_PROPUESTAS_POR_BROKER,
  zonasDe, nombreZona, zonaDeActivo, puntajeOpcion, rindeDinero, precioPara, detalleRenta, detalleRentaActivo,
  type OperacionActivo, type RentaActivo, type Operacion,
} from '@/lib/necesidad'
import { guardarNecesidad, inventarioQueCumple, vigente, COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'

// V9 (§22): un anuncio de portal es de renta o de venta si su título o su liga lo dicen ("en renta",
// "/venta/", "alquiler"). Si no lo dicen (muchos títulos solo traen la colonia), null: cabe en
// cualquier ficha de su tipo y zona.
function operacionDeAnuncio(a: { url: string; titulo: string | null }): Operacion | null {
  const t = `${a.titulo ?? ''} ${a.url}`
  if (/\b(renta|rentas|alquiler|arriendo|for-rent|en-renta)\b/i.test(t)) return 'renta'
  if (/\b(venta|ventas|for-sale|en-venta)\b/i.test(t)) return 'compra'
  return null
}
const COLS_ACTIVO = 'id, nombre, tipo, municipio, colonia, superficie, precio_total, operacion, renta_mensual, renta, broker_id, status'

// Necesidades del comprador (Documento Maestro V8, Parte 1, §19).
//
// GET  comprador → sus fichas y su BANDEJA (§19.4): todas sus opciones en un solo lugar, con la
//                  etiqueta de origen: propuesta por broker verificado, certificada, particular o
//                  de portal (no certificada).
//                  V9 (§23.4): cada opción dice en qué zona de su ficha cae, su puntaje (0-100) y por
//                  qué; la pantalla muestra las 3 mejores de cada zona.
//                  V9 (§22): en una ficha de renta, `precio` es la renta mensual de la propiedad.
//      broker    → el PANEL DE NECESIDADES (§19.3): fichas vigentes publicadas, ANÓNIMAS (sin nombre
//                  ni contacto del comprador: §19.5 regla 2), con las propiedades de su cartera que
//                  cumplen cada ficha y cuántas propuestas lleva.
// POST comprador → una ficha nueva (hasta 3 activas).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

interface ActivoPublico {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null
  superficie: number | null; precio_total: number | null; broker_id: string | null; status: string | null
  operacion: OperacionActivo | null; renta_mensual: number | null; renta: RentaActivo | null
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
        s.admin.from('activos').select(COLS_ACTIVO)
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
          id: n.id, resumen: resumenNecesidad(n), detalle: [...detalleCaracteristicas(n), ...detalleRenta(n.renta)], tipo: n.tipo,
          operacion: n.operacion,
          proposito: n.proposito, plazo: n.plazo, created_at: n.created_at,
          enMiZona: zonasDe(n).some((z) => misZonas.has(municipioCanonico(z.municipio))),
          propuestasTotal: P.filter((p) => p.necesidad_id === n.id).length,
          misPropuestas: mias,
          // §20.5 regla 4: de su propuesta, el broker ve solo el precio contra mercado.
          detallePropuestas: P.filter((p) => p.necesidad_id === n.id && p.broker_id === s.uid).map((p) => ({
            activoId: p.activo_id, nombre: A.find((a) => a.id === p.activo_id)?.nombre ?? 'Tu propiedad',
            precioMercado: p.precio_mercado?.semaforo ?? null,
          })),
          puedeProponer: mias.length < MAX_PROPUESTAS_POR_BROKER,
          compatibles: A.filter((a) => !mias.includes(a.id) && cumpleNecesidad(a, n).cumple)
            .map((a) => ({ activoId: a.id, nombre: a.nombre, precio_total: a.precio_total, precio: precioPara(a, n.operacion), superficie: a.superficie })),
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
      idsProp.length ? s.admin.from('activos').select(COLS_ACTIVO).in('id', idsProp) : Promise.resolve({ data: [] }),
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
      zona?: number; puntaje?: number; razones?: string[]; operacion?: Operacion; detalleRenta?: string[]
    }
    const necesidadDe = new Map(N.map((n) => [n.id, n]))
    // Zona y puntaje contra la ficha a la que pertenece la opción (V9, §23.4).
    const ubicar = (a: Parameters<typeof puntajeOpcion>[0], necesidadId: string) => {
      const n = necesidadDe.get(necesidadId)
      if (!n) return {}
      return { zona: zonaDeActivo(a, n), ...puntajeOpcion(a, n), operacion: n.operacion }
    }
    const opDe = (necesidadId: string) => necesidadDe.get(necesidadId)?.operacion ?? 'compra'
    const bandeja: Opcion[] = []
    const vistos = new Set<string>()
    for (const x of P.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const a = activoDe.get(x.activo_id)
      if (!a || a.status === 'cerrado' || vistos.has(a.id)) continue
      vistos.add(a.id)
      const b = brokerDe.get(x.broker_id)
      bandeja.push({
        clave: `p:${a.id}`, origen: 'broker', titulo: a.nombre, tipo: a.tipo, municipio: a.municipio, precio: precioPara(a, opDe(x.necesidad_id)),
        detalleRenta: opDe(x.necesidad_id) === 'renta' ? detalleRentaActivo(a.renta) : undefined,
        superficie: a.superficie, broker: { nombre: b?.nombre ?? 'Asesor verificado', nivel: b?.nivel.nombre ?? '' },
        certificada: certificadas.has(a.id), activoId: a.id, necesidadId: x.necesidad_id, colonia: a.colonia, ...ubicar(a, x.necesidad_id),
      })
    }
    // Búsqueda directa en la plataforma (camino A). Por su cuenta solo particulares; con broker, toda la red (V7.2).
    for (const n of N.filter((n) => vigente(n) && n.busqueda_directa)) {
      for (const o of await inventarioQueCumple(s.admin, n, { esDemo: s.esDemo, incluirBrokers: conBroker })) {
        if (vistos.has(o.activoId)) continue
        vistos.add(o.activoId)
        bandeja.push({
          clave: `a:${o.activoId}`, origen: o.certificada ? 'certificada' : 'particular', titulo: o.nombre, tipo: o.tipo,
          municipio: o.municipio, precio: o.precio, superficie: o.superficie, certificada: o.certificada, operacion: n.operacion, detalleRenta: o.detalleRenta,
          activoId: o.activoId, necesidadId: n.id, colonia: o.colonia, zona: o.zona, puntaje: o.puntaje, razones: o.razones,
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
        // V9: el anuncio va a la búsqueda vigente más reciente del mismo tipo en cuya zona cae.
        const dueña = N.find((n) => vigente(n) && (operacionDeAnuncio(a) ?? n.operacion) === n.operacion && (!a.tipo || normalizarTipos(a.tipo).has(n.tipo))
          && zonaDeActivo({ municipio: a.municipio, colonia: a.colonia }, n) >= 0)
        bandeja.push({
          // El precio leído del anuncio es el de su operación: renta mensual si es de renta.
          ...(dueña ? { necesidadId: dueña.id, ...ubicar({ ...a, operacion: dueña.operacion === 'renta' ? 'renta' : 'venta', precio_total: a.precio, renta_mensual: a.precio }, dueña.id) } : {}),
          clave: `r:${o.id}`, origen: 'portal', titulo: a.titulo || `Anuncio de ${a.fuente}`, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia,
          precio: a.precio, superficie: a.superficie, url: a.url, fuente: a.fuente, opcionId: o.id, anuncioId: o.anuncio_id, lectura: a.lectura,
        })
      }
    }

    const { data: an } = await s.admin.from('analisis').select('activo_id, anuncio_id').eq('usuario_id', s.uid).eq('descartado', false)
    return NextResponse.json({
      conBroker,
      analizados: [...new Set(((an as { activo_id: string | null; anuncio_id: string | null }[]) || []).map((x) => (x.activo_id ?? x.anuncio_id)!))],
      necesidades: N.map((n) => ({
        id: n.id, operacion: n.operacion, resumen: resumenNecesidad(n), detalle: [...detalleCaracteristicas(n), ...detalleRenta(n.renta)], activa: n.activa, vigente: vigente(n),
        vence_at: n.vence_at, busqueda_directa: n.busqueda_directa, publicada_brokers: n.publicada_brokers,
        propuestas: P.filter((x) => x.necesidad_id === n.id).length,
        // V9 (§23.2): sus zonas con "lo que rinde tu dinero".
        zonas: zonasDe(n).map((z) => ({
          nombre: nombreZona(z), municipio: z.municipio, precioM2: z.mercado?.precioM2 ?? null,
          comparables: z.mercado?.comparables ?? 0, rinde: rindeDinero(z.mercado?.precioM2, n),
        })),
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
