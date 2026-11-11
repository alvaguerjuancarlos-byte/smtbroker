// Análisis de una propiedad para el comprador (Documento Maestro V8, Parte 2, §20). Lógica pura, sin
// red ni base: los datos (comparables, índice SHF, uso de suelo) los junta lib/analisisServidor.ts.
//
//   Común a todas (§20.1): precio contra mercado con semáforo y margen de negociación, plusvalía a 3
//   y 5 años (siempre proyección), cumplimiento de la ficha y solidez del dato.
//   Por tipo y propósito (§20.2): costo total de compra y mensualidad, rendimiento por renta.
// Regla: sin datos suficientes se dice "sin dato" y por qué; nunca se rellena.
//
// V9 (§22.4), en renta: renta contra mercado (comparables de renta), costo de entrada (depósito +
// primer mes + póliza) y costo mensual total; sin plusvalía; el cumplimiento suma plazo, garantía,
// amueblada y mascotas.
//
// Sin imports de alias: se prueba con `node --test lib/analisis.test.ts`.
import type { PrecioMercado } from './precioMercado.ts'
import {
  cumpleNecesidad, etiquetaTipo, CARACTERISTICAS, CAMPO_AREA, millones, presupuestoTexto, precioPara, dinero, rentaTexto,
  PLAZOS_CONTRATO, GARANTIAS, type Necesidad, type Operacion, type OperacionDeActivo, type RentaActivo,
} from './necesidad.ts'

export type Semaforo = 'arriba' | 'en_linea' | 'abajo'

export interface PrecioContraMercado {
  estado: Semaforo | null
  texto: string
  diferenciaPct: number | null        // precio pedido contra el precio realista
  margenNegociacionMXN: number | null // cuánto arriba del precio realista está lo pedido (si lo está)
}

/**
 * Arriba si lo pedido supera el rango de comparables; abajo si queda por debajo; en línea dentro.
 * En renta (§22.4) se compara la renta mensual contra comparables de renta: "renta realista".
 */
