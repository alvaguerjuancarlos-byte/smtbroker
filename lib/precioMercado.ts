// Precio realista de reventa calculado en código, no por el LLM. Hasta 2026-11-10 el Agente de
// Mercado le pedía al modelo el rango y el precio de salida, y le pasaba el precio de lista del
// dueño en el mismo prompt: el modelo se anclaba a ese precio y en las grabaciones del video
// (1-nov) recomendó salir ARRIBA de lo pedido tres veces ($25.5M contra $24M). Ahora los números
// salen de los comparables reales: mediana y cuartiles del precio/m² × la superficie del activo.
// El precio del dueño solo se usa al final, para ubicarlo contra el mercado (percentil), nunca
// para calcular el rango.

export interface ComparableConPrecio {
  precioM2: number | null
  precioTotal: number | null
  superficieM2: number | null
}

export interface PrecioMercado {
  comparablesUsados: number
  outliersExcluidos: number // atípicos por precio/m² o de tamaño muy distinto al activo
  precioPromedioM2Zona: number | null   // mediana del precio/m² (más robusta que el promedio)
  rangoMinMXN: number | null            // percentil 25 × superficie
  rangoMaxMXN: number | null            // percentil 75 × superficie
  precioSalidaRecomendadoMXN: number | null // mediana × superficie
  percentilPosicionamiento: number | null   // % de comparables más baratos por m² que el precio del dueño
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0]
  const idx = (p / 100) * (ordenados.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo)
}

const redondear = (n: number, paso: number) => Math.round(n / paso) * paso

function precioM2De(c: ComparableConPrecio): number | null {
  if (c.precioM2 != null && c.precioM2 > 0) return c.precioM2
  if (c.precioTotal != null && c.precioTotal > 0 && c.superficieM2 != null && c.superficieM2 > 0) return c.precioTotal / c.superficieM2
  return null
}

export function calcularPrecioMercado(
  comparables: ComparableConPrecio[],
  superficieM2: number | null,
  precioListaMXN: number | null,
): PrecioMercado {
  const sup = superficieM2 != null && superficieM2 > 0 ? superficieM2 : null
  // Tamaño parecido (entre la mitad y el doble): el precio/m² de una casa de 100 m² no sirve para
  // una bodega de 900 m². Los comparables sin superficie se quedan solo si traen su precio/m².
  const conPrecio = comparables.filter((c) => precioM2De(c) != null)
  const parecidos = sup
    ? conPrecio.filter((c) => c.superficieM2 != null && c.superficieM2 > 0 ? c.superficieM2 >= sup / 2 && c.superficieM2 <= sup * 2 : c.precioM2 != null)
    : conPrecio
  let valores = parecidos.map((c) => precioM2De(c)!).sort((a, b) => a - b)
  const total = conPrecio.length

  // Outliers por IQR (1.5×) solo con 4 o más: con menos, el cuartil no dice nada.
  if (valores.length >= 4) {
    const q1 = percentil(valores, 25), q3 = percentil(valores, 75), iqr = q3 - q1
    valores = valores.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr)
  }

  const vacio: PrecioMercado = {
    comparablesUsados: valores.length, outliersExcluidos: total - valores.length,
    precioPromedioM2Zona: null, rangoMinMXN: null, rangoMaxMXN: null,
    precioSalidaRecomendadoMXN: null, percentilPosicionamiento: null,
  }
  if (valores.length < 2) return vacio

  const mediana = percentil(valores, 50)
  const p25 = percentil(valores, 25), p75 = percentil(valores, 75)
  const m2Lista = sup && precioListaMXN && precioListaMXN > 0 ? precioListaMXN / sup : null

  return {
    ...vacio,
    precioPromedioM2Zona: redondear(mediana, 100),
    rangoMinMXN: sup ? redondear(p25 * sup, 100_000) : null,
    rangoMaxMXN: sup ? redondear(p75 * sup, 100_000) : null,
    precioSalidaRecomendadoMXN: sup ? redondear(mediana * sup, 100_000) : null,
    percentilPosicionamiento: m2Lista != null ? Math.round((valores.filter((v) => v < m2Lista).length / valores.length) * 100) : null,
  }
}
