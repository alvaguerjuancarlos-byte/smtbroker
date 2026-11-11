// Pruebas del análisis para el comprador (Documento Maestro V8, Parte 2).
// Uso: node --test lib/analisis.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precioContraMercado, proyectarPlusvalia, cumplimientoFicha, costoTotalCompra, mensualidadCredito, rendimientoRenta } from './analisis.ts'
import { validarNecesidad, type Necesidad } from './necesidad.ts'
import type { PrecioMercado } from './precioMercado.ts'

const mercado: PrecioMercado = {
  comparablesUsados: 5, outliersExcluidos: 1, precioPromedioM2Zona: 7000,
  rangoMinMXN: 6_500_000, rangoMaxMXN: 7_500_000, precioSalidaRecomendadoMXN: 7_000_000, percentilPosicionamiento: 60,
}

test('semáforo: arriba, en línea y abajo, con margen de negociación', () => {
  const arriba = precioContraMercado(8_000_000, mercado)
  assert.equal(arriba.estado, 'arriba')
  assert.equal(arriba.diferenciaPct, 14.3)
  assert.equal(arriba.margenNegociacionMXN, 1_000_000)
  assert.equal(precioContraMercado(7_200_000, mercado).estado, 'en_linea')
  const abajo = precioContraMercado(6_000_000, mercado)
  assert.equal(abajo.estado, 'abajo')
  assert.equal(abajo.margenNegociacionMXN, null)
})

test('semáforo: sin comparables o sin precio no inventa nada', () => {
  const sin = precioContraMercado(7_000_000, { ...mercado, comparablesUsados: 1, rangoMinMXN: null, rangoMaxMXN: null, precioSalidaRecomendadoMXN: null })
  assert.equal(sin.estado, null)
  assert.match(sin.texto, /Sin dato: solo 1 comparable de tamaño parecido/)
  assert.equal(precioContraMercado(null, mercado).estado, null)
})

test('plusvalía a 3 y 5 años, compuesta', () => {
  const [a3, a5] = proyectarPlusvalia(9.6, 6.3, 15.7)
  assert.deepEqual(a3, { anios: 3, pct: 31.7, min: 20.1, max: 54.9 })
  assert.equal(a5.pct, 58.1)
})

const bodega = (validarNecesidad({
  tipo: 'bodega', municipio: 'Apodaca', presupuesto_min: 6e6, presupuesto_max: 8e6,
  caracteristicas: { m2_min: 1000, andenes: 2, extras: ['Piso industrial'] },
}) as { necesidad: Necesidad }).necesidad

test('cumplimiento: verifica lo que trae la propiedad y deja por confirmar lo demás', () => {
  const r = cumplimientoFicha({ tipo: 'Bodega', municipio: 'Apodaca', colonia: null, precio_total: 7_500_000, superficie: 1100 }, bodega)
  assert.equal(r.verificables, 4)
  assert.equal(r.cumple, 4)
  assert.deepEqual(r.criterios.filter((c) => c.estado === 'por_confirmar').map((c) => c.criterio), ['Andenes de carga', 'Imprescindibles'])
  const caro = cumplimientoFicha({ tipo: 'Bodega', municipio: 'Apodaca', colonia: null, precio_total: 8_600_000, superficie: 950 }, bodega)
  assert.equal(caro.cumple, 2)
  assert.match(caro.criterios.find((c) => c.criterio === 'Presupuesto')!.detalle, /7.5 % arriba de tu máximo/)
})

test('costo total, mensualidad y rendimiento por renta', () => {
  assert.deepEqual(costoTotalCompra(10_000_000, 'Nuevo León').totalMin, 10_600_000)
  assert.equal(costoTotalCompra(10_000_000, 'Jalisco').gastosMax, 900_000)
  const m = mensualidadCredito(5_000_000)
  assert.equal(m.credito, 4_000_000)
  assert.ok(m.mensualidad > 41_000 && m.mensualidad < 41_500, String(m.mensualidad))
  assert.deepEqual(rendimientoRenta(50_000, 7_500_000), { rentaMensual: 50_000, rentaAnual: 600_000, capRatePct: 8, aniosRecuperar: 12.5 })
})