export function precioContraMercado(precio: number | null, m: PrecioMercado, op: Operacion = 'compra'): PrecioContraMercado {
  const enRenta = op === 'renta'
  const millones = (n: number) => dinero(n, op)
  const realista = enRenta ? 'la renta realista' : 'el precio realista'
  if (!precio) return { estado: null, texto: enRenta ? 'La propiedad no tiene renta mensual publicada.' : 'La propiedad no tiene precio publicado.', diferenciaPct: null, margenNegociacionMXN: null }
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
    ? `Pide ${Math.abs(diferenciaPct)} % más que ${realista} (${millones(m.precioSalidaRecomendadoMXN)}). El mercado está ${rango}: hay margen para negociar.`
    : estado === 'abajo'
      ? `Pide ${Math.abs(diferenciaPct)} % menos que ${realista} (${millones(m.precioSalidaRecomendadoMXN)}). El mercado está ${rango}: buena oportunidad, revisa por qué.`
      : `En línea con el mercado (${rango}; ${realista.replace('la ', '').replace('el ', '')} ${millones(m.precioSalidaRecomendadoMXN)}).`
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

export interface ActivoAnalisis extends OperacionDeActivo {
  tipo: string | null
  municipio: string | null
  colonia: string | null
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

  const op = n.operacion ?? 'compra'
  const precio = precioPara(a, op)
  if (!precio) criterios.push({ criterio: 'Presupuesto', estado: 'por_confirmar', detalle: op === 'renta' ? 'Sin renta mensual publicada' : 'Sin precio publicado' })
  else {
    const f = (v: number) => dinero(v, op)
    const dentro = precio >= (n.presupuesto_min ?? 0) && precio <= n.presupuesto_max
    const pct = r1((precio / n.presupuesto_max - 1) * 100)
    criterios.push({
      criterio: 'Presupuesto', estado: dentro ? 'cumple' : 'no_cumple',
      detalle: dentro ? `${f(precio)}, dentro de ${presupuestoTexto(n)}`
        : precio > n.presupuesto_max ? `${f(precio)}: ${pct} % arriba de tu máximo` : `${f(precio)}: abajo de tu mínimo`,
    })
  }
  if (op === 'renta') criterios.push(...criteriosRenta(a.renta ?? null, n))

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

const etq = <T extends string>(l: { id: T; etiqueta: string }[], v: T | null | undefined) => l.find((x) => x.id === v)?.etiqueta ?? ''

/** Lo propio de la renta en el cumplimiento (§22.4): plazo, garantía, amueblada y mascotas. */
function criteriosRenta(r: RentaActivo | null, n: Necesidad): Criterio[] {
  const f = n.renta
  if (!f) return []
  const c: Criterio[] = []
  const porConfirmar = (criterio: string, pediste: string) => ({ criterio, estado: 'por_confirmar' as const, detalle: `Pediste: ${pediste}. Confírmalo con quien la ofrece` })
  if (f.plazo_contrato) {
    const orden = (v: string | null | undefined) => PLAZOS_CONTRATO.findIndex((x) => x.id === v)
    c.push(!r?.plazo_minimo ? porConfirmar('Plazo del contrato', etq(PLAZOS_CONTRATO, f.plazo_contrato))
      : orden(r.plazo_minimo) <= orden(f.plazo_contrato)
        ? { criterio: 'Plazo del contrato', estado: 'cumple', detalle: `Pide mínimo ${etq(PLAZOS_CONTRATO, r.plazo_minimo)}; tú, ${etq(PLAZOS_CONTRATO, f.plazo_contrato)}` }
        : { criterio: 'Plazo del contrato', estado: 'no_cumple', detalle: `Pide mínimo ${etq(PLAZOS_CONTRATO, r.plazo_minimo)}; tú buscas ${etq(PLAZOS_CONTRATO, f.plazo_contrato)}` })
  }
  if (f.garantia) {
    c.push(!r?.garantia ? porConfirmar('Garantía', etq(GARANTIAS, f.garantia).toLowerCase())
      : r.garantia === 'cualquiera' || r.garantia === f.garantia
        ? { criterio: 'Garantía', estado: 'cumple', detalle: r.garantia === 'cualquiera' ? 'Acepta cualquier garantía' : `Pide ${etq(GARANTIAS, r.garantia).toLowerCase()}, la que puedes dar` }
        : { criterio: 'Garantía', estado: 'no_cumple', detalle: `Pide ${etq(GARANTIAS, r.garantia).toLowerCase()}; tú puedes dar ${etq(GARANTIAS, f.garantia).toLowerCase()}` })
  }
  if (f.amueblada && f.amueblada !== 'indistinto') {
    const quiere = f.amueblada === 'si'
    c.push(r?.amueblada == null ? porConfirmar('Amueblada', quiere ? 'amueblada' : 'sin amueblar')
      : { criterio: 'Amueblada', estado: r.amueblada === quiere ? 'cumple' : 'no_cumple', detalle: r.amueblada ? 'Está amueblada' : 'No está amueblada' })
  }
  if (f.mascotas === true) {
    c.push(r?.mascotas == null ? porConfirmar('Mascotas', 'que acepte mascotas')
      : { criterio: 'Mascotas', estado: r.mascotas ? 'cumple' : 'no_cumple', detalle: r.mascotas ? 'Acepta mascotas' : 'No acepta mascotas' })
  }
  return c
}

// Póliza jurídica: en Monterrey cuesta alrededor de 35 % de una renta mensual, con un mínimo de unos
// $3,500 (referencia de mercado; varía por empresa y por el monto de la renta).
export const POLIZA = { pctRenta: 0.35, minimo: 3_500 }

/**
 * Costo de entrada y costo mensual de una renta (§22.4). El depósito que no está capturado se toma de
 * 1 mes y se dice; la póliza solo cuenta si la garantía que se va a dar es póliza jurídica.
 */
export function costoRenta(rentaMensual: number, r: RentaActivo | null, garantia: string | null | undefined) {
  const depositoMeses = r?.deposito_meses ?? 1
  const deposito = Math.round(rentaMensual * depositoMeses)
  const poliza = garantia === 'poliza' ? Math.max(POLIZA.minimo, Math.round(rentaMensual * POLIZA.pctRenta / 100) * 100) : null
  const mantenimiento = r?.incluye_mantenimiento ? 0 : r?.mantenimiento ?? null
  const notas = [
    r?.deposito_meses ? null : 'Depósito de 1 mes supuesto: confírmalo con quien la ofrece.',
    poliza ? `Póliza jurídica estimada en ${Math.round(POLIZA.pctRenta * 100)} % de una renta (mínimo ${rentaTexto(POLIZA.minimo).replace(' al mes', '')}); varía por empresa.` : null,
    mantenimiento == null ? 'Mantenimiento sin capturar: pregúntalo.' : null,
  ].filter(Boolean)
  return {
    depositoMeses, deposito, depositoSupuesto: !r?.deposito_meses, primerMes: Math.round(rentaMensual), poliza,
    entrada: deposito + Math.round(rentaMensual) + (poliza ?? 0),
    mantenimiento, mensual: Math.round(rentaMensual) + (mantenimiento ?? 0),
    nota: notas.join(' '),
  }
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
