// Uso: node --test lib/nivelesBroker.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularNivel } from './nivelesBroker.ts'

const nivel = (m: Parameters<typeof calcularNivel>[0]) => calcularNivel(m).actual.id

test('recién registrado es Aliado', () => {
  assert.equal(nivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 0 }), 'aliado')
})

test('Plata: 3 propiedades con la mitad documentadas', () => {
  assert.equal(nivel({ propiedades: 3, conDocumentacion: 2, cierresVerificados: 0 }), 'plata')
  assert.equal(nivel({ propiedades: 3, conDocumentacion: 1, cierresVerificados: 0 }), 'aliado')
  assert.equal(nivel({ propiedades: 2, conDocumentacion: 2, cierresVerificados: 0 }), 'aliado')
})

test('Oro: Plata + 1 cierre verificado', () => {
  assert.equal(nivel({ propiedades: 4, conDocumentacion: 2, cierresVerificados: 1 }), 'oro')
  // Un cierre sin portafolio documentado no alcanza Oro.
  assert.equal(nivel({ propiedades: 1, conDocumentacion: 0, cierresVerificados: 1 }), 'aliado')
})

test('Platino: 5 cierres y 80% documentado', () => {
  assert.equal(nivel({ propiedades: 10, conDocumentacion: 8, cierresVerificados: 5 }), 'platino')
  assert.equal(nivel({ propiedades: 10, conDocumentacion: 7, cierresVerificados: 5 }), 'oro')
})

test('Fundador garantiza al menos Plata, pero no regala Oro', () => {
  assert.equal(nivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 0, fundador: true }), 'plata')
  assert.equal(nivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 3, fundador: true }), 'plata')
  assert.equal(nivel({ propiedades: 3, conDocumentacion: 2, cierresVerificados: 1, fundador: true }), 'oro')
})

test('siguiente nivel', () => {
  assert.equal(calcularNivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 0 }).siguiente?.id, 'plata')
  assert.equal(calcularNivel({ propiedades: 10, conDocumentacion: 10, cierresVerificados: 9 }).siguiente, null)
})
