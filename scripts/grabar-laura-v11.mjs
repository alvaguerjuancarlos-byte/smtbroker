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
  // r7 · Laura (dueña): su precio ~8 % arriba del realista; los presupuestos de las búsquedas de
  // departamento en San Pedro suben en la misma proporción (siguen 3 que sí y 1 con menos presupuesto).
  {
    const { data: act } = await admin.from('activos').select('precio_total').eq('id', LAURA_ACTIVO).single()
    const { data: ns } = await admin.from('necesidades').select('id,presupuesto_min,presupuesto_max').eq('es_demo', true)
      .eq('tipo', 'departamento').eq('operacion', 'compra').eq('municipio', 'San Pedro Garza García')
    creados.laura = { precio: act.precio_total, necesidades: ns }
    // El realista del agente cambia al recalcular: se ajusta el precio hasta quedar 4 % a 15 % arriba.
    const escalar = async (p) => {
      const f = p / act.precio_total
      await admin.from('activos').update({ precio_total: p }).eq('id', LAURA_ACTIVO)
      for (const n of ns) await admin.from('necesidades').update({ presupuesto_min: redondear(n.presupuesto_min * f), presupuesto_max: redondear(n.presupuesto_max * f) }).eq('id', n.id)
      const m = await api('laura', '/api/agentes/mercado', { activoId: LAURA_ACTIVO, regenerar: true })
      return m.precioSalidaRecomendadoMXN
    }
    let nuevo = 16_100_000 * 1.08, realista = null
    for (let i = 0; i < 5; i++) {
      nuevo = redondear(nuevo); realista = await escalar(nuevo)
      console.log(`  intento ${i + 1}: su precio ${nuevo} · realista ${realista} → ${Math.round((nuevo / realista - 1) * 100)} %`)
      if (realista && nuevo / realista >= 1.04 && nuevo / realista <= 1.15) break
      nuevo = (realista ?? nuevo) * 1.08
    }
    const f = nuevo / act.precio_total
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
