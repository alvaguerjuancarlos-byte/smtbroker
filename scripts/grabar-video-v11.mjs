// Graba las tomas del video demo v11 (guion-demo-v11, aprobado por JC el 18-nov-2026; Documento Maestro
// V10 §24.6): la historia contada desde el cliente. Contra producción, en el MUNDO DEMO (no manda
// correos ni toca datos reales). Pantalla 1440×900; cada clic deja su posición en marcas.json para el
// acercamiento del montaje. Infraestructura (grabador por cuadros, clics, scroll) igual que el v10.
//   r0  Página pública: "Compra, vende o renta con certeza" y las cuatro puertas           (escena 3)
//   r1  Patricia: Comprar → Por mi cuenta → ficha (bodega, Apodaca y Escobedo, presupuesto) →
//       lo que rinde su dinero → crea su cuenta                                           (escenas 4-7)
//   r2  Patricia: su tablero, banda 1 (certificadas) y banda 3 (portales)                  (escenas 8-9)
//   r3  Patricia: "al día siguiente", banda 2 con la propuesta de Diego                     (escena 10)
//   r4  Patricia: Me interesa en la de Diego → análisis → comparativo de las tres         (escenas 11-13)
//   r5  Patricia: Conectar → contacto con WhatsApp                                          (escena 14)
//   r6  Patricia: "a los 7 días", ¿En qué va? → Negociando                                 (escena 14a)
//   r7  Laura (dueña): su tablero, precio contra mercado y quién busca algo como lo suyo   (escena 14b)
//   r8  Diego: el panel de necesidades (para la invitación a asesores)                     (escena 16)
//
// Datos demo (se crean aquí y se BORRAN al terminar, aunque algo falle): la bodega de Diego en Apodaca y
// tres bodegas CERTIFICADAS de Ricardo (dos en Apodaca y una en General Escobedo), con foto (cuadros de
// las tomas reales, v11/fotos), y la cuenta de Patricia. Los precios salen del Agente de Mercado con
// comparables reales, como en el v10.
//
// Uso: FFMPEG=<ffmpeg.exe> FOTOS=<carpeta v11/fotos> node --env-file=.env.local scripts/grabar-video-v11.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v11'
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG || !process.env.FOTOS) throw new Error('Faltan DEMO_PASSWORD (.env.local), FFMPEG y FOTOS')
mkdirSync(OUT, { recursive: true })
const PASS = process.env.DEMO_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SUFIJO = Math.random().toString(36).slice(2, 8)
const PANTALLA = { width: 1440, height: 900, deviceScaleFactor: 1 }
const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx', laura: 'laura.garza@demo.smtbroker.mx',
  patricia: `recorrido.patricia.v11.${SUFIJO}@demo.smtbroker.mx`,
}
const BODEGA_DIEGO = 'Bodega en Parque Industrial Apodaca'
const creados = { activos: [], solicitud: null, fotos: [], anuncios: [], laura: null }
// Escena 14b: precio demo de Laura y presupuestos de las búsquedas que la cuentan (se restauran al final).
const LAURA_ACTIVO = '7c0c1823-f952-47ee-8e7b-bd5cce4d44d2'
// Precio por m² típico de bodegas en General Escobedo (el de "lo que rinde tu dinero", grabación del 18-nov).
// Se ajusta al real en cuanto Patricia guarda su búsqueda.
const ESCOBEDO_M2 = 12_600

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
const ids = { ricardo: lista.users.find((u) => u.email === CUENTAS.ricardo).id, diego: lista.users.find((u) => u.email === CUENTAS.diego).id }

