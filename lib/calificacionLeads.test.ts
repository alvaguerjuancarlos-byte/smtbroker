// Uso: node --test lib/calificacionLeads.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calificarLead } from './calificacionLeads.ts'

const PRECIO = 12_000_000

test('Serio: en presupuesto, menos de 3 meses y contado', () => {
  const r = calificarLead({ presupuesto: '$10M – $20M', plazo: 'menos_3m', formaPago: 'contado' }, PRECIO)
  assert.equal(r.categoria, 'serio')
  assert.ok(r.razones[0].includes('está en su presupuesto'))
})

test('Serio también con crédito aprobado', () => {
  assert.equal(calificarLead({ presupuesto: '$10M – $20M', plazo: 'menos_3m', formaPago: 'credito_aprobado' }, PRECIO).categoria, 'serio')
})

test('Calificado: en presupuesto y menos de 6 meses, pero crédito en trámite', () => {
  assert.equal(calificarLead({ presupuesto: '$10M – $20M', plazo: 'menos_3m', formaPago: 'credito_tramite' }, PRECIO).categoria, 'calificado')
  assert.equal(calificarLead({ presupuesto: '$10M – $20M', plazo: '3_6m', formaPago: 'contado' }, PRECIO).categoria, 'calificado')
})

test('Interesado: en presupuesto pero plazo largo, o un poco fuera', () => {
  assert.equal(calificarLead({ presupuesto: '$10M – $20M', plazo: 'mas_6m', formaPago: 'contado' }, PRECIO).categoria, 'interesado')
  // $12M contra "$5M – $10M": 20 % arriba del máximo -> fuera, pero no "muy" fuera.
  assert.equal(calificarLead({ presupuesto: '$5M – $10M', plazo: 'menos_3m', formaPago: 'contado' }, PRECIO).categoria, 'interesado')
})

test('Curioso: muy fuera del presupuesto', () => {
  const r = calificarLead({ presupuesto: 'Menos de $5M', plazo: 'menos_3m', formaPago: 'contado' }, PRECIO)
  assert.equal(r.categoria, 'curioso')
  assert.ok(r.razones[0].includes('muy fuera'))
})

test('Curioso: sin presupuesto y sin plazo', () => {
  assert.equal(calificarLead({ presupuesto: null, plazo: 'sin_definir', formaPago: 'no_se' }, PRECIO).categoria, 'curioso')
})

test('Sin presupuesto pero con plazo: Interesado (falta información)', () => {
  assert.equal(calificarLead({ presupuesto: null, plazo: 'menos_3m', formaPago: 'contado' }, PRECIO).categoria, 'interesado')
})

test('Propiedad sin precio: nunca Serio, se dice por qué', () => {
  const r = calificarLead({ presupuesto: '$10M – $20M', plazo: 'menos_3m', formaPago: 'contado' }, null)
  assert.equal(r.categoria, 'interesado')
  assert.ok(r.razones[0].includes('no tiene precio'))
})
