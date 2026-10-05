// Pruebas del motor de matching con los formatos REALES que hay en la base (2026-10-05).
// Uso: node --test lib/matching.test.ts   (Node 24 ejecuta TypeScript nativo, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePresupuesto, normalizarTipos, normalizarZonas, puntuarMatch, esMatchValido, UMBRAL_MATCH } from './matching.ts'

test('presupuesto: formatos reales', () => {
  assert.deepEqual(parsePresupuesto('$3M - $8M'), { min: 3e6, max: 8e6 })
  assert.deepEqual(parsePresupuesto('$5M – $15M'), { min: 5e6, max: 15e6 })
  assert.deepEqual(parsePresupuesto('$10M - $30M'), { min: 10e6, max: 30e6 })
  assert.deepEqual(parsePresupuesto('Menos de $2M'), { min: 0, max: 2e6 })
  assert.deepEqual(parsePresupuesto('Más de $50M'), { min: 50e6, max: Infinity })
  assert.deepEqual(parsePresupuesto('3 a 8 millones'), { min: 3e6, max: 8e6 })
  assert.deepEqual(parsePresupuesto('hasta 500 mil'), { min: 0, max: 500e3 })
  assert.equal(parsePresupuesto(''), null)
  assert.equal(parsePresupuesto(null), null)
  assert.equal(parsePresupuesto('lo que sea'), null)
})

test('tipo: sinónimos y plurales', () => {
  assert.deepEqual(normalizarTipos('Departamentos, casas'), new Set(['departamento', 'casa']))
  assert.deepEqual(normalizarTipos('Depto'), new Set(['departamento']))
  assert.deepEqual(normalizarTipos('Locales comerciales'), new Set(['local']))
  assert.deepEqual(normalizarTipos('Local comercial'), new Set(['local']))
  assert.deepEqual(normalizarTipos('Terrenos, uso mixto'), new Set(['terreno']))
  assert.deepEqual(normalizarTipos('Edificio'), new Set(['edificio']))
  assert.deepEqual(normalizarTipos(''), new Set())
})

test('zona: municipios, varias zonas y zonas conocidas', () => {
  assert.deepEqual(normalizarZonas('San Pedro Garza García'), new Set(['San Pedro Garza García']))
  assert.deepEqual(normalizarZonas('San Pedro / Santa Catarina'), new Set(['San Pedro Garza García', 'Santa Catarina']))
  assert.deepEqual(normalizarZonas('Valle Oriente'), new Set(['San Pedro Garza García']))
  assert.deepEqual(normalizarZonas('San Pedro / Carretera Nacional'), new Set(['San Pedro Garza García', 'Monterrey']))
  assert.deepEqual(normalizarZonas('Monterrey, corredor de desarrollo'), new Set(['Monterrey']))
  assert.ok(!normalizarZonas('San Pedro Garza García').has('García'), 'Garza García no es el municipio García')
  assert.deepEqual(normalizarZonas('García, Nuevo León'), new Set(['García']))
})

test('match completo: Familia G. (cliente de Diego) con Casa Fuentes del Valle', () => {
  const perfil = { presupuesto: '$5M – $15M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Casa' }
  const activo = { tipo: 'Casa', municipio: 'San Pedro Garza García', precio_total: 14_500_000, status: 'valoracion' }
  const r = puntuarMatch(activo, perfil)
  assert.equal(r.score, 100)
  assert.ok(esMatchValido(activo, r))
  assert.ok(r.razones.some((x) => x.includes('dentro de su presupuesto')))
})

test('precio cerca del presupuesto suma la mitad', () => {
  const perfil = { presupuesto: '$5M – $15M', zona: 'San Pedro', tipo_activo_interes: 'Casa' }
  const r = puntuarMatch({ tipo: 'Casa', municipio: 'San Pedro Garza García', precio_total: 16_500_000 }, perfil)
  assert.equal(r.score, 85)
  assert.ok(r.razones.some((x) => x.includes('cerca de su presupuesto')))
})

test('sin coincidencia de tipo no es match aunque todo lo demás coincida', () => {
  const perfil = { presupuesto: '$5M – $15M', zona: 'San Pedro', tipo_activo_interes: 'Terreno' }
  const activo = { tipo: 'Casa', municipio: 'San Pedro Garza García', precio_total: 8_000_000 }
  const r = puntuarMatch(activo, perfil)
  assert.equal(r.coincideTipo, false)
  assert.equal(esMatchValido(activo, r), false)
})

test('un activo cerrado nunca es match', () => {
  const perfil = { presupuesto: '$5M – $15M', zona: 'San Pedro', tipo_activo_interes: 'Casa' }
  const activo = { tipo: 'Casa', municipio: 'San Pedro Garza García', precio_total: 8_000_000, status: 'cerrado' }
  assert.equal(esMatchValido(activo, puntuarMatch(activo, perfil)), false)
})

test('Depto vs "Departamentos, casas" en otra zona y fuera de presupuesto queda bajo el umbral', () => {
  const perfil = { presupuesto: '$3M - $8M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Departamentos, casas' }
  const r = puntuarMatch({ tipo: 'Depto', municipio: 'Apodaca', precio_total: 20_000_000 }, perfil)
  assert.equal(r.score, 40)
  assert.ok(r.score < UMBRAL_MATCH)
})

test('datos incompletos no rompen el motor', () => {
  const r = puntuarMatch({ tipo: null, municipio: null, precio_total: null }, { presupuesto: null, zona: null, tipo_activo_interes: null })
  assert.equal(r.score, 0)
  assert.equal(r.coincideTipo, false)
})
