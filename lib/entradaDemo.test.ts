import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUsuario, validarUsuario, sugerirUsuario, esTelefono, validarContactos, diezDigitos } from './entradaDemo.ts'

test('entrada demo: el usuario se normaliza y se valida', () => {
  assert.equal(normalizarUsuario('  @Patricia Longoria '), 'patricia.longoria')
  assert.equal(normalizarUsuario('Begoña'), 'begona')
  assert.equal(validarUsuario('patricia.longoria'), null)
  assert.equal(validarUsuario('diego_salinas-2'), null)
  assert.ok(validarUsuario('pa'))
  assert.ok(validarUsuario('.patricia'))
  assert.ok(validarUsuario('patri cia'))
  assert.ok(validarUsuario('a'.repeat(31)))
})

test('entrada demo: sugiere el usuario a partir del nombre', () => {
  assert.equal(sugerirUsuario('Patricia Longoria'), 'patricia.longoria')
  assert.equal(sugerirUsuario('José Ángel de la Garza'), 'jose.angel')
  assert.equal(sugerirUsuario('  Laura  '), 'laura')
})

test('entrada demo: distingue teléfono de usuario', () => {
  assert.ok(esTelefono('81 8765 4321'))
  assert.ok(esTelefono('+52 (81) 8765-4321'))
  assert.ok(!esTelefono('patricia.longoria'))
  assert.ok(!esTelefono('8187'))
  assert.equal(diezDigitos('+52 81 8765 4321'), '8187654321')
})

test('entrada demo: pide al menos un contacto, bien escrito', () => {
  const v = { whatsapp: '', telefono: '', correo: '' }
  assert.ok(validarContactos(v))
  assert.equal(validarContactos({ ...v, whatsapp: '81 8765 4321' }), null)
  assert.equal(validarContactos({ ...v, correo: 'patricia@correo.mx' }), null)
  assert.ok(validarContactos({ ...v, telefono: '8187' }))
  assert.ok(validarContactos({ ...v, correo: 'patricia@' }))
})
