// Prueba de punta a punta de la búsqueda en hasta tres zonas (Documento Maestro V9, §23) contra la
// base real, en el MUNDO DEMO, con cuentas y propiedades temporales que se borran al final.
// Necesita la migración 20261114000000_v9_tres_zonas.sql aplicada y la app corriendo en el puerto 3011.
// Uso: node --env-file=.env.local scripts/verificar-v9-tres-zonas.mjs <carpeta-para-capturas>
//
// Ficha: casa de 200 m² o más, hasta $8M, en Valle (San Pedro), Country (Monterrey) y Carretera
// Nacional (Monterrey, Lagos del Bosque). Inventario temporal: 1 casa particular en Valle Oriente,
// 4 en Contry y ninguna en Lagos del Bosque; el broker propone una suya en Del Valle.
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaV9-' + ts
const correoComprador = `comprador-v9-${ts}@demo.smtbroker.mx`
const correoBroker = `broker-v9-${ts}@demo.smtbroker.mx`
const correoDueno = `dueno-v9-${ts}@demo.smtbroker.mx`
const limpiar = { usuarios: [], activos: [] }
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function token(email) {
  const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (error) throw error
  return data.session.access_token
}
const api = async (tk, ruta, metodo = 'GET', cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
async function cuenta(email, nombre, rol) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw error
  limpiar.usuarios.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre, rol, es_demo: true })
  return data.user.id
}

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }

  const duenoId = await cuenta(correoDueno, 'Dueño Prueba V9', 'propietario')
  const brokerId = await cuenta(correoBroker, 'Broker Prueba V9', 'broker')
  const casa = async (campos, deBroker = false) => {
    const base = deBroker
      ? { usuario_id: brokerId, broker_id: brokerId, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba' }
      : { usuario_id: duenoId, cargado_por: 'propietario' }
    const { data, error } = await admin.from('activos').insert({ ...base, estado: 'Nuevo León', status: 'ingresado', tipo: 'Casa', ...campos }).select('id').single()
    if (error) throw error
    limpiar.activos.push(data.id)
    return data.id
  }
  const valle = await casa({ nombre: 'Casa V9 Valle Oriente', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente', superficie: 210, precio_total: 7_900_000 })
  const contry = [
    await casa({ nombre: 'Casa V9 Contry A', municipio: 'Monterrey', colonia: 'Contry', superficie: 240, precio_total: 7_600_000 }),
    await casa({ nombre: 'Casa V9 Contry B', municipio: 'Monterrey', colonia: 'Contry', superficie: 230, precio_total: 7_000_000 }),
    await casa({ nombre: 'Casa V9 Contry C', municipio: 'Monterrey', colonia: 'Contry', superficie: 205, precio_total: 7_950_000 }),
    await casa({ nombre: 'Casa V9 Contry D', municipio: 'Monterrey', colonia: 'Contry', superficie: 185, precio_total: 7_400_000 }),
  ]
  const fuera = await casa({ nombre: 'Casa V9 Cumbres', municipio: 'Monterrey', colonia: 'Cumbres', superficie: 250, precio_total: 7_000_000 })
  const delBroker = await casa({ nombre: 'Casa V9 Del Valle del broker', municipio: 'San Pedro Garza García', colonia: 'Del Valle', superficie: 220, precio_total: 7_800_000 }, true)

  // 1. Comprador: ficha con tres zonas en /empezar (pantalla de escritorio, como en el video).
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 })
  const clic = async (t) => {
    const r = await p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().toLowerCase().startsWith(t.toLowerCase())); if (el) { el.click(); return true } return false }, t)
    if (!r) throw new Error('no encontré el botón ' + t)
    await espera(400)
  }
  const escribe = async (name, v) => { const el = await p.$(`input[name="${name}"]`); if (!el) throw new Error('no encontré ' + name); await el.type(v) }
  const texto = async () => (await p.evaluate(() => document.body.innerText)).toLowerCase()
  await p.goto(BASE + '/empezar', { waitUntil: 'networkidle2' })
  await clic('Quiero comprar')
  await clic('Casa')
  await (await p.$$('input'))[3].type('200')   // construcción mínima
  await clic('Continuar')
  const zonas = [['Valle', 'San Pedro Garza García', ['Del Valle', 'Valle Oriente']], ['Country', 'Monterrey', ['Contry']], ['Carretera Nacional', 'Monterrey', ['Lagos del Bosque']]]
  for (const [k, [nombre, mun, cols]] of zonas.entries()) {
    if (k > 0) await clic('+ Agregar otra zona')
    await escribe(`zona-${k}-nombre`, nombre)
    await escribe(`zona-${k}-municipio`, mun)
    for (const c of cols) {
      await escribe(`zona-${k}-colonia`, c)
      await p.evaluate((k) => document.querySelector(`[data-zona="${k}"]`).querySelectorAll('button').forEach((x) => { if (x.innerText.trim() === 'Agregar') x.click() }), k)
      await espera(200)
    }
  }
  ok(!(await texto()).includes('+ agregar otra zona'), 'con tres zonas ya no deja agregar una cuarta')
  await p.screenshot({ path: `${out}/v9-1-tres-zonas.png`, fullPage: true })
  await clic('Continuar')
  await (await p.$$('input'))[1].type('8000000')
  await clic('Contado'); await clic('Ya'); await clic('Para vivir')
  await clic('Buscar')
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('cómo quieres buscar'), { timeout: 90000 })
  const bloques = await p.$$eval('[data-zona-resultado]', (xs) => xs.map((x) => x.innerText.split('\n')[0]))
  ok(JSON.stringify(bloques) === JSON.stringify(['Valle', 'Country', 'Carretera Nacional']), `resultados en una columna por zona (${bloques.join(', ')})`)
  const rinde = await p.$$eval('[data-rinde]', (xs) => xs.map((x) => x.innerText))
  console.log(`INFO  lo que rinde tu dinero (mundo real): ${rinde.join(' | ') || 'sin comparables'}`)
  await p.screenshot({ path: `${out}/v9-2-resultados-por-zona.png`, fullPage: true })
  const campos = await p.$$('form input:not(.hidden)')
  await campos[0].type('Comprador Prueba V9'); await campos[1].type('8112345678'); await campos[2].type(correoComprador); await campos[3].type(PASS)
  await clic('Crear mi cuenta')
  await p.waitForFunction(() => location.pathname === '/inicio', { timeout: 30000 })
  await p.waitForFunction(() => document.querySelectorAll('[data-zona-bandeja]').length === 3, { timeout: 30000 })

  const { data: cu } = await admin.from('usuarios').select('id').eq('nombre', 'Comprador Prueba V9').eq('es_demo', true).order('created_at', { ascending: false }).limit(1)
  const compradorId = cu?.[0]?.id
  if (compradorId) limpiar.usuarios.push(compradorId)
  const { data: nec } = await admin.from('necesidades').select('*').eq('usuario_id', compradorId)
  const n = nec?.[0]
  ok(nec?.length === 1 && n.zonas.length === 3 && n.zonas[1].nombre === 'Country' && n.zonas[1].municipio === 'Monterrey' && n.municipio === 'San Pedro Garza García',
    'la ficha guarda sus tres zonas (y la primera en los campos de siempre)')
  ok((await texto()).includes('busca casa · 200 m² · valle · country · carretera nacional · hasta $8m'), 'el resumen lista las tres zonas')

  // 2. Broker: ve la necesidad por cualquiera de sus zonas y propone su casa de Del Valle.
  const tkB = await token(correoBroker)
  const panel = await api(tkB, '/api/necesidades')
  const tarjeta = panel.j.necesidades?.find((x) => x.id === n.id)
  ok(tarjeta?.enMiZona === true, 'el broker la ve como de su zona (tiene una casa en San Pedro)')
  ok(tarjeta?.compatibles.length === 1 && tarjeta.compatibles[0].activoId === delBroker, 'su casa de Del Valle cumple la ficha')
  const r = await api(tkB, '/api/propuestas', 'POST', { necesidadId: n.id, activoId: delBroker, aceptoTerminos: true })
  ok(r.status === 200, `propone su casa (${r.status} ${r.j.error ?? ''})`)

  // 3. Bandeja por zona: las 3 mejores de cada una, "Ver las N" y la zona vacía en blanco.
  // Los listados reales de portales que trajo la búsqueda directa se cuentan y se quitan, para que
  // la prueba no dependa de lo que haya hoy en internet.
  const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', compradorId).single()
  // Se guardan en segundo plano después de crear la ficha: se espera a que la cuenta deje de crecer.
  let previo = -1, motor = []
  for (let i = 0; i < 20; i++) {
    ;({ data: motor } = await admin.from('radar_opciones').select('id').eq('perfil_id', pf.id).eq('origen', 'motor'))
    if (motor.length === previo && previo > 0) break
    previo = motor.length
    await espera(4000)
  }
  console.log(`INFO  listados de portales encontrados en las tres zonas: ${motor?.length ?? 0}`)
  await admin.from('radar_opciones').delete().eq('perfil_id', pf.id).eq('origen', 'motor')
  const tkC = await token(correoComprador)
  const g = await api(tkC, '/api/necesidades')
  const op = (id) => g.j.bandeja.find((o) => o.activoId === id)
  ok(op(valle)?.zona === 0 && op(delBroker)?.zona === 0 && op(delBroker)?.origen === 'broker', 'Valle: la particular y la propuesta del broker')
  ok(contry.every((id) => op(id)?.zona === 1), 'Country: las cuatro de Contry (la de 185 m² entra por el margen de 10 %)')
  ok(!op(fuera), 'la de Cumbres no cae en ninguna zona y no aparece')
  const z1 = g.j.bandeja.filter((o) => o.zona === 1).sort((a, b) => b.puntaje - a.puntaje)
  ok(z1.at(-1)?.activoId === contry[3], 'la de 185 m² queda al final de Country')
  ok(z1[0]?.activoId === contry[0] && z1[0].puntaje === 100, `la mejor de Country es la de 240 m² y $7.6M (${z1[0]?.puntaje} %: ${z1[0]?.razones?.join(', ')})`)
  ok(g.j.necesidades[0].zonas.length === 3 && 'rinde' in g.j.necesidades[0].zonas[0], 'cada zona trae lo que rinde el dinero')

  await p.reload({ waitUntil: 'networkidle2' })
  await p.waitForFunction(() => document.querySelectorAll('[data-zona-bandeja]').length === 3, { timeout: 30000 })
  const cols = await p.$$eval('[data-zona-bandeja]', (xs) => xs.map((x) => ({ texto: x.innerText.toLowerCase(), opciones: x.querySelectorAll('[data-opcion]').length })))
  ok(cols[0].texto.includes('propuesta por broker verificado · broker prueba v9') && cols[0].texto.includes('casa v9 valle oriente'), 'columna Valle con sus dos opciones')
  ok(cols[1].opciones === 3 && cols[1].texto.includes('casa v9 contry a') && !cols[1].texto.includes('casa v9 contry d'), `columna Country con sus 3 mejores (${cols[1].opciones})`)
  ok(cols[1].texto.includes('ver las 4'), 'y "Ver las 4" para el resto')
  ok(cols[2].texto.includes('aún no hay opciones en carretera nacional'), 'Carretera Nacional queda en blanco')
  await p.screenshot({ path: `${out}/v9-3-bandeja-por-zona.png`, fullPage: true })

  // 4. "Lo que rinde tu dinero" queda guardado en la ficha (se calcula después de guardarla).
  let zonasGuardadas = null
  for (let i = 0; i < 30 && !zonasGuardadas; i++) {
    const { data } = await admin.from('necesidades').select('zonas').eq('id', n.id).single()
    if (data.zonas.every((z) => 'mercado' in z)) zonasGuardadas = data.zonas
    else await espera(3000)
  }
  ok(!!zonasGuardadas, 'el precio por m² de cada zona se guarda en la ficha')
  console.log('INFO  mercado por zona: ' + (zonasGuardadas ?? []).map((z) => `${z.nombre}: ${z.mercado?.precioM2 ?? 'sin dato'} (${z.mercado?.comparables ?? 0} comparables)`).join(' | '))

  // 5. Validación: más de tres zonas se recortan; una zona sin municipio se rechaza.
  const r5 = await api(tkC, '/api/necesidades', 'POST', { tipo: 'casa', presupuesto_max: 5e6, zonas: [{ municipio: 'Monterrey' }, { municipio: '' }] })
  ok(r5.status === 400 && /zona 2/.test(r5.j.error), `zona sin municipio se rechaza (${r5.j.error})`)
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
  if (b) for (const [i, pg] of (await b.pages()).entries()) {
    await pg.screenshot({ path: `${out}/v9-error-${i}.png`, fullPage: true }).catch(() => {})
    console.log(`pagina ${i}:`, pg.url(), (await pg.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
  }
} finally {
  if (b) await b.close()
  if (limpiar.activos.length) {
    await admin.from('propuestas').delete().in('activo_id', limpiar.activos)
    await admin.from('activos').delete().in('id', limpiar.activos)
  }
  for (const id of limpiar.usuarios) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', id)
    for (const x of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', x.id)
    await admin.from('necesidades').delete().eq('usuario_id', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('contactos_cliente').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`limpieza: ${limpiar.usuarios.length} cuentas y ${limpiar.activos.length} propiedades temporales borradas`)
}