async function restaurar() {
  if (creados.fotos.length) await admin.storage.from('fotos-activos').remove(creados.fotos)
  if (creados.activos.length) {
    await admin.from('conexiones').delete().in('activo_id', creados.activos)
    await admin.from('activos').delete().in('id', creados.activos) // cascada: propuestas, análisis, certificaciones, diagnósticos
  }
  if (creados.solicitud) await admin.from('solicitudes').delete().eq('id', creados.solicitud)
  if (creados.anuncios.length) await admin.from('radar_anuncios').delete().in('id', creados.anuncios)
  if (creados.laura) {
    await admin.from('activos').update({ precio_total: creados.laura.precio }).eq('id', LAURA_ACTIVO)
    for (const n of creados.laura.necesidades) await admin.from('necesidades').update({ presupuesto_min: n.presupuesto_min, presupuesto_max: n.presupuesto_max }).eq('id', n.id)
    // El análisis guardado de Laura se recalcula con su precio original.
    await api('laura', '/api/agentes/mercado', { activoId: LAURA_ACTIVO, regenerar: true }).catch((e) => console.log('  (Laura, análisis)', e.message))
  }
  const { data: todas } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of todas.users.filter((x) => x.email === CUENTAS.patricia)) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id)
    for (const p of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', p.id)
    await admin.from('conexiones').delete().eq('comprador_id', u.id)
    for (const t of ['analisis', 'necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', u.id)
    await admin.from('usuarios').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log('Restaurado el mundo demo.')
}

async function token(cuenta) {
  const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await cli.auth.signInWithPassword({ email: CUENTAS[cuenta], password: PASS })
  if (error) throw error
  return data.session.access_token
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
  if (cuenta) {
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
  // ── 1. Datos demo y precios de mercado reales ──────────────────────────────────────────────
  const { data: sol, error: eSol } = await admin.from('solicitudes')
    .insert({ nombre: 'Diego Salinas', email: CUENTAS.diego, telefono: '81 2345 6789', rol: 'broker', status: 'aprobada' }).select('id').single()
  if (eSol) console.log('  (sin WhatsApp de ejemplo para Diego:', eSol.message, ')')
  else creados.solicitud = sol.id

  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({ estado: 'Nuevo León', status: 'ingresado', precio_total: 8_000_000, es_demo: true, ...campos }).select('id').single()
    if (error) throw error
    creados.activos.push(data.id)
    return data.id
  }
  const bodegaDiego = await nueva({
    usuario_id: ids.diego, broker_id: ids.diego, cargado_por: 'broker', representacion_tipo: 'exclusiva',
    representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Inmobiliaria del Norte',
    nombre: BODEGA_DIEGO, tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Parque Industrial', superficie: 1200,
  })
  const cert1 = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Bodega Apodaca Sur', tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Apodaca Centro', superficie: 1100 })
  const cert2 = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Nave en Huinalá', tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Huinalá', superficie: 1300 })
  const escobedo = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Nave en Escobedo', tipo: 'Bodega', municipio: 'General Escobedo', colonia: 'Parque Industrial Escobedo', superficie: 1150 })
  // Las tres de Ricardo, certificadas (banda 1, "Certificada por SMT Match").
  const { error: eCert } = await admin.from('certificaciones').insert([cert1, cert2, escobedo].map((activo_id) => ({ activo_id, solicitado_por: ids.ricardo, estado: 'certificada' })))
  if (eCert) throw eCert
  // Fotos de portada (cuadros de las tomas reales): la nave blanca para la de Diego.
  for (const [id, f] of [[bodegaDiego, 'bodega1.jpg'], [cert1, 'bodega3.jpg'], [cert2, 'bodega4.jpg'], [escobedo, 'bodega2.jpg']]) {
    const ruta = `${id}/portada.jpg`
    const { error } = await admin.storage.from('fotos-activos').upload(ruta, readFileSync(join(process.env.FOTOS, f)), { contentType: 'image/jpeg', upsert: true })
    if (error) console.log('  (foto)', error.message); else creados.fotos.push(ruta)
  }

  console.log('Calculando el precio de mercado (Agente de Mercado, comparables reales)…')
  const mercado = async (cuenta, activoId) => {
    let m = await api(cuenta, '/api/agentes/mercado', { activoId })
    for (let i = 0; i < 2 && m.precioSalidaRecomendadoMXN == null; i++) m = await api(cuenta, '/api/agentes/mercado', { activoId, regenerar: true })
    return m
  }
  const [mD, m1, m2, mE] = await Promise.all([mercado('diego', bodegaDiego), mercado('ricardo', cert1), mercado('ricardo', cert2), mercado('ricardo', escobedo)])
  // Un precio/m² fuera de lo real para bodegas en Monterrey ($12,000 a $45,000) es un mal comparable: se usa $21,000/m².
  const salida = (m, sup) => { const p = m.precioSalidaRecomendadoMXN; return p && p / sup >= 12_000 && p / sup <= 45_000 ? p : 21_000 * sup }
  const precios = {
    diego: redondear(salida(mD, 1200)), cert1: redondear(salida(m1, 1100) * 0.95), cert2: redondear(salida(m2, 1300) * 0.97),
    // La de Escobedo, un poco abajo del precio típico de su zona, para que la tarjeta y el comparativo digan lo mismo.
    escobedo: redondear(ESCOBEDO_M2 * 1150 * 0.95),
  }
  console.log(`  mercado: Diego ${mD.precioSalidaRecomendadoMXN} · Sur ${m1.precioSalidaRecomendadoMXN} · Huinalá ${m2.precioSalidaRecomendadoMXN} · Escobedo ${mE.precioSalidaRecomendadoMXN} → ${JSON.stringify(precios)}`)
  for (const [id, p] of [[bodegaDiego, precios.diego], [cert1, precios.cert1], [cert2, precios.cert2], [escobedo, precios.escobedo]]) await admin.from('activos').update({ precio_total: p }).eq('id', id)
  const todos = Object.values(precios)
  const presupuesto = { min: redondear(Math.min(...todos) * 0.92), max: redondear(Math.max(...todos) * 1.06) }
  console.log(`  presupuesto de Patricia: ${presupuesto.min} a ${presupuesto.max}`)
  writeFileSync(join(OUT, 'datos.json'), JSON.stringify({ precios, presupuesto }, null, 2))

  // ── 2. La página pública ──────────────────────────────────────────────────────────────────
  await toma('r0-publica', null, '/bienvenida', async (page, marca) => {
    marca('hero'); await sleep(3500)
    await irA(page, '¿Qué quieres hacer?', 220, 1400)
    marca('puertas'); await sleep(3500)
  })

  // ── 3. Patricia: por su cuenta, su ficha y su cuenta ──────────────────────────────────────
  await toma('r1-patricia-ficha', null, '/bienvenida', async (page, marca) => {
    await irA(page, '¿Qué quieres hacer?', 220, 900)
    marca('puertas'); await sleep(1500)
    await clicSel(page, '[data-puerta="comprar"]'); await esperar(page, '¿Cómo quieres hacerlo?')
    await sleep(800)
    marca('como'); await sleep(3200)
    await clicSel(page, '[data-camino="cuenta"]'); await esperar(page, 'Prefiero llenar la ficha a mano')
    await sleep(900)
    await clic(page, 'Prefiero llenar la ficha a mano'); await esperar(page, '¿Quieres comprar o rentar?')
    await sleep(700)
    await clicHasta(page, 'Comprar', '¿Qué tipo de propiedad buscas?')
    marca('tipo'); await sleep(1300)
    await clicHasta(page, 'Bodega', 'Lo mínimo que necesitas')
    marca('caract'); await sleep(900)
    const nums = await page.$$('input[inputmode="numeric"]')
    await escribir(page, nums[0], '1000'); await escribir(page, nums[1], '8'); await escribir(page, nums[2], '2')
    await sleep(300); await clic(page, 'Piso industrial'); await sleep(1100)
    await clic(page, 'Continuar'); await esperar(page, 'Hasta tres zonas'); await sinEjemplos(page)
    marca('ubicacion'); await sleep(800)
    await escribir(page, await campo(page, 'zona-0-municipio'), 'Apodaca', 70); await sleep(700)
    await clic(page, '+ Agregar otra zona'); await sleep(900)
    await escribir(page, await campo(page, 'zona-1-municipio'), 'General Escobedo', 60); await sleep(1500)
    marca('dos'); await sleep(1500)
    await clic(page, 'Continuar'); await esperar(page, '¿Cómo pagarías?')
    marca('presupuesto'); await sleep(700)
    await escribir(page, await campo(page, 'presupuesto-min'), String(presupuesto.min), 35)
    await escribir(page, await campo(page, 'presupuesto-max'), String(presupuesto.max), 35)
    await sleep(300); await clic(page, 'Contado'); await sleep(350); await clic(page, 'Ya', null, true); await sleep(1100)
    await clic(page, 'Buscar'); await esperar(page, 'Para guardar tu búsqueda', 150000)
    marca('resultados'); await sleep(1500)
    await irA(page, 'Te alcanzan', 300, 1300).catch(() => {})
    marca('zonas'); await sleep(5500)
    await irA(page, 'Para guardar tu búsqueda', 90, 1300)
    const cta = await page.$$('form input:not(.hidden)')
    await escribir(page, cta[0], 'Patricia Longoria', 30); await escribir(page, cta[1], '81 8765 4321', 30)
    await escribir(page, cta[2], CUENTAS.patricia, 12); await escribir(page, cta[3], PASS, 12)
    await sleep(500)
    await clic(page, 'Crear mi cuenta'); await esperar(page, 'Tu tablero', 90000)
    marca('panel'); await sleep(2500)
  })

  const { data: pu } = await admin.from('usuarios').select('id').eq('nombre', 'Patricia Longoria').eq('es_demo', true).order('created_at', { ascending: false }).limit(1).single()
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', pu.id).single()
  const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', pu.id).single()
  // Escobedo con el precio por m² real de su zona (se guarda en segundo plano al crear la búsqueda).
  for (let i = 0; i < 30; i++) {
    const { data } = await admin.from('necesidades').select('zonas').eq('id', nec.id).single()
    const pm = data.zonas?.find((z) => /Escobedo/.test(z.municipio))?.mercado?.precioM2
    if (pm) {
      const p = Math.max(redondear(pm * 1150 * 0.95), presupuesto.min)
      await admin.from('activos').update({ precio_total: p }).eq('id', escobedo)
      console.log(`  Escobedo: ${Math.round(pm)}/m² en su zona → ${p}`)
      break
    }
    await sleep(2000)
  }
  // Los anuncios de portales que trae el motor se guardan en segundo plano: se espera a que dejen de llegar.
  let previo = -1
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.from('radar_opciones').select('id').eq('perfil_id', pf.id)
    if (data.length === previo && previo > 0) break
    previo = data.length; await sleep(4000)
  }
  console.log(`  anuncios de portales en su Radar: ${previo}`)
  // Sin anuncios del motor (p. ej. Serper sin créditos, 18-nov): anuncios REALES que la misma búsqueda trajo el
  // 11-nov para bodegas en venta en Apodaca, más uno de EasyBroker verificado. Solo título y liga a la fuente.
  if (previo < 3) {
    const reales = [
      { url: 'https://www.inmuebles24.com/bodegas-comerciales-en-venta-en-apodaca.html', fuente: 'inmuebles24', titulo: '89 Bodegas comerciales en venta en Apodaca, Nuevo León' },
      { url: 'https://propiedades.com/apodaca/bodegas-industriales-venta', fuente: 'propiedades', titulo: '126 Bodegas Industriales en Venta en Apodaca' },
      { url: 'https://www.vivanuncios.com.mx/s-venta-bodegas/apodaca/v1c33l14832p1', fuente: 'vivanuncios', titulo: '84 Bodegas en venta - Apodaca, Nuevo León' },
      { url: 'https://inmobiliaria-de-alianza-cinco.easybroker.com/property/bodega-industrial-apodaca-en-parque-industrial', fuente: 'easybroker', titulo: 'Bodega Industrial Apodaca en Parque Industrial' },
    ]
    for (const a of reales) {
      const { data: ya } = await admin.from('radar_anuncios').select('id').eq('url', a.url).eq('es_demo', true).maybeSingle()
      let id = ya?.id
      if (!id) {
        const { data, error } = await admin.from('radar_anuncios').insert({ ...a, tipo: 'Bodega', municipio: 'Apodaca', es_demo: true }).select('id').single()
        if (error) { console.log('  (anuncio)', error.message); continue }
        id = data.id; creados.anuncios.push(id)
      }
      await admin.from('radar_opciones').insert({ perfil_id: pf.id, anuncio_id: id, origen: 'motor' })
    }
    console.log(`  cargados ${reales.length} anuncios reales de portales para la banda 3`)
  }

  // r2 · su tablero: banda 1 (certificadas) y banda 3 (portales)
  await toma('r2-patricia-tablero', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, 'Encontradas por SMT Match'); await sleep(800)
    await irA(page, 'Tu tablero', 90, 1500)
    marca('banda1'); await sleep(6500)
    await irA(page, 'En portales · sin certificar', 110, 1800)
    marca('banda3'); await sleep(5000)
  })

  // Al día siguiente: Diego le propone su bodega (desde su panel, por la API).
  await api('diego', '/api/propuestas', { necesidadId: nec.id, activoId: bodegaDiego, aceptoTerminos: true })
  for (let i = 0; i < 45; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('necesidad_id', nec.id).maybeSingle(); if (data?.precio_mercado) break; await sleep(2000) }

  // r3 · banda 2: la propuesta de Diego
  await toma('r3-patricia-propuesta', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, 'Propuestas por asesores'); await sleep(800)
    await irA(page, 'Propuestas por asesores', 110, 1800)
    marca('banda2'); await sleep(6500)
  })

  console.log('Analizando las dos certificadas (comparativo)…')
  await api('patricia', '/api/analisis', { activoId: cert1, necesidadId: nec.id })
  await api('patricia', '/api/analisis', { activoId: escobedo, necesidadId: nec.id })

  // r4 · Me interesa en la de Diego → análisis → comparativo
  await toma('r4-patricia-analisis', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, BODEGA_DIEGO); await sleep(600)
    await irA(page, BODEGA_DIEGO, 300, 1400)
    marca('meinteresa'); await sleep(1500)
    await clic(page, 'Me interesa', BODEGA_DIEGO); await sleep(1200)
    marca('analizando')
    await page.waitForFunction(() => location.pathname === '/analisis', { timeout: 180000 })
    await esperar(page, 'precio contra mercado', 60000); await sleep(1800)
    await irA(page, 'Precio contra mercado', 160, 1000).catch(() => {})
    marca('precio'); await sleep(4000)
    await irA(page, 'Plusvalía · proyección', 120, 1300)
    marca('plusvalia'); await sleep(3500)
    await irA(page, '¿Cumple lo que buscas?', 120, 1300)
    marca('cumple'); await sleep(4000)
    await irA(page, 'Comparativo', 110, 1800)
    marca('comparativo'); await sleep(5500)
  })

  // r5 · Conectar → contacto con WhatsApp (la propuesta se conecta sola: origen "propuesta")
  await toma('r5-patricia-conectar', 'patricia', `/analisis#${bodegaDiego}`, async (page, marca) => {
    await esperar(page, 'Conectar'); await sleep(1200)
    await irA(page, 'Te conectamos con quien la ofrece', 420, 1200).catch(() => {})
    marca('conectar'); await sleep(2000)
    await clic(page, 'Conectar', BODEGA_DIEGO, true)
    await esperar(page, 'Escribir por WhatsApp', 60000); await sleep(600)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
    await irA(page, 'Contacto', 160, 1000).catch(() => {})
    marca('contacto'); await sleep(5000)
  })
  const { data: cx } = await admin.from('conexiones').select('id').eq('comprador_id', pu.id).eq('activo_id', bodegaDiego).single()

  // r6 · a los 7 días: ¿En qué va? → Negociando
  await toma('r6-patricia-estado', 'patricia', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, '¿En qué va?'); await sleep(600)
    await irA(page, '¿En qué va?', 200, 1300)
    marca('enquevas'); await sleep(2800)
    await clicSel(page, '[data-estado="negociando"]')
    await page.waitForFunction(() => document.querySelector('[data-estado="negociando"]')?.disabled, { timeout: 30000 })
    marca('negociando'); await sleep(3500)
  })

  // r7 · Laura (dueña): su precio ~8 % arriba del realista; los presupuestos de las búsquedas de
  // departamento en San Pedro suben en la misma proporción (siguen 3 que sí y 1 con menos presupuesto).
  {
    const { data: act } = await admin.from('activos').select('precio_total').eq('id', LAURA_ACTIVO).single()
    const { data: ns } = await admin.from('necesidades').select('id,presupuesto_min,presupuesto_max').eq('es_demo', true)
      .eq('tipo', 'departamento').eq('operacion', 'compra').eq('municipio', 'San Pedro Garza García')
    creados.laura = { precio: act.precio_total, necesidades: ns }
    const m = await api('laura', '/api/agentes/mercado', { activoId: LAURA_ACTIVO })
    const realista = m.precioSalidaRecomendadoMXN
    if (!realista) throw new Error('sin precio realista para Laura')
    const nuevo = redondear(realista * 1.08)
    const f = nuevo / act.precio_total
    await admin.from('activos').update({ precio_total: nuevo }).eq('id', LAURA_ACTIVO)
    for (const n of ns) await admin.from('necesidades').update({ presupuesto_min: redondear(n.presupuesto_min * f), presupuesto_max: redondear(n.presupuesto_max * f) }).eq('id', n.id)
    await api('laura', '/api/agentes/mercado', { activoId: LAURA_ACTIVO, regenerar: true })
    console.log(`  Laura: realista ${realista} → su precio ${nuevo}; ${ns.length} búsquedas ×${f.toFixed(2)}`)
  }

  // r7 · Laura (dueña): su tablero
  await toma('r7-laura-tablero', 'laura', '/inicio', async (page, marca) => {
    await page.waitForSelector('[data-demanda]', { timeout: 120000 })
    await page.waitForFunction(() => !document.body.innerText.includes('Analizando el mercado'), { timeout: 120000 }).catch(() => {})
    await sleep(800)
    await irA(page, 'Tu precio realista', 140, 1200).catch(() => {})
    marca('precio'); await sleep(3500)
    await irA(page, 'Quién busca algo como lo tuyo', 160, 1300)
    marca('demanda'); await sleep(4500)
  })

  // r8 · Diego: el panel de necesidades (invitación a asesores)
  await toma('r8-diego-panel', 'diego', '/portal-broker?pestana=necesidades', async (page, marca) => {
    await esperar(page, 'Busca'); await sleep(800)
    marca('panel'); await sleep(4500)
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
