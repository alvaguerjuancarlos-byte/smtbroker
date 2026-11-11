// Pruebas de la conexión (Documento Maestro V8, Parte 3).
// Uso: node --test lib/conexion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rolEn, fase, validarHorarios, validarOferta, validarCalificacion, seguimientoPendiente, tocaRecordatorio, tocaComoTeFue,
  type ConexionBase,
} from './conexion.ts'

const AHORA = Date.parse('2026-11-10T18:00:00Z')
const H = 3600_000
const base: ConexionBase = {
  comprador_id: 'c', contraparte_id: 'b', broker_comprador_id: null, estado: 'activa', horarios_propuestos: [],
  visita_at: null, visita_confirmada_at: null, visita_resultado: null, oferta_at: null,
  cierre_reportado_at: null, cierre_confirmado_at: null, seguimientos_enviados: 0, created_at: '2026-11-10T00:00:00Z',
}

test('rol de cada usuario', () => {
  assert.equal(rolEn(base, 'c'), 'comprador')
  assert.equal(rolEn(base, 'b'), 'contraparte')
  assert.equal(rolEn({ ...base, broker_comprador_id: 'x' }, 'x'), 'broker_comprador')
  assert.equal(rolEn(base, 'otro'), null)
})

test('fases en orden', () => {
  assert.equal(fase({ ...base, estado: 'por_validar' }, AHORA), 'por_validar')
  assert.equal(fase(base, AHORA), 'conversando')
  assert.equal(fase({ ...base, horarios_propuestos: ['2026-11-12T16:00:00Z'] }, AHORA), 'visita_propuesta')
  const confirmada = { ...base, visita_at: '2026-11-12T16:00:00Z', visita_confirmada_at: '2026-11-10T17:00:00Z' }
  assert.equal(fase(confirmada, AHORA), 'visita_confirmada')
  assert.equal(fase(confirmada, AHORA + 3 * 24 * H), 'visita_realizada')
  assert.equal(fase({ ...confirmada, oferta_at: 'x' }, AHORA), 'oferta')
  assert.equal(fase({ ...base, cierre_reportado_at: 'x' }, AHORA), 'cierre_por_confirmar')
  assert.equal(fase({ ...base, cierre_reportado_at: 'x', cierre_confirmado_at: 'y' }, AHORA), 'cerrada')
})

test('horarios: de 1 a 3, futuros y dentro de 60 días', () => {
  const r = validarHorarios(['2026-11-12T16:00:00Z', '2026-11-11T16:00:00Z'], AHORA)
  assert.deepEqual(r, { horarios: ['2026-11-11T16:00:00.000Z', '2026-11-12T16:00:00.000Z'] })
  assert.ok('error' in validarHorarios([], AHORA))
  assert.ok('error' in validarHorarios(['a', 'b', 'c', 'd'], AHORA))
  assert.ok('error' in validarHorarios(['2026-11-10T19:00:00Z'], AHORA))
  assert.ok('error' in validarHorarios(['2027-03-01T16:00:00Z'], AHORA))
  assert.ok('error' in validarHorarios(['no es fecha'], AHORA))
})

test('oferta y calificación', () => {
  assert.deepEqual(validarOferta('7,100,000', 'contado'), { monto: 7_100_000, formaPago: 'contado' })
  assert.ok('error' in validarOferta('', 'contado'))
  assert.ok('error' in validarOferta(5e6, 'trueque'))
  assert.deepEqual(validarCalificacion({ atencion: 5, rapidez: 4, honestidad: 5, comentario: '  Muy bien ' }), { atencion: 5, rapidez: 4, honestidad: 5, comentario: 'Muy bien' })
  assert.ok('error' in validarCalificacion({ atencion: 6, rapidez: 4, honestidad: 5 }))
})

test('seguimiento a los 30, 60 y 90 días', () => {
  const dias = (d: number) => AHORA + d * 24 * H
  assert.equal(seguimientoPendiente(base, dias(29)), null)
  assert.equal(seguimientoPendiente(base, dias(31)), 30)
  assert.equal(seguimientoPendiente({ ...base, seguimientos_enviados: 1 }, dias(45)), null)
  assert.equal(seguimientoPendiente({ ...base, seguimientos_enviados: 1 }, dias(61)), 60)
  assert.equal(seguimientoPendiente({ ...base, seguimientos_enviados: 3 }, dias(200)), null)
  assert.equal(seguimientoPendiente({ ...base, cierre_reportado_at: 'x' }, dias(31)), null)
})

test('recordatorio un día antes y "¿cómo te fue?" al día siguiente', () => {
  const v = { visita_at: '2026-11-11T18:00:00Z', visita_confirmada_at: 'x', recordatorio_enviado_at: null, visita_resultado: null, como_te_fue_enviado_at: null }
  assert.equal(tocaRecordatorio(v, AHORA), true)
  assert.equal(tocaRecordatorio({ ...v, recordatorio_enviado_at: 'x' }, AHORA), false)
  assert.equal(tocaRecordatorio(v, AHORA + 20 * H), false)
  assert.equal(tocaComoTeFue(v, AHORA), false)
  assert.equal(tocaComoTeFue(v, AHORA + 40 * H), true)
})
