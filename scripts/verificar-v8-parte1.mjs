// Prueba de punta a punta de la V8 Parte 1 (Documento Maestro §19) contra la base real, en el MUNDO
// DEMO, con cuentas y propiedades temporales que se borran al final. Necesita la migración
// 20261110000000_v8_necesidades.sql aplicada y la app corriendo en el puerto 3011 (next start -p 3011).
// Uso: node --env-file=.env.local scripts/verificar-v8-parte1.mjs <carpeta-para-capturas>
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaV8-' + ts
const correoComprador = `comprador-v8-${ts}@demo.smtbroker.mx`
const correoBroker = `broker-v8-${ts}@demo.smtbroker.mx`
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

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }

  // Broker demo temporal con dos bodegas: una cumple la ficha (Apodaca, 1,100 m², $7.5M) y otra no (Monterrey).
  const { data: bu, error: eb } = await admin.auth.admin.createUser({ email: correoBroker, password: PASS, email_confirm: true })
  if (eb) throw eb
  const brokerId = bu.user.id
  limpiar.usuarios.push(brokerId)
  await admin.from('usuarios').upsert({ id: brokerId, nombre: 'Broker Prueba V8', rol: 'broker', es_demo: true })
  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({ usuario_id: brokerId, broker_id: brokerId, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba', estado: 'Nuevo León', status: 'ingresado', ...campos }).select('id').single()
    if (error) throw error
    limpiar.activos.push(data.id)
    return data.id
  }
  const bodegaOk = await nueva({ nombre: 'Bodega Prueba V8 Apodaca', tipo: 'Bodega', municipio: 'Apodaca', superficie: 1100, precio_total: 7_500_000 })
  const bodegaNo = await nueva({ nombre: 'Bodega Prueba V8 Monterrey', tipo: 'Bodega', municipio: 'Monterrey', superficie: 1100, precio_total: 7_500_000 })

  // 1. Comprador: ficha completa en /empezar y registro al final.
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 420, height: 900 })
  p.on('response', (r) => { if (r.url().includes('/api/')) console.log('  resp', r.status(), r.url().replace(BASE, '')) })
  const clic = async (t) => {
    const r = await p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().toLowerCase().startsWith(t.toLowerCase())); if (el) { el.click(); return true } return false }, t)
    if (!r) throw new Error('no encontré el botón ' + t)
    await espera(400)
  }
  const texto = async () => (await p.evaluate(() => document.body.innerText)).toLowerCase()
  await p.goto(BASE + '/empezar', { waitUntil: 'networkidle2' })
  await clic('Quiero comprar')
  await clic('Bodega')
  await (await p.$$('input'))[0].type('1000')
  await clic('Piso industrial')
  await clic('Continuar')
  await (await p.$('input[list="municipios-nl"]')).type('Apodaca')
  await clic('Continuar')
  const ins = await p.$$('input'); await ins[0].type('6000000'); await ins[1].type('8000000')
  await clic('Contado'); await clic('Ya'); await clic('Para invertir')
  await clic('Buscar')
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('cómo quieres buscar'), { timeout: 30000 })
  const campos = await p.$$('form input:not(.hidden)')
  await campos[0].type('Patricia Prueba'); await campos[1].type('8112345678'); await campos[2].type(correoComprador); await campos[3].type(PASS)
  await clic('Crear mi cuenta')
  await p.waitForFunction(() => location.pathname === '/inicio', { timeout: 30000 })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('tus búsquedas'), { timeout: 30000 })
  await p.screenshot({ path: `${out}/e2e-1-panel-comprador.png`, fullPage: true })
  ok((await texto()).includes('busca bodega · 1,000 m² · apodaca · $6m a $8m · contado · para ya'), 'el panel muestra la búsqueda con su resumen')

  const { data: cu } = await admin.from('usuarios').select('id, rol, es_demo').eq('nombre', 'Patricia Prueba').eq('es_demo', true).order('created_at', { ascending: false }).limit(1)
  const compradorId = cu?.[0]?.id
  if (compradorId) limpiar.usuarios.push(compradorId)
  ok(cu?.[0]?.rol === 'inversionista' && cu?.[0]?.es_demo === true, 'cuenta creada como comprador en el mundo demo')
  const { data: nec } = await admin.from('necesidades').select('*').eq('usuario_id', compradorId)
  ok(nec?.length === 1 && nec[0].tipo === 'bodega' && nec[0].es_demo && nec[0].proposito === 'invertir' && nec[0].caracteristicas.m2_min === 1000, 'necesidad guardada (tipo, propósito, características, mundo demo)')
  const { data: perf } = await admin.from('perfiles_intencion').select('tipo_activo_interes, zona, presupuesto').eq('usuario_id', compradorId).maybeSingle()
  ok(perf?.tipo_activo_interes === 'Bodega' && perf?.presupuesto === '$6M – $8M', `perfil de la V7 actualizado (${JSON.stringify(perf)})`)
  const necesidadId = nec[0].id

  // 2. Broker: la necesidad aparece anónima, con su bodega que cumple y sin la que no cumple.
  const tkB = await token(correoBroker)
  const panel = await api(tkB, '/api/necesidades')
  const tarjeta = panel.j.necesidades?.find((n) => n.id === necesidadId)
  ok(!!tarjeta, 'el broker ve la necesidad en su panel')
  ok(tarjeta && !JSON.stringify(tarjeta).includes('Patricia') && !JSON.stringify(tarjeta).includes('8112345678'), 'la tarjeta es anónima (sin nombre ni WhatsApp)')
  ok(tarjeta?.compatibles.length === 1 && tarjeta.compatibles[0].activoId === bodegaOk, 'solo le ofrece la bodega que cumple la ficha')
  ok(tarjeta?.enMiZona === true, 'marcada como de su zona (tiene propiedades en Apodaca)')

  // Reglas del servidor
  let r = await api(tkB, '/api/propuestas', 'POST', { necesidadId, activoId: bodegaOk })
  ok(r.status === 400, `sin aceptar términos se rechaza (${r.status} ${r.j.error})`)
  r = await api(tkB, '/api/propuestas', 'POST', { necesidadId, activoId: bodegaNo, aceptoTerminos: true })
  ok(r.status === 422, `la que no cumple se rechaza (${r.status} ${r.j.error})`)
  r = await api(tkB, '/api/propuestas', 'POST', { necesidadId, activoId: '9eaa5046-8416-44fd-9fee-b192da73ce19', aceptoTerminos: true })
  ok(r.status === 403, `una propiedad ajena se rechaza (${r.status} ${r.j.error})`)

  // 3. Broker propone desde la pestaña Necesidades (UI).
  const pb = await b.newPage(); await pb.setViewport({ width: 1280, height: 900 })
  await pb.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await pb.type('input[type="email"]', correoBroker); await pb.type('input[type="password"]', PASS)
  await Promise.all([pb.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), pb.keyboard.press('Enter')])
  await pb.goto(BASE + '/portal-broker?pestana=necesidades', { waitUntil: 'networkidle2' })
  await pb.waitForFunction(() => document.body.innerText.toLowerCase().includes('proponer propiedad'), { timeout: 30000 })
  await pb.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().toLowerCase() === 'proponer propiedad').click())
  await espera(500)
  await pb.evaluate(() => { document.querySelector('input[type="radio"]').click(); document.querySelector('input[type="checkbox"]').click() })
  await espera(300)
  await pb.screenshot({ path: `${out}/e2e-2-broker-proponer.png`, fullPage: true })
  await pb.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().toLowerCase() === 'enviar propuesta').click())
  await pb.waitForFunction(() => document.body.innerText.toLowerCase().includes('propuesta enviada'), { timeout: 20000 })
  await pb.screenshot({ path: `${out}/e2e-3-broker-enviada.png`, fullPage: true })
  const { data: props } = await admin.from('propuestas').select('*').eq('necesidad_id', necesidadId)
  ok(props?.length === 1 && props[0].activo_id === bodegaOk && !!props[0].terminos_aceptados_at && props[0].es_demo, 'propuesta guardada con términos aceptados, en el mundo demo')
  r = await api(tkB, '/api/propuestas', 'POST', { necesidadId, activoId: bodegaOk, aceptoTerminos: true })
  ok(r.status === 409, `la misma propiedad no se propone dos veces (${r.status} ${r.j.error})`)

  // 4. Comprador: la propuesta aparece en su bandeja con la etiqueta del broker.
  await p.reload({ waitUntil: 'networkidle2' })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('bodega prueba v8 apodaca'), { timeout: 30000 })
  await p.screenshot({ path: `${out}/e2e-4-bandeja.png`, fullPage: true })
  const t4 = await texto()
  ok(t4.includes('propuesta por broker verificado · broker prueba v8'), 'la bandeja muestra la propuesta con el nombre del broker')
  ok(!t4.includes('bodega prueba v8 monterrey'), 'la que no cumple no aparece')
  ok(t4.includes('1 propuesta de brokers'), 'la búsqueda cuenta la propuesta')

  // 5. Administrar la búsqueda: pausar, reactivar, caminos y tope de 3.
  const tkC = await token(correoComprador)
  r = await api(tkC, `/api/necesidades/${necesidadId}`, 'PATCH', { busqueda_directa: false, publicada_brokers: false })
  ok(r.status === 400, 'no deja apagar los dos caminos')
  r = await api(tkC, `/api/necesidades/${necesidadId}`, 'PATCH', { accion: 'pausar' })
  ok(r.status === 200, 'pausar')
  ok(!(await api(tkB, '/api/necesidades')).j.necesidades.some((n) => n.id === necesidadId), 'pausada ya no se ve en el panel del broker')
  r = await api(tkC, `/api/necesidades/${necesidadId}`, 'PATCH', { accion: 'activar' })
  ok(r.status === 200 && (await api(tkB, '/api/necesidades')).j.necesidades.some((n) => n.id === necesidadId), 'reactivada vuelve al panel')
  const otra = { tipo: 'casa', municipio: 'Monterrey', presupuesto_max: 5_000_000 }
  for (let i = 0; i < 2; i++) ok((await api(tkC, '/api/necesidades', 'POST', otra)).status === 200, `búsqueda adicional ${i + 2}`)
  r = await api(tkC, '/api/necesidades', 'POST', otra)
  ok(r.status === 409, `la cuarta activa se rechaza (${r.j.error})`)
  r = await api(tkB, '/api/necesidades', 'POST', otra)
  ok(r.status === 403, 'un broker no crea búsquedas')

  // 6. Radar (origen 'motor'): depende de la parte de la migración del Radar.
  const { data: pid } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', compradorId).maybeSingle()
  const { count } = await admin.from('radar_opciones').select('id', { count: 'exact', head: true }).eq('perfil_id', pid.id)
  console.log(`INFO  listados de portales guardados en su Radar: ${count}`)
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
  if (b) for (const [i, pg] of (await b.pages()).entries()) {
    await pg.screenshot({ path: `${out}/e2e-error-${i}.png`, fullPage: true }).catch(() => {})
    console.log(`pagina ${i}:`, pg.url(), (await pg.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
  }
} finally {
  if (b) await b.close()
  // Limpieza: todo lo temporal (las necesidades y propuestas caen en cascada con los usuarios).
  if (limpiar.activos.length) await admin.from('activos').delete().in('id', limpiar.activos)
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
