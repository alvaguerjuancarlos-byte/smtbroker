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

// ── V9: hasta tres zonas (Documento Maestro V9, §23) ────────────────────────────────────────

import { zonasDe, zonaDeActivo, puntajeOpcion, rindeDinero, nombreZona } from './necesidad.ts'

const tresZonas = () => bodega({
  tipo: 'casa', municipio: undefined, presupuesto_min: null, presupuesto_max: 8e6, caracteristicas: { m2_construccion: 200 },
  zonas: [
    { municipio: 'San Pedro', nombre: 'Valle', colonias: ['Del Valle', 'Valle Oriente'] },
    { municipio: 'Monterrey', nombre: 'Country', colonias: ['Contry', 'Contry La Silla'] },
    { municipio: 'Monterrey', nombre: 'Carretera Nacional', colonias: [] },
    { municipio: 'Apodaca', nombre: 'Sobra' },
  ],
})

test('zonas: hasta 3, cada una con su municipio; la primera llena los campos de siempre', () => {
  const n = tresZonas()
  assert.equal(n.zonas.length, 3)
  assert.equal(n.municipio, 'San Pedro')
  assert.equal(n.zona, 'Valle')
  assert.deepEqual(n.colonias, ['Del Valle', 'Valle Oriente'])
  assert.equal(resumenNecesidad(n), 'Busca casa · 200 m² · Valle · Country · Carretera Nacional · hasta $8M · contado · para ya')
  assert.deepEqual(validarNecesidad({ tipo: 'casa', presupuesto_max: 5e6, zonas: [{ municipio: 'Monterrey' }, { municipio: '' }] }),
    { error: 'Escribe la ciudad o el municipio de la zona 2' })
})

test('zonas: una ficha vieja (sin zonas) se lee como una sola zona', () => {
  const vieja = { estado: 'Nuevo León', municipio: 'Apodaca', zona: null, colonias: [] }
  assert.deepEqual(zonasDe(vieja), [{ estado: 'Nuevo León', municipio: 'Apodaca', nombre: null, colonias: [] }])
  assert.equal(nombreZona(zonasDe(vieja)[0]), 'Apodaca')
})

test('zonas: cada propiedad cae en su zona; dos zonas en Monterrey no se pisan', () => {
  const n = tresZonas()
  assert.equal(zonaDeActivo({ municipio: 'San Pedro Garza García', colonia: 'Valle Oriente' }, n), 0)
  assert.equal(zonaDeActivo({ municipio: 'Monterrey', colonia: 'Contry' }, n), 1)
  assert.equal(zonaDeActivo({ municipio: 'Monterrey', colonia: 'Valle Alto' }, n), 2)   // sin colonias: cualquiera del municipio
  assert.equal(zonaDeActivo({ municipio: 'San Pedro Garza García', colonia: 'Chipinque' }, n), -1)
  assert.equal(zonaDeActivo({ municipio: 'Guadalupe', colonia: 'Contry' }, n), -1)
  const casa = { tipo: 'Casa', municipio: 'Monterrey', colonia: 'Contry', precio_total: 7.6e6, superficie: 240 }
  assert.equal(cumpleNecesidad(casa, n).cumple, true)
  assert.match(cumpleNecesidad({ ...casa, municipio: 'Guadalupe' }, n).motivos[0], /No está en sus zonas \(Valle, Country, Carretera Nacional\)/)
})

test('puntaje: ordena dentro de la zona y explica por qué', () => {
  const n = tresZonas()
  const buena = puntajeOpcion({ tipo: 'Casa', municipio: 'Monterrey', colonia: 'Contry', precio_total: 7.6e6, superficie: 240 }, n)
  const cara = puntajeOpcion({ tipo: 'Casa', municipio: 'Monterrey', colonia: 'Contry', precio_total: 8.64e6, superficie: 240 }, n)
  const chica = puntajeOpcion({ tipo: 'Casa', municipio: 'Monterrey', colonia: 'Contry', precio_total: 7.6e6, superficie: 150 }, n)
  assert.equal(buena.puntaje, 100)
  assert.deepEqual(buena.razones, ['5 % abajo de tu tope', '240 m², pediste 200', 'en Contry'])
  assert.ok(cara.puntaje < buena.puntaje && chica.puntaje < buena.puntaje)
  assert.match(cara.razones[0], /8 % arriba de tu tope/)
})

test('lo que rinde tu dinero en cada zona', () => {
  const n = tresZonas()
  assert.deepEqual(rindeDinero(62_000, n), { m2: 130, faltaPct: 35 })    // Valle: 200 m² cuestan $12.4M
  assert.deepEqual(rindeDinero(26_000, n), { m2: 310, faltaPct: -54 })   // Carretera Nacional: le sobra
  assert.equal(rindeDinero(null, n), null)
})

// ── V9 §22: rentas ─────────────────────────────────────────────────────────────────────────────
import { validarOperacionActivo, precioPara, presupuestoTexto as presTexto, detalleRenta } from './necesidad.ts'

