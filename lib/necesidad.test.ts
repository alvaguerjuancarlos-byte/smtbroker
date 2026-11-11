// Pruebas de la ficha de necesidad (Documento Maestro V8, Parte 1).
// Uso: node --test lib/necesidad.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarNecesidad, cumpleNecesidad, resumenNecesidad, presupuestoPerfil, type Necesidad } from './necesidad.ts'
import { parsePresupuesto } from './matching.ts'

const bodega = (extra: Record<string, unknown> = {}) => {
  const r = validarNecesidad({
    tipo: 'bodega', municipio: 'Apodaca', presupuesto_min: '6,000,000', presupuesto_max: 8_000_000,
    forma_pago: 'contado', plazo: 'ya', proposito: 'invertir',
    caracteristicas: { m2_min: '1000', andenes: 2, extras: ['Piso industrial', 'Inventado'], recamaras: 3 },
    ...extra,
  })
  assert.ok('necesidad' in r, JSON.stringify(r))
  return (r as { necesidad: Necesidad }).necesidad
}

test('validar: limpia números y descarta campos que no son del tipo', () => {
  const n = bodega()
  assert.equal(n.presupuesto_min, 6_000_000)
  assert.deepEqual(n.caracteristicas, { m2_min: 1000, andenes: 2, extras: ['Piso industrial'] })
  assert.equal(n.estado, 'Nuevo León')
  assert.equal(n.busqueda_directa, true)
  assert.equal(n.publicada_brokers, true)
})

test('validar: obligatorios y rangos', () => {
  assert.deepEqual(validarNecesidad({ municipio: 'Apodaca', presupuesto_max: 1 }), { error: 'Elige el tipo de propiedad' })
  assert.ok('error' in validarNecesidad({ tipo: 'casa', municipio: 'Ap', presupuesto_max: 5e6 }))
  assert.ok('error' in validarNecesidad({ tipo: 'casa', municipio: 'Apodaca' }))
  assert.ok('error' in validarNecesidad({ tipo: 'casa', municipio: 'Apodaca', presupuesto_min: 9e6, presupuesto_max: 5e6 }))
  assert.ok('error' in validarNecesidad({ tipo: 'casa', municipio: 'Apodaca', presupuesto_max: 5e6, busqueda_directa: false, publicada_brokers: false }))
})

test('cumple: bodega dentro de la ficha, con margen de ±10 %', () => {
  const n = bodega()
  const ok = { tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Parque Industrial', precio_total: 8_700_000, superficie: 950 }
  assert.deepEqual(cumpleNecesidad(ok, n), { cumple: true, motivos: [] })
  const r = cumpleNecesidad({ ...ok, tipo: 'Casa', municipio: 'Monterrey', precio_total: 9_000_000, superficie: 400 }, n)
  assert.equal(r.cumple, false)
  assert.equal(r.motivos.length, 4)
})

test('cumple: colonias pedidas y alias de municipio', () => {
  const n = bodega({ tipo: 'casa', municipio: 'San Pedro', colonias: ['Del Valle', 'Valle Oriente'], presupuesto_min: 15e6, presupuesto_max: 20e6, caracteristicas: {} })
  const casa = { tipo: 'Casa', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente', precio_total: 18e6, superficie: 400 }
  assert.equal(cumpleNecesidad(casa, n).cumple, true)
  assert.equal(cumpleNecesidad({ ...casa, colonia: 'Chipinque' }, n).cumple, false)
})

test('resumen de la tarjeta del panel', () => {
  assert.equal(resumenNecesidad(bodega()), 'Busca bodega · 1,000 m² · Apodaca · $6M a $8M · contado · para ya')
})

test('el presupuesto del perfil lo entiende el matching actual', () => {
  assert.deepEqual(parsePresupuesto(presupuestoPerfil({ presupuesto_min: 6e6, presupuesto_max: 8e6 })), { min: 6e6, max: 8e6 })
  assert.deepEqual(parsePresupuesto(presupuestoPerfil({ presupuesto_min: null, presupuesto_max: 2.5e6 })), { min: 0, max: 2.5e6 })
})
