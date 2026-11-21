// Graba las tomas del video demo v13 (guion aprobado por JC el 20-nov-2026: "comprar y vender son dos caras
// de la misma moneda"). Es el grabador del v12 con el OTRO LADO en pantalla: Diego propone su depa desde su
// panel (r4a, antes por la API) y reporta la renta en su pantalla (r8a, antes por la API). Sin Laura ni el
// panel final de Diego (r9 y r10 del v12). Las demás tomas son las del v12:
// un caso de uso completo contado desde el cliente. Patricia RENTA un departamento de 3 recámaras en Valle Poniente (Santa
// Catarina), de $55,000 a $60,000 al mes, bien ubicado y con muy buenas amenidades; con los tres
// momentos de la verdad (entrada simple, ¿qué quieres hacer? + chat, las seleccionadas con lo que se
// revisó) y el cierre completo (conectar, ¿en qué va?, el asesor reporta la renta, ella confirma y
// califica). Contra producción, en el MUNDO DEMO (no manda correos ni toca datos reales).
//   r0  Página pública (modo demo)                                                      (escena 3)
//   r1  Entrada: ¿Ya eres miembro? → Todavía no → nombre, usuario, WhatsApp → Ya eres miembro (5)
//   r2  ¿Qué quieres hacer? → Rentar → Por mi cuenta → chat → lo que rinde → Guardar     (6-8)
//   r3  Su tablero: "Revisamos N…", banda 1 (certificadas) y banda 3 (portales)          (9-11)
//   r4a Diego: su panel → la necesidad de Patricia → Proponer propiedad → Enviar          (13, nuevo)
//   r4  Al día siguiente: banda 2 con la propuesta de Diego                               (13)
//   r5  Me interesa en la de Diego → análisis → comparativo de las tres                  (13-15)
//   r6  Conectar → contacto con WhatsApp                                                  (16)
//   r7  A los 7 días: ¿En qué va? → Negociando                                            (18)
//   r8a Diego: la conexión → renta mensual → Reportar renta                               (20, nuevo)
//   r8  Al firmar: renta reportada por Diego → "Confirmo que ya rento" → califica         (20-21)
//
// Datos demo (se crean aquí y se BORRAN al terminar, aunque algo falle): el inventario de
// scripts/inventario-v12.mjs (3 certificados de dueños directos, uno es el depa de JC en Torre West, y
// el de Diego), la cuenta de Patricia (se da de alta en la toma r1), el teléfono de Diego (solicitud) y,
// (el v12 además movía el precio de Laura; el v13 ya no la graba).
//
// Uso: FFMPEG=<ffmpeg.exe> FOTOS=<demo-v2/v12/fotos> node --env-file=.env.local scripts/grabar-video-v13.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { crearInventario, borrarInventario, NOMBRE_DIEGO } from './inventario-v12.mjs'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v12'
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG || !process.env.FOTOS) throw new Error('Faltan DEMO_PASSWORD (.env.local), FFMPEG y FOTOS')
mkdirSync(OUT, { recursive: true })
const PASS = process.env.DEMO_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PANTALLA = { width: 1440, height: 900, deviceScaleFactor: 1 }
const NOMBRE_PATRICIA = 'Patricia Treviño'
const USUARIO_PATRICIA = 'patricia.trevino'
// Un WhatsApp que ninguna cuenta demo use (la entrada no deja repetir teléfonos).
const WHATSAPP = `81 ${String(1000 + Math.floor(Math.random() * 9000))} ${String(1000 + Math.floor(Math.random() * 9000))}`
const MENSAJE = 'Busco rentar un depa de 3 recámaras en Valle Poniente, de 55 a 60 mil al mes, bien ubicado y con muy buenas amenidades'
const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx', laura: 'laura.garza@demo.smtbroker.mx',
  patricia: `${USUARIO_PATRICIA}@demo.smtbroker.mx`,
}
const LAURA_ACTIVO = '7c0c1823-f952-47ee-8e7b-bd5cce4d44d2'
const creados = { inventario: { activos: [], fotos: [] }, solicitud: null, laura: null }

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
const ids = { ricardo: lista.users.find((u) => u.email === CUENTAS.ricardo).id, diego: lista.users.find((u) => u.email === CUENTAS.diego).id }
if (lista.users.some((u) => u.email === CUENTAS.patricia)) throw new Error(`Ya existe ${CUENTAS.patricia}: quedó de una grabación anterior; bórrala antes`)

