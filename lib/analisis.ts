// Análisis de una propiedad para el comprador (Documento Maestro V8, Parte 2, §20). Lógica pura, sin
// red ni base: los datos (comparables, índice SHF, uso de suelo) los junta lib/analisisServidor.ts.
//
//   Común a todas (§20.1): precio contra mercado con semáforo y margen de negociación, plusvalía a 3
//   y 5 años (siempre proyección), cumplimiento de la ficha y solidez del dato.
//   Por tipo y propósito (§20.2): costo total de compra y mensualidad, rendimiento por renta.
// Regla: sin datos suficientes se dice "sin dato" y por qué; nunca se rellena.
//
// Sin imports de alias: se prueba con `node --test lib/analisis.test.ts`.
import type { PrecioMercado } from './precioMercado.ts'
import { cumpleNecesidad, etiquetaTipo, CARACTERISTICAS, CAMPO_AREA, millones, presupuestoTexto, type Necesidad } from './necesidad.ts'

export type Semaforo = 'arriba' | 'en_linea' | 'abajo'

export interface PrecioContraMercado {
  estado: Semaforo | null
  texto: string
  diferenciaPct: number | null        // precio pedido contra el precio realista
  margenNegociacionMXN: number | null // cuánto arriba del precio realista está lo pedido (si lo está)
}

/** Arriba si lo pedido supera el rango de comparables; abajo si queda por debajo; en línea dentro. */
export function precioContraMercado(precio: number | null, m: PrecioMercado): PrecioContraMercado {
  if (!precio) return { estado: null, texto: 'La propiedad no tiene precio publicado.', diferenciaPct: null, margenNegociacionMXN: null }
  if (m.rangoMinMXN == null || m.rangoMaxMXN == null || m.precioSalidaRecomendadoMXN == null) {
    return {
      estado: null, diferenciaPct: null, margenNegociacionMXN: null,
      texto: m.comparablesUsados < 2
        ? `Sin dato: solo ${m.comparablesUsados} comparable${m.comparablesUsados === 1 ? '' : 's'} de tamaño parecido en la zona (hacen falta al menos 2).`
        : 'Sin dato: falta la superficie de la propiedad para comparar.',
    }
  }
  const diferenciaPct = Math.round((precio / m.precioSalidaRecomendadoMXN - 1) * 1000) / 10
  const estado: Semaforo = precio > m.rangoMaxMXN ? 'arriba' : precio < m.rangoMinMXN ? 'abajo' : 'en_linea'
  const margen = precio > m.precioSalidaRecomendadoMXN ? precio - m.precioSalidaRecomendadoMXN : null
  // Si el rango redondeado da la misma cifra, "entre $24.3M y $24.3M" no dice nada.
  const rango = millones(m.rangoMinMXN) === millones(m.rangoMaxMXN)
    ? `alrededor de ${millones(m.rangoMinMXN)}` : `entre ${millones(m.rangoMinMXN)} y ${millones(m.rangoMaxMXN)}`
  const texto = estado === 'arriba'
    ? `Pide ${Math.abs(diferenciaPct)} % más que el precio realista (${millones(m.precioSalidaRecomendadoMXN)}). El mercado está ${rango}: hay margen para negociar.`
    : estado === 'abajo'
      ? `Pide ${Math.abs(diferenciaPct)} % menos que el precio realista (${millones(m.precioSalidaRecomendadoMXN)}). El mercado está ${rango}: buena oportunidad, revisa por qué.`
      : `En línea con el mercado (${rango}; precio realista ${millones(m.precioSalidaRecomendadoMXN)}).`
  return { estado, texto, diferenciaPct, margenNegociacionMXN: margen }
}

export interface Horizonte { anios: number; pct: number; min: number; max: number }

export const crecimientoCompuesto = (tasaAnualPct: number, anios: number) => (Math.pow(1 + tasaAnualPct / 100, anios) - 1) * 100
const r1 = (n: number) => Math.round(n * 10) / 10

/** Plusvalía acumulada a 3 y 5 años, con su rango (§20.1). Siempre se muestra como proyección. */
export function proyectarPlusvalia(tasa: number, min: number, max: number): Horizonte[] {
  return [3, 5].map((anios) => ({
    anios, pct: r1(crecimientoCompuesto(tasa, anios)), min: r1(crecimientoCompuesto(min, anios)), max: r1(crecimientoCompuesto(max, anios)),
  }))
}

export type EstadoCriterio = 'cumple' | 'no_cumple' | 'por_confirmar'
export interface Criterio { criterio: string; estado: EstadoCriterio; detalle: string }

export interface ActivoAnalisis {
  tipo: string | null
  municipio: string | null
  colonia: string | null
  precio_total: number | null
  superficie: number | null
}

/**
 * "Cumple 4 de 5" (§20.1): tipo, ubicación, presupuesto y superficie se revisan con los datos de la
 * propiedad; las demás características de la ficha (recámaras, andenes, altura…) quedan "por
 * confirmar" con quien la ofrece, porque la propiedad no las trae capturadas.
 */
