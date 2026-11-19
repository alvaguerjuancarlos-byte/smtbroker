// Prueba de punta a punta de la entrada simple del mundo demo (guion v12, momento 1; app/entrar).
// Crea una cuenta demo temporal por el chat y la BORRA al terminar.
//   API: alta, entrar por usuario y por teléfono, usuario inexistente, cuenta de Operación y cuenta
//        real rechazadas, usuario repetido, rol.
//   UI:  /bienvenida?mundo=demo → Iniciar sesión → "¿Ya eres miembro?" → Todavía no → nombre → usuario
//        → WhatsApp → Continuar → ¿Qué quieres hacer? → Comprar → Por mi cuenta → chat de la ficha →
//        Buscar → Guardar mi búsqueda → su panel; luego sale y vuelve a entrar con su usuario.
// Uso: node --env-file=.env.local scripts/verificar-entrada-demo.mjs   (con `npx next dev -p 3011`)

import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'http://localhost:3011'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SUF = Math.random().toString(36).slice(2, 7)
const USUARIO = `prueba.entrada.${SUF}`
const TEL = `81 55${String(Math.floor(Math.random() * 1e6)).padStart(6, '0').replace(/(\d{2})(\d{4})/, '$1 $2')}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fallas = 0
const ok = (c, m) => { console.log(`${c ? 'OK ' : 'FALLA'} ${m}`); if (!c) fallas++ }
const api = async (cuerpo, token) => {
  const r = await fetch(BASE + '/api/entrada-demo', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(cuerpo) })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
const creadas = []

async function limpiar() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((x) => x.email?.startsWith('prueba.entrada') && x.email.endsWith('@demo.smtbroker.mx'))) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id)
    for (const p of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', p.id)
    for (const t of ['necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', u.id)
    await admin.from('usuarios').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log('Limpieza: cuentas de prueba borradas.')
}

let browser
try {
  // ── API ───────────────────────────────────────────────────────────────────────────────────
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const demo = lista.users.filter((u) => u.email?.endsWith('@demo.smtbroker.mx'))
  const { data: filas } = await admin.from('usuarios').select('id, rol, es_demo').in('id', demo.map((u) => u.id))
  const operacion = demo.find((u) => filas.find((f) => f.id === u.id)?.rol === 'broker_maestro')
  const real = lista.users.find((u) => u.email && !u.email.endsWith('@demo.smtbroker.mx'))

  let r = await api({ accion: 'entrar', usuario: 'no.existe.' + SUF })
  ok(r.status === 404, 'entrar con un usuario que no existe → 404')
  if (operacion) { r = await api({ accion: 'entrar', usuario: operacion.email.split('@')[0] }); ok(r.status === 404, 'la cuenta demo de Operación no entra sin contraseña') }
  if (real) { r = await api({ accion: 'entrar', usuario: real.email.split('@')[0] }); ok(r.status === 404 && !r.j.tokenHash, 'una cuenta REAL no entra sin contraseña') }
  r = await api({ accion: 'alta', nombre: 'Prueba', usuario: 'xx', whatsapp: '' })
  ok(r.status === 400, 'alta sin contacto o con usuario corto → 400')
  r = await api({ accion: 'entrar', usuario: 'diego.salinas' })
  ok(r.status === 200 && !!r.j.tokenHash && r.j.rol === 'broker', 'Diego (demo) entra con su usuario')

  // ── UI: alta por el chat ──────────────────────────────────────────────────────────────────
  browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1280, height: 900 } })
  const page = await browser.newPage()
  const esperarTexto = (t, timeout = 60000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t)
  const escribir = async (sel, v) => {
    await page.waitForSelector(sel); await page.click(sel)
    await page.$eval(sel, (e) => e.select()); await page.keyboard.press('Backspace'); await page.type(sel, v)
  }

  await page.goto(BASE + '/bienvenida?mundo=demo', { waitUntil: 'networkidle2' })
  await page.click('[data-iniciar-sesion]')
  await page.waitForFunction(() => location.pathname === '/entrar')
  await esperarTexto('¿Ya eres miembro?')
  ok(true, 'Iniciar sesión (mundo demo) → /entrar con "¿Ya eres miembro?"')
  await page.click('[data-entrada-no]')
  await escribir('[data-campo="nombre"]', 'Prueba Entrada'); await page.keyboard.press('Enter')
  await page.waitForSelector('[data-campo="usuario"]')
  const sugerido = await page.$eval('[data-campo="usuario"]', (e) => e.value)
  ok(sugerido === 'prueba.entrada', `sugiere el usuario a partir del nombre (${sugerido})`)
  await escribir('[data-campo="usuario"]', USUARIO); await page.keyboard.press('Enter')
  await escribir('[data-campo="whatsapp"]', TEL)
  await page.click('form button[type="submit"]')
  await page.waitForSelector('[data-entrada-continuar]', { timeout: 30000 })
  ok(await page.evaluate(() => document.body.innerText.includes('Ya eres miembro de SMT Match')), 'alta: "Listo, Prueba. Ya eres miembro de SMT Match."')
  const { data: l2 } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const cuenta = l2.users.find((u) => u.email === `${USUARIO}@demo.smtbroker.mx`)
  ok(!!cuenta, 'la cuenta quedó con correo interno usuario@demo.smtbroker.mx')
  if (cuenta) creadas.push(cuenta.id)
  const { data: fila } = await admin.from('usuarios').select('nombre, rol, es_demo').eq('id', cuenta?.id).maybeSingle()
  ok(fila?.es_demo === true && fila?.rol === 'inversionista' && fila?.nombre === 'Prueba Entrada', 'usuarios: demo, comprador, con su nombre')
  const { data: cc } = await admin.from('contactos_cliente').select('telefono').eq('usuario_id', cuenta?.id).maybeSingle()
  ok(cc?.telefono?.replace(/\D/g, '') === TEL.replace(/\D/g, ''), 'su WhatsApp quedó en contactos_cliente')

  // Usuario repetido y teléfono repetido
  r = await api({ accion: 'alta', nombre: 'Otra', usuario: USUARIO, correo: 'x@y.mx' })
  ok(r.status === 409, 'alta con un usuario que ya existe → 409')
  r = await api({ accion: 'alta', nombre: 'Otra', usuario: USUARIO + 'b', whatsapp: TEL })
  ok(r.status === 409, 'alta con un teléfono que ya tiene cuenta → 409')

  // ¿Qué quieres hacer? → Comprar → Por mi cuenta → chat
  await page.click('[data-entrada-continuar]')
  await page.waitForFunction(() => location.pathname === '/empezar')
  await esperarTexto('¿Qué quieres hacer?')
  ok(true, 'Continuar → ¿Qué quieres hacer? (con sesión, sin pedir cuenta)')
  await page.click('[data-opcion="comprar"]')
  await page.waitForSelector('[data-camino="cuenta"]'); await page.click('[data-camino="cuenta"]')
  await page.waitForSelector('[data-chat-ficha] input')
  await page.type('[data-chat-ficha] input', 'Busco un depa de 2 recámaras en Cumbres, Monterrey, de unos 7 millones con crédito')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-chips] [data-chip]', { timeout: 60000 })
  ok(true, 'el chat llenó chips de la ficha')
  // Lo que falte, lo contesta hasta que se active Buscar.
  for (let i = 0; i < 4; i++) {
    if (await page.$eval('[data-buscar]', (b) => !b.disabled)) break
    await sleep(500)
    await page.type('[data-chat-ficha] input', i === 0 ? '90 m2' : 'sí'); await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.body.innerText.includes('Anotando…'), { timeout: 60000 })
  }
  await page.click('[data-buscar]')
  await page.waitForFunction(() => /Guardar mi búsqueda/.test(document.body.innerText), { timeout: 150000 })
  ok(!(await page.evaluate(() => /Crea una contraseña|Crear mi cuenta/.test(document.body.innerText))), 'resultados: pide "Guardar mi búsqueda", no crear cuenta')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Guardar mi búsqueda/.test(b.innerText))?.click())
  await page.waitForFunction(() => location.pathname === '/inicio', { timeout: 60000 })
  const { data: nec } = await admin.from('necesidades').select('id, es_demo, tipo').eq('usuario_id', cuenta?.id)
  ok(nec?.length === 1 && nec[0].es_demo === true && nec[0].tipo === 'departamento', 'la búsqueda quedó guardada en el mundo demo')

  // Sale y vuelve a entrar con su usuario y con su teléfono.
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)))
  await page.goto(BASE + '/entrar?mundo=demo', { waitUntil: 'networkidle2' })
  await page.click('[data-entrada-si]')
  await escribir('[data-campo="usuario-o-telefono"]', USUARIO); await page.keyboard.press('Enter')
  await esperarTexto('¡Hola de nuevo, Prueba!', 30000)
  await page.waitForFunction(() => location.pathname === '/inicio', { timeout: 30000 })
  ok(true, 'vuelve a entrar con su usuario → "¡Hola de nuevo, Prueba!" → su panel')
  r = await api({ accion: 'entrar', usuario: TEL.replace(/ /g, '-') })
  ok(r.status === 200 && r.j.nombre === 'Prueba Entrada', 'también entra con su teléfono')

  // Sin ?mundo=demo, /entrar manda al login de siempre.
  await page.goto(BASE + '/entrar', { waitUntil: 'networkidle2' })
  ok(new URL(page.url()).pathname === '/login', 'sin ?mundo=demo, /entrar → /login (el mundo real no cambia)')
} catch (e) {
  console.error('ERROR', e.message); fallas++
} finally {
  await browser?.close().catch(() => {})
  await limpiar()
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK')
  process.exitCode = fallas ? 1 : 0
}
