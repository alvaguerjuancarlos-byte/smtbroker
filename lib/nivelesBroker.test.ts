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

test('Pionero garantiza al menos Plata, pero no regala Oro', () => {
  assert.equal(nivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 0, pionero: true }), 'plata')
  assert.equal(nivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 3, pionero: true }), 'plata')
  assert.equal(nivel({ propiedades: 3, conDocumentacion: 2, cierresVerificados: 1, pionero: true }), 'oro')
})

test('siguiente nivel', () => {
  assert.equal(calcularNivel({ propiedades: 0, conDocumentacion: 0, cierresVerificados: 0 }).siguiente?.id, 'plata')
  assert.equal(calcularNivel({ propiedades: 10, conDocumentacion: 10, cierresVerificados: 9 }).siguiente, null)
})

test('las metas reproducen exactamente las reglas de nivel originales', () => {
  // Reglas tal como estaban escritas antes de definir los niveles por metas (2026-10-07).
  const pct = (p: number, d: number) => (p ? d / p : 0)
  const base = (p: number, d: number) => p >= 3 && pct(p, d) >= 0.5
  const original = (p: number, d: number, c: number) =>
    c >= 5 && pct(p, d) >= 0.8 ? 'platino' : base(p, d) && c >= 1 ? 'oro' : base(p, d) ? 'plata' : 'aliado'
  for (let p = 0; p <= 12; p++) for (let d = 0; d <= p; d++) for (let c = 0; c <= 7; c++) {
    assert.equal(nivel({ propiedades: p, conDocumentacion: d, cierresVerificados: c }), original(p, d, c), `p=${p} d=${d} c=${c}`)
  }
})

test('progreso: el siguiente nivel dice exactamente qué falta', () => {
  const { actual, siguiente } = calcularNivel({ propiedades: 4, conDocumentacion: 2, cierresVerificados: 0 })
  assert.equal(actual.id, 'plata')
  const metas = siguiente!.metas({ propiedades: 4, conDocumentacion: 2, cierresVerificados: 0 })
  const pendientes = metas.filter((x) => x.actual < x.meta)
  assert.deepEqual(pendientes.map((x) => [x.etiqueta, x.actual, x.meta]), [['Cierres verificados', 0, 1]])
})
