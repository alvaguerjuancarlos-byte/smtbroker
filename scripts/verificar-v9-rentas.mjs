// Prueba de punta a punta de RENTAS, Parte A (Documento Maestro V9, §22.1–22.3 y §22.5) contra la
// base real, en el MUNDO DEMO, con cuentas y propiedades temporales que se borran al final.
// Necesita la migración 20261115000000_v9_rentas.sql aplicada y la app corriendo en el puerto 3011.
// Uso: node --env-file=.env.local scripts/verificar-v9-rentas.mjs <carpeta-para-capturas>
//
// 1. Una dueña registra en /empezar un departamento "en venta y en renta" ($9M o $32,000 al mes).
// 2. Una inquilina captura en /empezar su ficha de RENTA: departamento de 90 m² o más en Valle
//    Oriente, $25,000 a $35,000 al mes, contrato de 1 año, póliza jurídica, entrada ya, amueblado y
//    con mascotas.
// 3. Inventario temporal: uno en renta que cumple, uno caro, uno solo en venta, uno sin mascotas y
//    uno del broker que pide contrato de 5 años (cumple, pero con menos puntaje).
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaRenta-' + ts
const correoInquilina = `inquilina-${ts}@demo.smtbroker.mx`
const correoDuena = `duena-renta-${ts}@demo.smtbroker.mx`
const correoBroker = `broker-renta-${ts}@demo.smtbroker.mx`
const correoOtro = `dueno-renta-${ts}@demo.smtbroker.mx`
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
const idDe = async (nombre) => {
  const { data } = await admin.from('usuarios').select('id').eq('nombre', nombre).eq('es_demo', true).order('created_at', { ascending: false }).limit(1)
  const id = data?.[0]?.id
  if (id && !limpiar.usuarios.includes(id)) limpiar.usuarios.push(id)
  return id
}

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }

  const otroId = await cuenta(correoOtro, 'Dueño Renta Prueba', 'propietario')
  const brokerId = await cuenta(correoBroker, 'Broker Renta Prueba', 'broker')
  const depa = async (campos, deBroker = false) => {
    const base = deBroker
      ? { usuario_id: brokerId, broker_id: brokerId, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba' }
      : { usuario_id: otroId, cargado_por: 'propietario' }
    const { data, error } = await admin.from('activos').insert({
      ...base, estado: 'Nuevo León', status: 'ingresado', tipo: 'Departamento', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente', ...campos,
    }).select('id').single()
    if (error) throw error
    limpiar.activos.push(data.id)
    return data.id
  }
  const conTodo = { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '1_anio', garantia: 'cualquiera', amueblada: true, mascotas: true }
  const cumple = await depa({ nombre: 'Depa Renta Cumple', superficie: 110, operacion: 'renta', renta_mensual: 30000, renta: conTodo })
  const caro = await depa({ nombre: 'Depa Renta Caro', superficie: 120, operacion: 'renta', renta_mensual: 45000, renta: conTodo })
  const soloVenta = await depa({ nombre: 'Depa Solo Venta', superficie: 120, operacion: 'venta', precio_total: 30000 })
  const sinMascotas = await depa({ nombre: 'Depa Renta Sin Mascotas', superficie: 100, operacion: 'renta', renta_mensual: 28000, renta: { ...conTodo, mascotas: false } })
  const delBroker = await depa({ nombre: 'Depa Renta del Broker', superficie: 95, operacion: 'renta', renta_mensual: 34000, renta: { ...conTodo, plazo_minimo: '5_anios' } }, true)
  const brokerVenta = await depa({ nombre: 'Depa Venta del Broker', superficie: 95, operacion: 'venta', precio_total: 8_000_000 }, true)

  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 })
  const clic = async (t, exacto = false) => {
    const r = await p.evaluate((t, exacto) => {
      const el = [...document.querySelectorAll('button')].find((x) => { const s = x.innerText.trim().toLowerCase(); return exacto ? s === t.toLowerCase() : s.startsWith(t.toLowerCase()) })
      if (el) { el.click(); return true } return false
    }, t, exacto)
    if (!r) throw new Error('no encontré el botón ' + t)
    await espera(400)
  }
  const escribe = async (sel, v) => { const el = await p.$(sel); if (!el) throw new Error('no encontré ' + sel); await el.type(v) }
  const texto = async () => (await p.evaluate(() => document.body.innerText)).toLowerCase()

  // 1. La dueña: "Quiero vender o rentar mi propiedad" → las dos.
  await p.goto(BASE + '/empezar', { waitUntil: 'networkidle2' })
  ok((await texto()).includes('quiero vender o rentar mi propiedad') && (await texto()).includes('quiero comprar o rentar'), 'las dos puertas mencionan la renta')
  await clic('Quiero vender o rentar')
  await p.select('select', 'Departamento')
  await clic('Las dos')
  const v = await p.$$('form input:not(.hidden)')
  // nombre, WhatsApp, superficie, colonia, municipio, precio, renta, depósito, correo, contraseña
  const valores = ['Dueña Renta Prueba', '8112345678', '120', 'Valle Oriente', 'San Pedro Garza García', '9000000', '32000', '2', correoDuena, PASS]
  for (const [i, x] of valores.entries()) await v[i].type(x)
  await p.screenshot({ path: `${out}/renta-1-duena.png`, fullPage: true })
  await clic('Continuar')
  await p.waitForFunction(() => document.body.innerText.includes('¿Cómo quieres vender?'), { timeout: 30000 })
  const duenaId = await idDe('Dueña Renta Prueba')
  const { data: suyo } = await admin.from('activos').select('id, operacion, precio_total, renta_mensual, renta').eq('usuario_id', duenaId).single()
  if (suyo) limpiar.activos.push(suyo.id)
  ok(suyo?.operacion === 'ambas' && suyo.precio_total === 9_000_000 && suyo.renta_mensual === 32000 && suyo.renta?.deposito_meses === 2,
    `la dueña registra su depa en venta y en renta (${suyo?.operacion}, $${suyo?.precio_total}, $${suyo?.renta_mensual} al mes, ${suyo?.renta?.deposito_meses} meses de depósito)`)
  await p.evaluate(() => localStorage.clear())
  const cli = await b.createBrowserContext(); const p2 = await cli.newPage(); await p2.setViewport({ width: 1440, height: 900 })
  await p.close()
  const pg = p2
  Object.assign(globalThis, { pg })

  // 2. La inquilina: ficha de renta en /empezar.
  const c2 = async (t, exacto = false) => {
    const r = await pg.evaluate((t, exacto) => {
      const el = [...document.querySelectorAll('button')].find((x) => { const s = x.innerText.trim().toLowerCase(); return exacto ? s === t.toLowerCase() : s.startsWith(t.toLowerCase()) })
      if (el) { el.click(); return true } return false
    }, t, exacto)
    if (!r) throw new Error('no encontré el botón ' + t)
    await espera(400)
  }
  const t2 = async () => (await pg.evaluate(() => document.body.innerText)).toLowerCase()
  await pg.goto(BASE + '/empezar', { waitUntil: 'networkidle2' })
  await c2('Quiero comprar o rentar')
  ok((await t2()).includes('¿quieres comprar o rentar?'), 'el primer paso de la ficha es comprar o rentar')
  await c2('Rentar')
  ok((await t2()).includes('¿qué tipo de propiedad quieres rentar?'), 'eligió rentar')
  await c2('Departamento')
  await (await pg.$$('input'))[3].type('90')   // superficie mínima
  await c2('Continuar')
  await (await pg.$('input[name="zona-0-nombre"]')).type('Valle')
  await (await pg.$('input[name="zona-0-municipio"]')).type('San Pedro Garza García')
  await (await pg.$('input[name="zona-0-colonia"]')).type('Valle Oriente')
  await c2('Agregar', true)
  await c2('Continuar')
  const tr = await t2()
  ok(tr.includes('renta mensual') && tr.includes('plazo del contrato') && tr.includes('¿tienes mascotas?') && !tr.includes('¿cómo pagarías?') && !tr.includes('¿para qué la quieres?'),
    'en renta pide renta mensual, plazo, garantía, entrada, amueblada y mascotas (sin forma de pago ni "para qué")')
  await (await pg.$('input[name="presupuesto-min"]')).type('25000')
  await (await pg.$('input[name="presupuesto-max"]')).type('35000')
  await c2('1 año'); await c2('Póliza jurídica'); await c2('Ya', true); await c2('Amueblada', true)
  await pg.evaluate(() => [...document.querySelectorAll('[data-renta="mascotas"] button')].find((x) => x.innerText.trim() === 'Sí').click())
  await espera(300)
  await pg.screenshot({ path: `${out}/renta-2-ficha.png`, fullPage: true })
  await c2('Buscar')
  await pg.waitForFunction(() => document.body.innerText.toLowerCase().includes('cómo quieres buscar'), { timeout: 90000 })
  const res = await t2()
  // Antes de la cuenta se busca en el mundo real (el inventario de esta prueba es demo): aquí se
  // revisa el formato; el inventario se revisa en la bandeja (paso 4).
  ok(/\/m² al mes/.test(res) || !res.includes('/m²'), 'el precio por m² de la zona se muestra al mes')
  ok(res.includes('con esa renta') || !res.includes('/m²'), 'y cuántos m² alcanza esa renta')
  console.log('INFO  zona: ' + (await pg.$$eval('[data-zona-resultado]', (xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)))).join(' | '))
  await pg.screenshot({ path: `${out}/renta-3-resultados.png`, fullPage: true })
  const campos = await pg.$$('form input:not(.hidden)')
  await campos[0].type('Inquilina Prueba'); await campos[1].type('8112345678'); await campos[2].type(correoInquilina); await campos[3].type(PASS)
  await c2('Crear mi cuenta')
  await pg.waitForFunction(() => location.pathname === '/inicio', { timeout: 30000 })
  await pg.waitForFunction(() => document.querySelectorAll('[data-zona-bandeja]').length === 1, { timeout: 30000 })

  const inquilinaId = await idDe('Inquilina Prueba')
  const { data: nec } = await admin.from('necesidades').select('*').eq('usuario_id', inquilinaId)
  const n = nec?.[0]
  ok(n?.operacion === 'renta' && n.presupuesto_max === 35000 && n.forma_pago === null && n.proposito === null
    && n.renta?.plazo_contrato === '1_anio' && n.renta.garantia === 'poliza' && n.renta.fecha_entrada === 'ya' && n.renta.amueblada === 'si' && n.renta.mascotas === true,
    `la ficha se guarda de renta con sus condiciones (${JSON.stringify(n?.renta)})`)
  ok((await t2()).includes('busca departamento en renta · 90 m² · valle · $25,000 a $35,000 al mes · contrato 1 año · entrada ya'), 'el resumen dice que es renta, con renta mensual, contrato y entrada')

  // 3. Broker: ve la ficha marcada como renta y propone su depa en renta (no el de venta).
  const tkB = await token(correoBroker)
  const panel = await api(tkB, '/api/necesidades')
  const tarjeta = panel.j.necesidades?.find((x) => x.id === n.id)
  ok(tarjeta?.operacion === 'renta' && tarjeta.detalle.includes('Garantía: póliza jurídica') && tarjeta.detalle.includes('Con mascotas'), 'el panel del broker la marca como renta, con sus condiciones')
  ok(tarjeta?.compatibles.length === 1 && tarjeta.compatibles[0].activoId === delBroker && tarjeta.compatibles[0].precio === 34000,
    `de su cartera solo cumple el depa en renta, con su renta mensual (${tarjeta?.compatibles.map((x) => x.nombre).join(', ')})`)
  const mal = await api(tkB, '/api/propuestas', 'POST', { necesidadId: n.id, activoId: brokerVenta, aceptoTerminos: true })
  ok(mal.status === 422 && /No está en renta/.test(mal.j.error), `no deja proponer uno que solo está en venta (${mal.j.error})`)
  const r = await api(tkB, '/api/propuestas', 'POST', { necesidadId: n.id, activoId: delBroker, aceptoTerminos: true })
  ok(r.status === 200, `propone su depa en renta (${r.status} ${r.j.error ?? ''})`)

  const pb = await b.newPage(); await pb.setViewport({ width: 1440, height: 900 })
  await pb.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await pb.type('input[type="email"]', correoBroker); await pb.type('input[type="password"]', PASS)
  await pb.keyboard.press('Enter')
  await pb.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
  await pb.goto(BASE + '/portal-broker?pestana=necesidades', { waitUntil: 'networkidle2' })
  await pb.waitForSelector(`[data-etiqueta-operacion]`, { timeout: 30000 })
  await pb.evaluate(() => [...document.querySelectorAll('[data-filtro-operacion] button')].find((x) => x.dataset.op === 'renta').click())
  await espera(500)
  const etiquetas = await pb.$$eval('[data-etiqueta-operacion]', (xs) => xs.map((x) => x.dataset.etiquetaOperacion))
  ok(etiquetas.length > 0 && etiquetas.every((x) => x === 'renta'), `el filtro "Renta" deja solo fichas de renta (${etiquetas.length})`)
  await pb.screenshot({ path: `${out}/renta-4-panel-broker.png`, fullPage: true })
  await pb.close()

  // 4. Bandeja de la inquilina: renta mensual, no el precio de venta; el del broker baja por el plazo.
  const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', inquilinaId).single()
  let previo = -1, motor = []
  for (let i = 0; i < 20; i++) {
    ;({ data: motor } = await admin.from('radar_opciones').select('id').eq('perfil_id', pf.id).eq('origen', 'motor'))
    if (motor.length === previo && previo > 0) break
    previo = motor.length
    await espera(4000)
  }
  console.log(`INFO  listados de portales en renta encontrados: ${motor?.length ?? 0}`)
  if (motor?.length) {
    const g0 = await api(await token(correoInquilina), '/api/necesidades')
    const port = g0.j.bandeja.filter((o) => o.origen === 'portal')
    ok(port.length > 0 && port.every((o) => o.necesidadId === n.id && o.zona === 0), `los listados de portales quedan en la zona de su ficha de renta (${port.length})`)
  }
  await admin.from('radar_opciones').delete().eq('perfil_id', pf.id).eq('origen', 'motor')
  const tkI = await token(correoInquilina)
  const g = await api(tkI, '/api/necesidades')
  const op = (id) => g.j.bandeja.find((o) => o.activoId === id)
  ok(op(cumple)?.precio === 30000 && op(cumple)?.puntaje === 100, `el depa que cumple, $30,000 al mes y 100 % (${op(cumple)?.puntaje} %)`)
  ok(op(suyo.id)?.precio === 32000, `el de la dueña aparece por su renta ($${op(suyo.id)?.precio}), no por su precio de venta`)
  ok(!op(caro) && !op(soloVenta) && !op(sinMascotas), 'no aparecen el caro, el de solo venta ni el que no acepta mascotas')
  ok(op(delBroker)?.origen === 'broker' && op(delBroker).puntaje === 90 && op(delBroker).razones.includes('pide contrato de 5 años o más'),
    `el del broker aparece con 90 % porque pide contrato de 5 años (${op(delBroker)?.razones?.join(', ')})`)
  ok(g.j.necesidades[0].operacion === 'renta', 'la búsqueda viene marcada como renta')

  await pg.reload({ waitUntil: 'networkidle2' })
  await pg.waitForFunction(() => document.querySelectorAll('[data-opcion]').length >= 3, { timeout: 30000 })
  const bandeja = await t2()
  ok(bandeja.includes('$30,000 al mes') && bandeja.includes('$34,000 al mes') && !bandeja.includes('$9m'), 'la bandeja muestra rentas mensuales')
  await pg.screenshot({ path: `${out}/renta-5-bandeja.png`, fullPage: true })

  // 5. El precio por m² de la zona se calcula con comparables de RENTA.
  let zonas = null
  for (let i = 0; i < 30 && !zonas; i++) {
    const { data } = await admin.from('necesidades').select('zonas').eq('id', n.id).single()
    if (data.zonas.every((z) => 'mercado' in z)) zonas = data.zonas
    else await espera(3000)
  }
  const m2 = zonas?.[0]?.mercado?.precioM2
  ok(zonas && (m2 == null || m2 < 2000), `el precio por m² de la zona es renta mensual por m² (${m2 ?? 'sin dato'}, ${zonas?.[0]?.mercado?.comparables ?? 0} comparables)`)

  // 6. Validaciones del servidor.
  const r6 = await api(tkI, '/api/necesidades', 'POST', { operacion: 'las dos', tipo: 'casa', presupuesto_max: 30000, zonas: [{ municipio: 'Monterrey' }] })
  ok(r6.status === 400 && r6.j.error === 'Elige si quieres comprar o rentar', `una operación inválida se rechaza (${r6.j.error})`)
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
  if (b) for (const [i, x] of (await b.pages()).entries()) {
    await x.screenshot({ path: `${out}/renta-error-${i}.png`, fullPage: true }).catch(() => {})
    console.log(`pagina ${i}:`, x.url(), (await x.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
  }
} finally {
  if (b) await b.close()
  if (limpiar.activos.length) {
    await admin.from('propuestas').delete().in('activo_id', limpiar.activos)
    await admin.from('activos').delete().in('id', limpiar.activos)
  }
  for (const id of limpiar.usuarios) {
    const { data: act } = await admin.from('activos').select('id').eq('usuario_id', id)
    if (act?.length) await admin.from('activos').delete().in('id', act.map((a) => a.id))
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
