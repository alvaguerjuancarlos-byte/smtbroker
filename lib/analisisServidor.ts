// Análisis de una propiedad para el comprador: junta los datos (Documento Maestro V8, Parte 2, §20).
// SOLO servidor (supabaseAdmin). La lógica de cálculo está en lib/analisis.ts.
//
// Costo: los comparables (búsqueda + extracción con Claude) son lo caro. Se reutilizan si hay unos
// de menos de 30 días para la misma propiedad, en este orden: el diagnóstico de Mercado del dueño,
// el precio calculado al proponerla (propuestas.precio_mercado) u otro análisis.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  consultarNormativaReal, serieSHFParaCiudad, calcularApreciacionSHF, estimarPlusvaliaTramoAlto,
  SHF_NACIONAL_ECONOMICA_SOCIAL,
} from '@smt/shared-realestate'
import { leerUltimo } from '@/lib/diagnosticoGuardado'
import { buscarComparables, type Comparable, type Operacion } from '@/lib/comparables'
import { calcularPrecioMercado, type PrecioMercado } from '@/lib/precioMercado'
import {
  precioContraMercado, proyectarPlusvalia, cumplimientoFicha, costoTotalCompra, mensualidadCredito, rendimientoRenta, costoRenta,
} from '@/lib/analisis'
import { precioPara, type Necesidad, type Operacion as OperacionFicha, type OperacionActivo, type RentaActivo } from '@/lib/necesidad'

const TREINTA_DIAS = 30 * 86400_000
const reciente = (fecha: string) => Date.now() - new Date(fecha).getTime() < TREINTA_DIAS

export const COLS_ACTIVO_ANALISIS = 'id, nombre, tipo, municipio, colonia, estado, superficie, precio_total, operacion, renta_mensual, renta, broker_id, usuario_id, status, es_demo, lat, lng'

export interface ActivoParaAnalisis {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; estado: string
  superficie: number | null; precio_total: number | null; broker_id: string | null; usuario_id: string
  status: string | null; es_demo: boolean; lat: number | null; lng: number | null
  operacion?: OperacionActivo | null; renta_mensual?: number | null; renta?: RentaActivo | null
}

export interface DatosMercado {
  precio: PrecioMercado
  comparables: Comparable[]
  fuentes: string[]   // dominios consultados
  fecha: string
}

const dominio = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