const depa = (renta: Record<string, unknown> = {}) => {
  const r = validarNecesidad({
    operacion: 'renta', tipo: 'departamento', municipio: 'San Pedro Garza García', presupuesto_min: 25000, presupuesto_max: '35,000',
    forma_pago: 'credito', proposito: 'invertir', plazo: 'ya', caracteristicas: { m2_min: 90 },
    renta: { plazo_contrato: '1_anio', garantia: 'poliza', fecha_entrada: 'ya', amueblada: 'si', mascotas: true, ...renta },
  })
  assert.ok('necesidad' in r, JSON.stringify(r))
  return (r as { necesidad: Necesidad }).necesidad
}

test('renta: la ficha limpia lo que no aplica y guarda lo de renta', () => {
  const n = depa()
  assert.equal(n.operacion, 'renta')
  assert.equal(n.forma_pago, null); assert.equal(n.proposito, null); assert.equal(n.plazo, null)
  assert.deepEqual(n.renta, { plazo_contrato: '1_anio', garantia: 'poliza', fecha_entrada: 'ya', amueblada: 'si', mascotas: true })
  assert.equal(presTexto(n), '$25,000 a $35,000 al mes')
  assert.match(resumenNecesidad(n), /^Busca departamento en renta · 90 m² · San Pedro Garza García · \$25,000 a \$35,000 al mes · contrato 1 año · entrada ya$/)
  assert.deepEqual(detalleRenta(n.renta), ['Contrato: 1 año', 'Garantía: póliza jurídica', 'Entrada: ya', 'Amueblada', 'Con mascotas'])
  // Bodega: sin amueblada ni mascotas. Operación inválida: error. Sin operación (V8): compra.
  const b = validarNecesidad({ operacion: 'renta', tipo: 'bodega', municipio: 'Apodaca', presupuesto_max: 90000, renta: { amueblada: 'si', mascotas: true } })
  assert.ok('necesidad' in b && b.necesidad.renta!.amueblada === null && b.necesidad.renta!.mascotas === null)
  assert.deepEqual(validarNecesidad({ operacion: 'ambas', tipo: 'casa', municipio: 'Apodaca', presupuesto_max: 1 }), { error: 'Elige si quieres comprar o rentar' })
  assert.equal(bodega().operacion, 'compra')
})

test('renta: la propiedad valida su operación y cuenta su renta, no su precio', () => {
  assert.deepEqual(validarOperacionActivo({ operacion: 'renta' }), { error: 'Escribe la renta mensual' })
  assert.deepEqual(validarOperacionActivo({ operacion: 'ambas', renta_mensual: 30000 }), { error: 'Escribe el precio de venta' })
  const v = validarOperacionActivo({ operacion: 'ambas', precio_total: '9,000,000', renta_mensual: '32,000', renta: { deposito_meses: 2, garantia: 'cualquiera', mascotas: 'si', plazo_minimo: '1_anio' } })
  assert.ok(!('error' in v))
  assert.equal(v.renta!.deposito_meses, 2); assert.equal(v.renta!.mascotas, true); assert.equal(v.renta!.amueblada, null)
  assert.equal(precioPara(v, 'renta'), 32000); assert.equal(precioPara(v, 'compra'), 9_000_000)
  assert.equal(precioPara({ precio_total: 9e6 }, 'renta'), null) // propiedad vieja: solo venta
})

test('renta: cumple y puntaje con renta mensual, mascotas, amueblada, plazo y garantía', () => {
  const n = depa()
  const base = { tipo: 'Departamento', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente', superficie: 110, precio_total: null,
    operacion: 'renta' as const, renta_mensual: 30000, renta: { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '1_anio' as const, garantia: 'cualquiera' as const, amueblada: true, mascotas: true } }
  assert.deepEqual(cumpleNecesidad(base, n), { cumple: true, motivos: [] })
  assert.equal(puntajeOpcion(base, n).puntaje, 100)
  assert.deepEqual(cumpleNecesidad({ ...base, operacion: 'venta', precio_total: 9e6 }, n).motivos, ['No está en renta'])
  assert.deepEqual(cumpleNecesidad({ ...base, renta_mensual: 45000 }, n).motivos, ['Su renta ($45,000 al mes) está fuera del presupuesto ($25,000 a $35,000 al mes, ±10 %)'])
  assert.deepEqual(cumpleNecesidad({ ...base, renta: { ...base.renta, mascotas: false, amueblada: false } }, n).motivos, ['No acepta mascotas', 'No está amueblada'])
  // Plazo y garantía: no descalifican, restan 10 cada uno y se dicen.
  const p = puntajeOpcion({ ...base, renta: { ...base.renta, plazo_minimo: '5_anios', garantia: 'aval' } }, n)
  assert.equal(p.puntaje, 80)
  assert.ok(p.razones.includes('pide aval con propiedad') && p.razones.includes('pide contrato de 5 años o más'))
  // Una casa en venta y renta no aparece por su precio de venta en una búsqueda de compra barata.
  assert.equal(cumpleNecesidad({ ...base, operacion: 'renta' }, bodega()).motivos.includes('No está en venta'), true)
})
