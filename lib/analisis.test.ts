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

// ── V9 §22.4: análisis en renta ───────────────────────────────────────────────────────────────
import { costoRenta } from './analisis.ts'
import { validarNecesidad as vn } from './necesidad.ts'

test('renta: costo de entrada, costo mensual y supuestos a la vista', () => {
  const c = costoRenta(30000, { incluye_mantenimiento: false, mantenimiento: 2500, deposito_meses: 2, plazo_minimo: null, garantia: 'cualquiera', amueblada: null, mascotas: null }, 'poliza')
  assert.deepEqual([c.deposito, c.primerMes, c.poliza, c.entrada, c.mensual], [60000, 30000, 10500, 100500, 32500])
  const s = costoRenta(8000, null, 'aval')
  assert.equal(s.depositoSupuesto, true); assert.equal(s.poliza, null); assert.equal(s.entrada, 16000)
  assert.match(s.nota, /Depósito de 1 mes supuesto/); assert.match(s.nota, /Mantenimiento sin capturar/)
  assert.equal(costoRenta(8000, null, 'poliza').poliza, 3500) // mínimo
})

test('renta: renta contra mercado y cumplimiento con plazo, garantía, amueblada y mascotas', () => {
  const m = { precioSalidaRecomendadoMXN: 30000, rangoMinMXN: 27000, rangoMaxMXN: 33000, comparablesUsados: 5, precioPromedioM2Zona: 300 }
  const s = precioContraMercado(36000, m as never, 'renta')
  assert.equal(s.estado, 'arriba')
  assert.match(s.texto, /^Pide 20 % más que la renta realista \(\$30,000 al mes\)/)
  const r = vn({ operacion: 'renta', tipo: 'departamento', municipio: 'Monterrey', presupuesto_max: 35000,
    renta: { plazo_contrato: '1_anio', garantia: 'poliza', amueblada: 'si', mascotas: true } })
  assert.ok('necesidad' in r)
  const c = cumplimientoFicha({ tipo: 'Departamento', municipio: 'Monterrey', colonia: null, superficie: null, precio_total: null, operacion: 'renta', renta_mensual: 30000,
    renta: { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '2_3_anios', garantia: 'cualquiera', amueblada: null, mascotas: true } }, r.necesidad)
  const e = Object.fromEntries(c.criterios.map((x) => [x.criterio, x.estado]))
  assert.deepEqual(e, { Tipo: 'cumple', 'Ubicación': 'cumple', Presupuesto: 'cumple', 'Plazo del contrato': 'no_cumple', 'Garantía': 'cumple', Amueblada: 'por_confirmar', Mascotas: 'cumple' })
  assert.equal(c.criterios.find((x) => x.criterio === 'Presupuesto').detalle, '$30,000 al mes, dentro de hasta $35,000 al mes')
})