async function restaurar() {
  await borrarInventario(admin, creados.inventario).catch((e) => console.log('  (inventario)', e.message))
  if (creados.solicitud) await admin.from('solicitudes').delete().eq('id', creados.solicitud)
  if (creados.laura) {
    await admin.from('activos').update({ precio_total: creados.laura.precio }).eq('id', LAURA_ACTIVO)
    for (const n of creados.laura.necesidades) await admin.from('necesidades').update({ presupuesto_min: n.presupuesto_min, presupuesto_max: n.presupuesto_max }).eq('id', n.id)
    await api('laura', '/api/agentes/mercado', { activoId: LAURA_ACTIVO, regenerar: true }).catch((e) => console.log('  (Laura, análisis)', e.message))
  }
  const { data: todas } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of todas.users.filter((x) => x.email === CUENTAS.patricia)) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id)
    for (const p of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', p.id)
    await admin.from('calificaciones').delete().eq('comprador_id', u.id)
    await admin.from('conexiones').delete().eq('comprador_id', u.id)
    await admin.from('busquedas_registro').delete().eq('usuario_id', u.id)
    for (const t of ['analisis', 'necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', u.id)
    await admin.from('usuarios').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log('Restaurado el mundo demo.')
}

const tokens = {}
async function token(cuenta) {
  if (tokens[cuenta]) return tokens[cuenta]
  const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  if (cuenta === 'patricia') {
    // Patricia entra sin contraseña, como en el video (entrada demo).
    const r = await fetch(BASE + '/api/entrada-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'entrar', usuario: USUARIO_PATRICIA }) })
    const j = await r.json(); if (!r.ok) throw new Error(`entrada de Patricia: ${j.error}`)
    const { data, error } = await cli.auth.verifyOtp({ token_hash: j.tokenHash, type: 'email' })
    if (error) throw error
    return (tokens[cuenta] = data.session.access_token)
  }
  const { data, error } = await cli.auth.signInWithPassword({ email: CUENTAS[cuenta], password: PASS })
  if (error) throw error
  return (tokens[cuenta] = data.session.access_token)
}
const api = async (cuenta, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + await token(cuenta), 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${j.error ?? ''}`)
  return j
}
const redondear = (n, paso = 100_000) => Math.round(n / paso) * paso

// ── Grabación ────────────────────────────────────────────────────────────────────────────────
const marcas = []
// Un navegador nuevo en cada toma: en la primera corrida (18-nov) Chrome se cerró solo a la 6ª toma ("Connection closed").
const lanzar = () => puppeteer.launch({ defaultViewport: PANTALLA, args: ['--lang=es-MX'], env: { ...process.env, LANG: 'es_MX.UTF-8' } })
let browser = await lanzar()

let marcaActual = null
async function toma(nombre, cuenta, inicio, fn) {
  await browser.close().catch(() => {}); browser = await lanzar()
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(PANTALLA)
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-MX,es;q=0.9' })
  // Chrome headless deja de emitir cuadros cuando la página queda quieta (hallazgo del v4).
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = '@keyframes smtpulso{from{opacity:.011}to{opacity:.012}}#smt-rec{position:fixed;left:0;top:0;width:2px;height:2px;background:#000;animation:smtpulso .1s infinite alternate;z-index:2147483647;pointer-events:none}'
      document.head.appendChild(st)
      const d = document.createElement('div'); d.id = 'smt-rec'; document.body.appendChild(d)
    })
  })
  if (cuenta === 'patricia') {
    // Patricia entra como en el video: entrada demo, con su usuario y sin contraseña.
    await page.goto(`${BASE}/entrar?mundo=demo`, { waitUntil: 'networkidle2' }); await sleep(800)
    await page.click('[data-entrada-si]'); await page.waitForSelector('[data-campo="usuario-o-telefono"]')
    await page.type('[data-campo="usuario-o-telefono"]', USUARIO_PATRICIA); await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.pathname !== '/entrar', { timeout: 30000 })
  } else if (cuenta) {
    // Login con reintento: si React se hidrata mientras se escribe, el correo se borra (pasó con Lucía).
    for (let i = 0; i < 3; i++) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' }); await sleep(1200)
      await page.type('input[type="email"]', CUENTAS[cuenta]); await page.type('input[type="password"]', PASS)
      if (await page.$eval('input[type="email"]', (x) => x.value) !== CUENTAS[cuenta]) continue
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.click('button[type="submit"]')])
      try { await page.waitForFunction(() => location.pathname !== '/login', { timeout: 15000 }); break } catch { console.log('  (reintento de login)') }
    }
  }
  await page.goto(`${BASE}${inicio}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await sleep(2500)
  const rec = await grabar(page, nombre)
  const t0 = Date.now()
  rec.inicio(t0)
  const marca = (escena) => { marcas.push({ toma: nombre, escena, t: (Date.now() - t0) / 1000 }); console.log(`  [${nombre}] ${escena} @ ${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  marcaActual = (x, y) => marcas.push({ toma: nombre, escena: 'clic', t: (Date.now() - t0) / 1000, x, y })
  await sleep(300)
  try { await fn(page, marca) } catch (e) { await page.screenshot({ path: join(OUT, `${nombre}-error.png`), fullPage: true }).catch(() => {}); throw e }
  await sleep(1500)
  marca('fin')
  await rec.stop()
  await ctx.close()
}

// Grabador propio (11-nov): el page.screencast() de Puppeteer satura la máquina a 1440x900 (20 s de
// acción tardaban 61 s y el video se cortaba). Aquí cada cuadro de Chrome se guarda como JPG con su
// hora exacta y al final ffmpeg arma el video con la duración real de cada cuadro.
async function grabar(page, nombre) {
  const dir = join(OUT, `${nombre}-cuadros`)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const cdp = await page.createCDPSession()
  const cuadros = []
  let inicio = null, parado = false
  cdp.on('Page.screencastFrame', (e) => {
    if (parado) return
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
    const f = join(dir, `${String(cuadros.length).padStart(6, '0')}.jpg`)
    writeFileSync(f, Buffer.from(e.data, 'base64'))
    cuadros.push({ f, t: e.metadata.timestamp ?? Date.now() / 1000 })
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 2 })
  return {
    inicio: (t0) => { inicio = t0 / 1000 },
    stop: async () => {
      parado = true
      await cdp.send('Page.stopScreencast').catch(() => {})
      const fin = Date.now() / 1000
      if (!cuadros.length) throw new Error(`sin cuadros en ${nombre}`)
      // Lista para ffmpeg: cada cuadro dura hasta el siguiente. El video empieza en el instante de
      // inicio de la toma (como las marcas): antes del primer cuadro se repite el primero.
      // Tiempo de cada cuadro desde el inicio de la toma (los anteriores al inicio cuentan desde 0).
      const lineas = []
      const ts = cuadros.map((c) => Math.max(0, c.t - inicio))
      ts[0] = 0
      cuadros.forEach((c, i) => {
        const d = (i + 1 < cuadros.length ? ts[i + 1] : fin - inicio) - ts[i]
        if (d <= 0.0005) return
        lineas.push(`file '${c.f.replaceAll('\\', '/')}'`, `duration ${d.toFixed(4)}`)
      })
      lineas.push(`file '${cuadros.at(-1).f.replaceAll('\\', '/')}'`, 'duration 0.04')
      const lista = join(dir, 'lista.txt')
      writeFileSync(lista, lineas.join('\n'))
      execFileSync(process.env.FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista,
        '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16',
        join(OUT, `${nombre}.mp4`)])
      rmSync(dir, { recursive: true, force: true })
      console.log(`  [${nombre}] ${cuadros.length} cuadros, ${(fin - inicio).toFixed(1)} s`)
    },
  }
}

async function irA(page, texto, offset = 120, ms = 1400) {
  await page.evaluate(async (texto, offset, ms) => {
    const xpath = `//*[contains(normalize-space(text()), ${JSON.stringify(texto)})]`
    const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
    if (!el) return
    const destino = window.scrollY + el.getBoundingClientRect().top - offset
    const inicio = window.scrollY
    const t0 = performance.now()
    await new Promise((res) => {
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / ms)
        window.scrollTo(0, inicio + (destino - inicio) * (1 - Math.pow(1 - k, 3)))
        k < 1 ? requestAnimationFrame(paso) : res()
      }
      requestAnimationFrame(paso)
    })
  }, texto, offset, ms)
  await sleep(ms + 200)
}
// Clic por texto. Guarda la posición (0-1 de la pantalla) para el acercamiento del montaje.
async function clic(page, texto, dentroDe, exacto = false) {
  const pos = await page.evaluate((t, d, exacto) => {
    const esBoton = (x) => { const s = x.innerText.trim(); return exacto ? s === t : s === t || s.startsWith(t) }
    const raiz = d ? [...document.querySelectorAll('div')]
      .filter((x) => x.innerText.includes(d) && [...x.querySelectorAll('button, a')].some(esBoton))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0] : document
    const b = [...(raiz ?? document).querySelectorAll('button, a')].find(esBoton)
    if (!b) return null
    const r = b.getBoundingClientRect()
    b.click()
    return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
  }, texto, dentroDe, exacto)
  if (!pos) throw new Error(`no encontré «${texto}»${dentroDe ? ` en «${dentroDe}»` : ''}`)
  marcaActual?.(pos.x, pos.y)
}
async function clicHasta(page, texto, debeAparecer, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    await clic(page, texto)
    try { await esperar(page, debeAparecer, 8000); return } catch { console.log(`  (reintento «${texto}»)`) }
  }
  throw new Error(`«${texto}» no llevó a «${debeAparecer}»`)
}
const esperar = (page, t, timeout = 90000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout, polling: 400 }, t)
const escribir = async (page, el, t, delay = 45) => {
  const pos = await el.evaluate((x) => { const r = x.getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight } })
  marcaActual?.(pos.x, pos.y)
  await el.click(); await page.keyboard.type(t, { delay })
}
const campo = (page, nombre) => page.$(`input[name="${nombre}"]`)
const ponerValor = (page, selector, i, valor) => page.evaluate((sel, i, v) => {
  const el = document.querySelectorAll(sel)[i]
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, selector, i, valor)

// En "¿Dónde?" los ejemplos en gris (Valle, Country, Del Valle…) parecen datos capturados en un video de
// bodegas: para la grabación se quitan los ejemplos de los campos de zona.
const sinEjemplos = (page) => page.evaluate(() => {
  const f = () => document.querySelectorAll('input[name^="zona-"]').forEach((i) => { i.placeholder = '' })
  f(); new MutationObserver(f).observe(document.body, { childList: true, subtree: true })
})
process.on('unhandledRejection', (e) => console.error('  (aviso)', e?.message ?? e))

// Clic sobre un elemento por selector (para los chips y tarjetas con data-*).
async function clicSel(page, sel) {
  const pos = await page.evaluate((sel) => {
    const b = document.querySelector(sel)
    if (!b) return null
    b.scrollIntoView({ block: 'nearest' })
    const r = b.getBoundingClientRect(); b.click()
    return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
  }, sel)
  if (!pos) throw new Error(`no encontré ${sel}`)
  marcaActual?.(pos.x, pos.y)
}

try {
  // ── 1. Datos demo: el inventario de Valle Poniente y el teléfono de Diego ───────────────────
  const { data: sol, error: eSol } = await admin.from('solicitudes')
    .insert({ nombre: 'Diego Salinas', email: CUENTAS.diego, telefono: '81 2345 6789', rol: 'broker', status: 'aprobada' }).select('id').single()
  if (eSol) console.log('  (sin WhatsApp de ejemplo para Diego:', eSol.message, ')')
  else creados.solicitud = sol.id
  console.log('Inventario de Valle Poniente (Agente de Mercado, comparables reales)…')
  creados.inventario = await crearInventario({ admin, api, ids, fotosDir: process.env.FOTOS })
  const inv = creados.inventario
  // El depa de Diego también CERTIFICADO para renta (JC, 20-nov): Patricia renta uno certificado, como dice la voz
  // de Validar. Se borra con el inventario (cascada).
  const { error: eCertD } = await admin.from('certificaciones').insert({ activo_id: inv.diego.id, solicitado_por: ids.diego, estado: 'certificada', alcance: 'renta' })
  if (eCertD) throw eCertD
  const westId = inv.depas.find((d) => /Torre West/.test(d.nombre))?.id
  const privadaId = inv.depas.find((d) => /Privada/.test(d.nombre))?.id
  writeFileSync(join(OUT, 'datos.json'), JSON.stringify({ depas: inv.depas.map(({ id, nombre, superficie, renta, realista }) => ({ id, nombre, superficie, renta, realista })), diego: { id: inv.diego.id, renta: inv.diego.renta, realista: inv.diego.realista }, whatsapp: WHATSAPP }, null, 2))

  // ── 2. La página pública ────────────────────────────────────────────────────────────────────
  await toma('r0-publica', null, '/bienvenida?mundo=demo', async (page, marca) => {
    marca('hero'); await sleep(3500)
    await irA(page, '¿Qué quieres hacer?', 220, 1400)
    marca('puertas'); await sleep(3000)
  })

  // ── 3. Momento 1: la entrada simple ─────────────────────────────────────────────────────────
  await toma('r1-patricia-entrada', null, '/bienvenida?mundo=demo', async (page, marca) => {
    marca('publica'); await sleep(1200)
    await clicSel(page, '[data-iniciar-sesion]')
    await page.waitForFunction(() => location.pathname === '/entrar', { timeout: 30000 }); await esperar(page, '¿Ya eres miembro?')
    await sleep(600)
    marca('saludo'); await sleep(2200)
    await clicSel(page, '[data-entrada-no]'); await page.waitForSelector('[data-campo="nombre"]')
    marca('nombre'); await sleep(900)
    await escribir(page, await page.$('[data-campo="nombre"]'), NOMBRE_PATRICIA, 70); await sleep(500)
    await page.keyboard.press('Enter'); await page.waitForSelector('[data-campo="usuario"]')
    marca('usuario'); await sleep(2400)
    const sugerido = await page.$eval('[data-campo="usuario"]', (e) => e.value)
    if (sugerido !== USUARIO_PATRICIA) throw new Error(`el usuario sugerido es ${sugerido}`)
    await clic(page, 'Usar este'); await page.waitForSelector('[data-campo="whatsapp"]')
    marca('contacto'); await sleep(1200)
    await escribir(page, await page.$('[data-campo="whatsapp"]'), WHATSAPP, 70); await sleep(1300)
    await clic(page, 'Darme de alta'); await esperar(page, 'Ya eres miembro de SMT Match', 30000)
    marca('listo'); await sleep(3500)
  })

  // ── 4. Momento 2: ¿qué quieres hacer?, el chat y lo que rinde su renta ──────────────────────
  await toma('r2-patricia-chat', 'patricia', '/empezar?mundo=demo', async (page, marca) => {
    await esperar(page, '¿Qué quieres hacer?'); await sleep(500)
    marca('que'); await sleep(2600)
    await clicSel(page, '[data-opcion="rentar"]'); await esperar(page, '¿Cómo quieres hacerlo?')
    await sleep(700)
    marca('como'); await sleep(2600)
    await clicSel(page, '[data-camino="cuenta"]'); await page.waitForSelector('[data-chat-ficha] input')
    await sleep(900)
    marca('chat'); await sleep(1200)
    await escribir(page, await page.$('[data-chat-ficha] input'), MENSAJE, 38); await sleep(600)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-chips] [data-chip]', { timeout: 60000 })
    await page.waitForFunction(() => !document.body.innerText.includes('Anotando…'), { timeout: 60000 })
    await sleep(500)
    marca('chips'); await sleep(4200)
    // Si el chat pregunta algo más, lo contesta hasta que se active "Buscar".
    const respuestas = ['Para el próximo mes', 'Póliza jurídica', 'Sí', 'Así está bien']
    for (const r of respuestas) {
      if (await page.$eval('[data-buscar]', (b) => !b.disabled)) break
      await escribir(page, await page.$('[data-chat-ficha] input'), r, 45); await page.keyboard.press('Enter')
      await page.waitForFunction(() => !document.body.innerText.includes('Anotando…'), { timeout: 60000 }); await sleep(1500)
    }
    await clicSel(page, '[data-buscar]')
    await esperar(page, 'Guardar mi búsqueda', 150000)
    marca('resultados'); await sleep(1200)
    await irA(page, 'Te alcanzan', 300, 1300).catch(() => {})
    marca('rinde'); await sleep(5000)
    await irA(page, 'Guardar mi búsqueda', 300, 1200).catch(() => {})
    await clic(page, 'Guardar mi búsqueda')
    await page.waitForFunction(() => location.pathname === '/inicio', { timeout: 60000 }); await esperar(page, 'Tu tablero', 60000)
    marca('panel'); await sleep(2000)
  })

  const pu = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === CUENTAS.patricia)
  const { data: nec } = await admin.from('necesidades').select('id, zonas').eq('usuario_id', pu.id).single()
  // El registro de la búsqueda (momento 3) y los anuncios de portales se guardan en segundo plano.
  let reg = null
  for (let i = 0; i < 40 && !reg; i++) { reg = (await admin.from('busquedas_registro').select('resumen').eq('necesidad_id', nec.id).maybeSingle()).data; if (!reg) await sleep(3000) }
  console.log(`  registro: ${reg ? JSON.stringify(reg.resumen) : 'NO LLEGÓ'}`)
  const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', pu.id).single()
  const { data: radar } = await admin.from('radar_opciones').select('id').eq('perfil_id', pf.id)
  console.log(`  anuncios de portales en su Radar: ${radar.length}`)

  // ── 5. Momento 3: su tablero ────────────────────────────────────────────────────────────────
  await toma('r3-patricia-tablero', 'patricia', '/inicio', async (page, marca) => {
    await page.waitForSelector('[data-registro]', { timeout: 60000 }); await esperar(page, 'Encontradas por SMT Match'); await sleep(800)
    await irA(page, 'Revisamos', 160, 1300)
    marca('registro'); await sleep(4200)
    await irA(page, 'Encontradas por SMT Match', 120, 1500)
    marca('banda1'); await sleep(6500)
    await irA(page, 'En portales · sin certificar', 110, 1800)
    marca('banda3'); await sleep(4500)
  })

  // r4a · El otro lado: Diego ve la necesidad de Patricia en su panel y le propone su depa, en pantalla.
  const { necesidades: panelDiego } = await api('diego', '/api/necesidades')
  const resumenP = panelDiego.find((n) => n.id === nec.id)?.resumen
  if (!resumenP) throw new Error('la necesidad de Patricia no aparece en el panel de Diego')
  await toma('r4a-diego-propone', 'diego', '/portal-broker?pestana=necesidades', async (page, marca) => {
    await esperar(page, resumenP); await sleep(800)
    marca('panel'); await sleep(2500)
    // La tarjeta de la necesidad de Patricia: la más chica que tiene su resumen y el botón de proponer.
    const tarjeta = '[data-tarjeta-patricia]'
    await page.evaluate((r) => {
      const t = [...document.querySelectorAll('div')].filter((d) => d.querySelector('p')?.innerText.trim() === r && d.innerText.includes('Proponer propiedad'))
        .sort((a, b) => a.innerText.length - b.innerText.length)[0]
      t?.setAttribute('data-tarjeta-patricia', '1')
    }, resumenP)
    await page.evaluate(async (sel) => {
      const el = document.querySelector(sel); if (!el) return
      const destino = window.scrollY + el.getBoundingClientRect().top - 140, inicio = window.scrollY, t0 = performance.now()
      await new Promise((res) => { const paso = (t) => { const k = Math.min(1, (t - t0) / 1400); window.scrollTo(0, inicio + (destino - inicio) * (1 - Math.pow(1 - k, 3))); k < 1 ? requestAnimationFrame(paso) : res() }; requestAnimationFrame(paso) })
    }, tarjeta); await sleep(1600)
    marca('necesidad'); await sleep(3200)
    await clic(page, 'Proponer propiedad', resumenP)
    await esperar(page, 'De tu cartera, cumplen la ficha', 15000); await sleep(1200)
    marca('cartera'); await sleep(1500)
    await clicSel(page, `${tarjeta} input[type="radio"]`); await sleep(900)
    await clicSel(page, `${tarjeta} input[type="checkbox"]`); await sleep(900)
    await clic(page, 'Enviar propuesta')
    await page.waitForFunction((sel) => !document.querySelector(sel)?.innerText.includes('Enviando…'), { timeout: 60000 }, tarjeta); await sleep(1200)
    marca('enviada'); await sleep(3000)
  })
  if (!(await admin.from('propuestas').select('id').eq('necesidad_id', nec.id).eq('activo_id', inv.diego.id).maybeSingle()).data)
    throw new Error('la propuesta de Diego no quedó guardada')
  for (let i = 0; i < 45; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('necesidad_id', nec.id).maybeSingle(); if (data?.precio_mercado) break; await sleep(2000) }

  // r4 · banda 2: la propuesta de Diego
  await toma('r4-patricia-propuesta', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, 'Propuestas por asesores'); await sleep(800)
    await irA(page, 'Propuestas por asesores', 110, 1800)
    marca('banda2'); await sleep(6500)
  })

  // Me interesa en dos certificadas (la de Torre West y la de la Privada), por la API; la de Diego, en pantalla.
  console.log('Analizando dos certificadas para el comparativo…')
  for (const id of [westId, privadaId].filter(Boolean)) await api('patricia', '/api/analisis', { activoId: id, necesidadId: nec.id })

  // r5 · Me interesa en la de Diego → análisis → comparativo de las tres
  await toma('r5-patricia-analisis', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, NOMBRE_DIEGO); await sleep(600)
    await irA(page, NOMBRE_DIEGO, 300, 1400)
    marca('meinteresa'); await sleep(1500)
    await clic(page, 'Me interesa', NOMBRE_DIEGO); await sleep(1200)
    marca('analizando')
    await page.waitForFunction(() => location.pathname === '/analisis', { timeout: 180000 })
    await esperar(page, 'Renta contra mercado', 90000); await sleep(1800)
    await irA(page, 'Renta contra mercado', 160, 1000).catch(() => {})
    marca('precio'); await sleep(4200)
    await irA(page, '¿Cumple lo que buscas?', 120, 1300)
    marca('cumple'); await sleep(4200)
    await irA(page, 'Comparativo', 110, 1800)
    marca('comparativo'); await sleep(5500)
  })

  // r6 · Conectar → contacto con WhatsApp (la propuesta de un asesor se conecta sola)
  await toma('r6-patricia-conectar', 'patricia', `/analisis#${inv.diego.id}`, async (page, marca) => {
    await esperar(page, 'Conectar'); await sleep(1200)
    await irA(page, 'Te conectamos con quien la ofrece', 420, 1200).catch(() => {})
    marca('conectar'); await sleep(2000)
    await clic(page, 'Conectar', NOMBRE_DIEGO, true)
    await esperar(page, 'Escribir por WhatsApp', 60000); await sleep(600)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
    await irA(page, 'Contacto', 160, 1000).catch(() => {})
    marca('contacto'); await sleep(5000)
  })
  const { data: cx } = await admin.from('conexiones').select('id').eq('comprador_id', pu.id).eq('activo_id', inv.diego.id).single()

  // r7 · a los 7 días: ¿En qué va? → Negociando
  await toma('r7-patricia-estado', 'patricia', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, '¿En qué va?'); await sleep(600)
    await irA(page, '¿En qué va?', 200, 1300)
    marca('enquevas'); await sleep(2800)
    await clicSel(page, '[data-estado="negociando"]')
    await page.waitForFunction(() => document.querySelector('[data-estado="negociando"]')?.disabled, { timeout: 30000 })
    marca('negociando'); await sleep(3500)
  })

  // r8a · Al firmar, el otro lado: Diego reporta la renta en su pantalla (renta mensual; la fecha es hoy).
  await toma('r8a-diego-reporta', 'diego', `/conexion/${cx.id}`, async (page, marca) => {
    await page.waitForSelector('input[name="cierre-precio"]', { timeout: 60000 }); await sleep(600)
    await irA(page, 'Cuando quede rentada', 260, 1300).catch(() => {})
    marca('reportar'); await sleep(2000)
    await escribir(page, await page.$('input[name="cierre-precio"]'), String(inv.diego.renta), 90); await sleep(900)
    await clic(page, 'Reportar renta')
    await esperar(page, 'Renta reportada', 30000); await sleep(800)
    marca('reportada'); await sleep(3500)
  })

  // r8 · Patricia confirma y califica al asesor
  await toma('r8-patricia-cierre', 'patricia', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, 'Confirmo que ya rento', 60000); await sleep(600)
    await irA(page, 'Renta reportada', 220, 1300).catch(() => {})
    marca('reportada'); await sleep(3500)
    await clic(page, 'Confirmo que ya rento')
    await esperar(page, 'Califica al asesor', 30000); await sleep(800)
    await irA(page, 'Califica al asesor', 260, 1100).catch(() => {})
    marca('confirmada'); await sleep(2800)
    // Cinco estrellas en atención, rapidez y honestidad (la quinta de cada fila).
    for (let k = 0; k < 3; k++) {
      const pos = await page.evaluate((k) => {
        const b = document.querySelectorAll('button[aria-label="5 de 5"]')[k]
        if (!b) return null
        const r = b.getBoundingClientRect(); b.click()
        return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
      }, k)
      if (pos) marcaActual?.(pos.x, pos.y)
      await sleep(700)
    }
    marca('estrellas'); await sleep(1200)
    await clic(page, 'Enviar calificación')
    await esperar(page, 'Calificación: atención', 30000)
    marca('calificada'); await sleep(3500)
  })

  writeFileSync(join(OUT, 'marcas.json'), JSON.stringify(marcas, null, 2))
  console.log(`\nTomas y marcas en ${OUT}`)
} catch (e) {
  console.error('ERROR', e.message)
  writeFileSync(join(OUT, 'marcas.json'), JSON.stringify(marcas, null, 2))
  process.exitCode = 1
} finally {
  await Promise.race([browser.close().catch(() => {}), sleep(15000)])
  await restaurar()
}
