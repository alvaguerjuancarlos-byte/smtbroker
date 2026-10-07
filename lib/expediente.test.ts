// Uso: node --test lib/expediente.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentosFaltantes, listoParaCertificar, tieneEscritura, tieneDocumentacion } from './expediente.ts'

// Lo que hoy tienen las 15 propiedades de la base (defaults del formulario, 2026-10-07).
const recienCreado = { escritura_publica: null, gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'no_determinado' }

test('expediente recién creado: faltan folio, escritura, clave y uso de suelo', () => {
  assert.deepEqual(documentosFaltantes(recienCreado).map((f) => f.campo),
    ['folio_real', 'escritura_publica', 'clave_catastral', 'uso_suelo_declarado'])
  assert.equal(listoParaCertificar(recienCreado), false)
})

test('expediente completo: listo para certificar', () => {
  const completo = {
    folio_real: '12345', escritura_publica: 'si', clave_catastral: '01-001-001',
    gravamenes_conocidos: 'hipotecario', uso_suelo_declarado: 'habitacional',
  }
  assert.deepEqual(documentosFaltantes(completo), [])
  assert.equal(listoParaCertificar(completo), true)
})

test('"no sé" en gravámenes cuenta como faltante; "ninguno" no', () => {
  assert.ok(documentosFaltantes({ gravamenes_conocidos: 'no_sabe' }).some((f) => f.campo === 'gravamenes_conocidos'))
  assert.ok(!documentosFaltantes({ gravamenes_conocidos: 'ninguno' }).some((f) => f.campo === 'gravamenes_conocidos'))
})

test('escritura: "no" y "no_sabe" no cuentan; "si" o un dato capturado sí', () => {
  assert.equal(tieneEscritura('no'), false)
  assert.equal(tieneEscritura('no_sabe'), false)
  assert.equal(tieneEscritura(''), false)
  assert.equal(tieneEscritura('si'), true)
  assert.equal(tieneEscritura('Escritura 4521, Notaría 12'), true)
})

test('documentada (niveles): folio real o escritura declarada; escritura "no" no cuenta', () => {
  assert.equal(tieneDocumentacion({ folio_real: '123', escritura_publica: null }), true)
  assert.equal(tieneDocumentacion({ folio_real: '  ', escritura_publica: 'si' }), true)
  assert.equal(tieneDocumentacion({ folio_real: null, escritura_publica: 'no' }), false)
})