async function comparablesGuardados(admin: SupabaseClient, activoId: string, operacion: Operacion): Promise<{ comparables: Comparable[]; fecha: string } | null> {
  if (operacion === 'venta') {
    const d = await leerUltimo(admin, activoId, 'mercado')
    if (d && reciente(d.fecha) && Array.isArray(d.resultado.comparables)) return { comparables: d.resultado.comparables as Comparable[], fecha: d.fecha }
    const { data: p } = await admin.from('propuestas').select('precio_mercado').eq('activo_id', activoId).not('precio_mercado', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const pm = (p as { precio_mercado: (DatosMercado & { operacion?: Operacion }) | null } | null)?.precio_mercado
    // V9: la propuesta a una ficha de renta guarda comparables de renta; esos no sirven para la venta.
    if (pm && pm.operacion !== 'renta' && reciente(pm.fecha)) return { comparables: pm.comparables, fecha: pm.fecha }
  }
  const { data: a } = await admin.from('analisis').select('resultado, created_at').eq('activo_id', activoId)
    .order('created_at', { ascending: false }).limit(5)
  for (const x of (a as { resultado: Record<string, { comparables?: Comparable[]; fecha?: string } | null>; created_at: string }[]) || []) {
    const bloque = operacion === 'venta' ? x.resultado.mercado : x.resultado.renta
    if (bloque?.comparables && reciente(bloque.fecha ?? x.created_at)) return { comparables: bloque.comparables, fecha: bloque.fecha ?? x.created_at }
  }
  return null
}

/** Precio (o renta mensual) contra mercado con comparables reales, reutilizando los recientes. */
export async function datosDeMercado(admin: SupabaseClient, a: ActivoParaAnalisis, operacion: Operacion = 'venta'): Promise<DatosMercado> {
  const guardados = await comparablesGuardados(admin, a.id, operacion)
  const { comparables, fecha, fuentes } = guardados
    ? { ...guardados, fuentes: [...new Set(guardados.comparables.map((c) => dominio(c.url)))] }
    : await buscarComparables(a, operacion).then((r) => ({
      comparables: r.comparables, fecha: new Date().toISOString(), fuentes: [...new Set(r.fuentesConsultadas.map((f) => dominio(f.url)))],
    }))
  const precio = calcularPrecioMercado(comparables, a.superficie, operacion === 'venta' ? a.precio_total : null,
    operacion === 'renta' ? { total: 1_000, m2: 1 } : undefined)
  return { precio, comparables: comparables.slice(0, 8), fuentes, fecha }
}

/**
 * Plusvalía (§20.1): mismo motor que SMT Land. La tasa real del Índice SHF nacional económica-social
 * × beta de la banda alta, y el índice regional (ZM Monterrey) como contexto. El SHF mide vivienda:
 * para bodegas, oficinas, locales y terrenos es una referencia, y así se dice.
 */
export function plusvaliaDe(municipio: string, tipo: string) {
  const anualNacional = calcularApreciacionSHF(SHF_NACIONAL_ECONOMICA_SOCIAL).find((v) => v.ventana === 'anual')?.tasaAnualizada
  if (anualNacional == null) return null
  const e = estimarPlusvaliaTramoAlto(anualNacional, 'Índice SHF nacional (vivienda)', SHF_NACIONAL_ECONOMICA_SOCIAL.length)
  const serie = serieSHFParaCiudad(municipio)
  const regional = serie ? calcularApreciacionSHF(serie.serie).find((v) => v.ventana === 'anual')?.tasaAnualizada ?? null : null
  const esVivienda = /casa|depa/i.test(tipo)
  return {
    tasaAnual: e.tasaAnualizadaEstimada, min: e.rangoMin, max: e.rangoMax,
    horizontes: proyectarPlusvalia(e.tasaAnualizadaEstimada, e.rangoMin, e.rangoMax),
    fuente: `Índice SHF de Precios de la Vivienda (Sociedad Hipotecaria Federal), ${anualNacional} % anual × beta ${e.betaUsado.toFixed(2)}`,
    regional: serie && regional != null ? { fuente: serie.nombre, anual: regional } : null,
    nota: esVivienda ? 'Proyección, no un dato real.' : 'Proyección con el índice de vivienda como referencia: no hay índice oficial para este tipo de propiedad.',
  }
}

/** Uso de suelo oficial (§20.2, terrenos). Hoy solo hay GIS municipal en San Pedro Garza García. */
async function usoDeSuelo(a: ActivoParaAnalisis) {
  const esSanPedro = /san\s*pedro/i.test(a.municipio || '')
  if (!esSanPedro) return { disponible: false, texto: `Sin GIS oficial para ${a.municipio}: el uso de suelo se confirma con la certificación.` }
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number') return { disponible: false, texto: 'La propiedad no tiene ubicación en el mapa: el uso de suelo se confirma con la certificación.' }
  const gis = await consultarNormativaReal(a.lat, a.lng).catch(() => null)
  if (!gis?.uso) return { disponible: false, texto: 'El GIS municipal no respondió; inténtalo más tarde.' }
  return {
    disponible: true, fuente: 'GIS municipal de San Pedro Garza García',
    uso: gis.uso.uso, descripcion: gis.uso.descripcion, distrito: gis.uso.distrito,
    densidad: gis.densidad?.densidadCodigo ?? null, cus: gis.densidad?.cusNum ?? null,
    nivelesMax: gis.altura?.nivelesMax ?? null, alturaM: gis.altura?.alturaM ?? null,
  }
}

async function legalDe(admin: SupabaseClient, activoId: string) {
  const { data: cert } = await admin.from('certificaciones').select('estado').eq('activo_id', activoId).eq('estado', 'certificada').limit(1).maybeSingle()
  if (!cert) return { certificada: false }
  const d = await leerUltimo(admin, activoId, 'legal')
  const r = (d?.resultado ?? {}) as { verdictTitle?: string; verdictDesc?: string; rpp?: { status?: string }; usoSuelo?: { status?: string } }
  return { certificada: true, titulo: r.verdictTitle ?? null, resumen: r.verdictDesc ?? null, rpp: r.rpp?.status ?? null, usoSuelo: r.usoSuelo?.status ?? null }
}

export async function analizarPropiedad(
  admin: SupabaseClient,
  a: ActivoParaAnalisis,
  n: (Necesidad & { id: string }) | null,
  opts: { porTipo: boolean },
) {
  if (n?.operacion === 'renta') return analizarRenta(admin, a, n, opts)
  const invierte = n?.proposito === 'invertir'
  const vivienda = /casa|depa/i.test(a.tipo)
  const [venta, renta, suelo, legal] = await Promise.all([
    datosDeMercado(admin, a, 'venta'),
    opts.porTipo && invierte ? datosDeMercado(admin, a, 'renta') : Promise.resolve(null),
    opts.porTipo && /terreno/i.test(a.tipo) ? usoDeSuelo(a) : Promise.resolve(null),
    legalDe(admin, a.id),
  ])
  const rentaMensual = renta?.precio.precioSalidaRecomendadoMXN ?? null

  return {
    version: 1,
    fecha: new Date().toISOString(),
    operacion: 'compra' as OperacionFicha,
    activo: { id: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia, superficie: a.superficie, precio_total: a.precio_total, renta_mensual: null as number | null },
    mercado: { ...venta, semaforo: precioContraMercado(a.precio_total, venta.precio) },
    plusvalia: plusvaliaDe(a.municipio, a.tipo),
    cumplimiento: n ? cumplimientoFicha(a, n) : null,
    solidez: {
      comparablesVenta: venta.precio.comparablesUsados as number | null,
      comparablesRenta: renta ? renta.precio.comparablesUsados : null,
      fuentes: [...new Set([...venta.fuentes, ...(renta?.fuentes ?? [])])].slice(0, 8),
      fechaDatos: venta.fecha,
      nivel: venta.precio.comparablesUsados >= 5 ? 'alta' : venta.precio.comparablesUsados >= 3 ? 'media' : 'baja',
    },
    porTipo: opts.porTipo ? {
      costoTotal: a.precio_total ? costoTotalCompra(a.precio_total, a.estado || 'Nuevo León') : null,
      mensualidad: a.precio_total && vivienda && (n?.forma_pago === 'credito' || n?.forma_pago === 'infonavit') ? mensualidadCredito(a.precio_total) : null,
      costoRenta: null as ReturnType<typeof costoRenta> | null,
      usoSuelo: suelo,
      renta: renta ? {
        ...renta,
        rendimiento: rentaMensual && a.precio_total ? rendimientoRenta(rentaMensual, a.precio_total) : null,
        texto: rentaMensual ? null : renta.precio.comparablesUsados < 2
          ? `Sin dato: solo ${renta.precio.comparablesUsados} comparable${renta.precio.comparablesUsados === 1 ? '' : 's'} de renta de tamaño parecido.`
          : 'Sin dato: falta la superficie de la propiedad.',
      } : null,
    } : null,
    legal,
  }
}

/**
 * Análisis en renta (V9, §22.4): renta contra mercado con comparables de renta, costo de entrada y
 * costo mensual, cumplimiento con lo de renta y, para locales, oficinas y bodegas, el uso de suelo
 * para el giro (§22.6). La plusvalía no aplica: quien renta no compra.
 */
async function analizarRenta(admin: SupabaseClient, a: ActivoParaAnalisis, n: Necesidad & { id: string }, opts: { porTipo: boolean }) {
  const rentaMensual = precioPara(a, 'renta')
  const [renta, suelo, legal] = await Promise.all([
    datosDeMercado(admin, a, 'renta'),
    opts.porTipo && /local|oficina|bodega|terreno/i.test(a.tipo) ? usoDeSuelo(a) : Promise.resolve(null),
    legalDe(admin, a.id),
  ])
  const nComp = renta.precio.comparablesUsados
  return {
    version: 1,
    fecha: new Date().toISOString(),
    operacion: 'renta' as OperacionFicha,
    activo: { id: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia, superficie: a.superficie, precio_total: a.precio_total, renta_mensual: rentaMensual },
    mercado: { ...renta, semaforo: precioContraMercado(rentaMensual, renta.precio, 'renta') },
    plusvalia: null as ReturnType<typeof plusvaliaDe>,
    cumplimiento: cumplimientoFicha(a, n),
    solidez: {
      comparablesVenta: null as number | null,
      comparablesRenta: nComp as number | null,
      fuentes: renta.fuentes.slice(0, 8),
      fechaDatos: renta.fecha,
      nivel: nComp >= 5 ? 'alta' : nComp >= 3 ? 'media' : 'baja',
    },
    porTipo: opts.porTipo ? {
      costoTotal: null as ReturnType<typeof costoTotalCompra> | null,
      mensualidad: null as ReturnType<typeof mensualidadCredito> | null,
      costoRenta: rentaMensual ? costoRenta(rentaMensual, a.renta ?? null, n.renta?.garantia) : null,
      usoSuelo: suelo,
      renta: null,
    } : null,
    legal,
  }
}

export type ResultadoAnalisis = Awaited<ReturnType<typeof analizarPropiedad>>