export function cumplimientoFicha(a: ActivoAnalisis, n: Necesidad): { cumple: number; verificables: number; criterios: Criterio[] } {
  const motivos = cumpleNecesidad(a, n).motivos
  const falla = (inicio: string) => motivos.find((m) => m.startsWith(inicio))
  const criterios: Criterio[] = []
  const fTipo = falla('No es ')
  criterios.push({ criterio: 'Tipo', estado: fTipo ? 'no_cumple' : 'cumple', detalle: fTipo ?? etiquetaTipo(n.tipo) })
  const fLugar = falla('No está en')
  criterios.push({ criterio: 'Ubicación', estado: fLugar ? 'no_cumple' : 'cumple', detalle: fLugar ?? [a.colonia, a.municipio].filter(Boolean).join(', ') })

  if (!a.precio_total) criterios.push({ criterio: 'Presupuesto', estado: 'por_confirmar', detalle: 'Sin precio publicado' })
  else {
    const dentro = a.precio_total >= (n.presupuesto_min ?? 0) && a.precio_total <= n.presupuesto_max
    const pct = r1((a.precio_total / n.presupuesto_max - 1) * 100)
    criterios.push({
      criterio: 'Presupuesto', estado: dentro ? 'cumple' : 'no_cumple',
      detalle: dentro ? `${millones(a.precio_total)}, dentro de ${presupuestoTexto(n)}`
        : a.precio_total > n.presupuesto_max ? `${millones(a.precio_total)}: ${pct} % arriba de tu máximo` : `${millones(a.precio_total)}: abajo de tu mínimo`,
    })
  }

  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  if (typeof area === 'number') {
    criterios.push(!a.superficie
      ? { criterio: 'Superficie', estado: 'por_confirmar', detalle: `Pediste al menos ${area.toLocaleString('es-MX')} m²; no tiene la superficie capturada` }
      : { criterio: 'Superficie', estado: a.superficie >= area ? 'cumple' : 'no_cumple', detalle: `${a.superficie.toLocaleString('es-MX')} m² (pediste al menos ${area.toLocaleString('es-MX')} m²)` })
  }

  for (const c of CARACTERISTICAS[n.tipo]) {
    const v = n.caracteristicas[c.clave]
    if (v == null || c.clave === CAMPO_AREA[n.tipo]) continue
    const valor = Array.isArray(v) ? v.join(', ') : `${typeof v === 'number' ? v.toLocaleString('es-MX') : v}${c.unidad ? ` ${c.unidad}` : ''}`
    criterios.push({ criterio: c.etiqueta, estado: 'por_confirmar', detalle: `Pediste: ${valor}. Confírmalo con quien la ofrece` })
  }
  const verificables = criterios.filter((c) => c.estado !== 'por_confirmar')
  return { cumple: verificables.filter((c) => c.estado === 'cumple').length, verificables: verificables.length, criterios }
}

// Gastos de escrituración (ISAI, notario, registro y avalúo) como % del precio. Nuevo León ~6–8 %
// (§20.2); otros estados se usan con un rango más amplio hasta tener su tabla.
const GASTOS_POR_ESTADO: Record<string, [number, number]> = { 'Nuevo León': [0.06, 0.08] }
const GASTOS_GENERICOS: [number, number] = [0.05, 0.09]

export function costoTotalCompra(precio: number, estado: string) {
  const [gMin, gMax] = GASTOS_POR_ESTADO[estado] ?? GASTOS_GENERICOS
  return {
    gastosMin: Math.round(precio * gMin), gastosMax: Math.round(precio * gMax),
    totalMin: Math.round(precio * (1 + gMin)), totalMax: Math.round(precio * (1 + gMax)),
    nota: `Gastos de escrituración (ISAI, notario, registro y avalúo) de ${Math.round(gMin * 100)} % a ${Math.round(gMax * 100)} % del precio${GASTOS_POR_ESTADO[estado] ? ` en ${estado}` : ' (rango general; varía por estado)'}.`,
  }
}

export const SUPUESTOS_CREDITO = { enganche: 0.2, tasaAnual: 0.11, anios: 20 }

/** Mensualidad estimada de un crédito bancario (pago fijo). Supuestos visibles, no una cotización. */
export function mensualidadCredito(precio: number, s = SUPUESTOS_CREDITO) {
  const credito = precio * (1 - s.enganche)
  const i = s.tasaAnual / 12, n = s.anios * 12
  const pago = credito * i / (1 - Math.pow(1 + i, -n))
  return {
    enganche: Math.round(precio * s.enganche), credito: Math.round(credito), mensualidad: Math.round(pago),
    supuestos: `Estimación con ${s.enganche * 100} % de enganche, tasa de ${s.tasaAnual * 100} % anual a ${s.anios} años. No es una cotización.`,
  }
}

/** Rendimiento por renta (§20.2): tasa de capitalización y años para recuperar la inversión. */
export function rendimientoRenta(rentaMensual: number, precio: number) {
  const anual = rentaMensual * 12
  return { rentaMensual, rentaAnual: anual, capRatePct: r1((anual / precio) * 100), aniosRecuperar: r1(precio / anual) }
}
