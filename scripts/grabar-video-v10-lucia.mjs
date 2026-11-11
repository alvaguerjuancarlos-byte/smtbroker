// Graba las tomas del video demo v10 (guion-demo-v10, aprobado por JC el 11-nov-2026; Documento Maestro
// V9): la historia del v9b con el nuevo look (estilo C), la búsqueda en tres zonas y una escena de renta.
// Contra producción, en el MUNDO DEMO (no manda correos ni toca datos reales). Pantalla de escritorio
// 1440×900 en 2x; cada clic deja su posición en marcas.json para el acercamiento del montaje.
//   r1  Patricia: ¿comprar o rentar? → bodega → tres zonas → presupuesto → resultados por zona → cuenta
//   r1b Patricia: su bandeja por zona y "Leer el anuncio" de un portal                     (escena 6b)
//   r2  Diego ve la necesidad (COMPRA · TU ZONA) y propone su bodega                     (escenas 7-8)
//   r3  Patricia: bandeja por zona → Me interesa → análisis → comparativo               (escenas 9-13)
//   r4  Patricia: Quiero verla → conversación → propone horarios                        (escenas 14-15)
//   r5  Diego confirma la visita y aparecen los teléfonos                                (escena 15)
//   r6  Patricia: ¿cómo te fue? → quiero ofertar → intención de oferta                   (escena 16)
//   r7  Diego reporta el cierre                                                           (escena 17)
//   r8  Patricia confirma que compró y califica a Diego                                   (escena 17)
//   r9  Lucía: Rentar → departamento → renta mensual, plazo, garantía y mascotas         (escena 17b)
//   r10 Lucía: su análisis en renta (renta contra mercado, para entrar y cada mes)       (escena 17b)
//
// Datos demo (se crean aquí y se BORRAN al terminar, aunque algo falle): bodegas en Apodaca (la de Diego
// y dos de Ricardo) y una en General Escobedo; Santa Catarina queda sin opciones a propósito. Un
// anuncio de portal que se deja leer (sitio de un broker en EasyBroker: Spot2 y Vivanuncios bloquean
// desde el 11-nov). Un departamento en renta en Valle Oriente y las cuentas de Patricia y Lucía.
// Los precios salen del Agente de Mercado con comparables reales, como en el v9.
//
// Uso: FFMPEG=<ffmpeg.exe> node --env-file=.env.local scripts/grabar-video-v10.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v10'
// SOLO LUCÍA (11-nov): vuelve a grabar las tomas r9 y r10 sin repetir las de Patricia.
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG) throw new Error('Faltan DEMO_PASSWORD (.env.local) y FFMPEG')
mkdirSync(OUT, { recursive: true })
const PASS = process.env.DEMO_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const INICIO = new Date().toISOString()
const SUFIJO = Math.random().toString(36).slice(2, 8)
const PANTALLA = { width: 1440, height: 900, deviceScaleFactor: 1 } // con 2x el grabador se atrasa y corta las tomas (11-nov)
const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx',
  patricia: `recorrido.patricia.v10.${SUFIJO}@demo.smtbroker.mx`, lucia: `recorrido.lucia.v10.${SUFIJO}@demo.smtbroker.mx`,
}
const ANUNCIO = { url: 'https://inmobiliaria-de-alianza-cinco.easybroker.com/property/bodega-industrial-apodaca-en-parque-industrial', fuente: 'easybroker', titulo: 'Bodega Industrial Apodaca en Parque Industrial' }
const creados = { activos: [], solicitud: null, anuncio: null }

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
const ids = { ricardo: lista.users.find((u) => u.email === CUENTAS.ricardo).id, diego: lista.users.find((u) => u.email === CUENTAS.diego).id }

async function restaurar() {
  if (creados.activos.length) await admin.from('activos').delete().in('id', creados.activos) // cascada: propuestas, análisis, conexiones, cierres, diagnósticos
  if (creados.solicitud) await admin.from('solicitudes').delete().eq('id', creados.solicitud)
  const { data: todas } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of todas.users.filter((x) => x.email === CUENTAS.patricia || x.email === CUENTAS.lucia)) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id)
    for (const p of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', p.id)
    for (const t of ['analisis', 'necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', u.id)
    await admin.from('conexiones').delete().eq('comprador_id', u.id)
    await admin.from('usuarios').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  await admin.from('radar_anuncios').delete().eq('es_demo', true).gte('created_at', INICIO)
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
const browser = await puppeteer.launch({ defaultViewport: PANTALLA, args: ['--lang=es-MX'], env: { ...process.env, LANG: 'es_MX.UTF-8' } })

let marcaActual = null
async function toma(nombre, cuenta, inicio, fn) {
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

try {
  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({ estado: 'Nuevo León', status: 'ingresado', ...campos }).select('id').single()
    if (error) throw error
    creados.activos.push(data.id)
    return data.id
  }
  const depaRenta = await nueva({
    usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Departamento en Valle Oriente', tipo: 'Departamento', municipio: 'San Pedro Garza García',
    colonia: 'Valle Oriente', superficie: 115, precio_total: null, operacion: 'renta', renta_mensual: 55_000,
    renta: { incluye_mantenimiento: false, mantenimiento: 3500, deposito_meses: 2, plazo_minimo: '1_anio', garantia: 'cualquiera', amueblada: true, mascotas: true },
  })
  let mR = await api('ricardo', '/api/agentes/mercado', { activoId: depaRenta })
  for (let i = 0; i < 2 && !mR.renta?.rentaRealistaMXN; i++) mR = await api('ricardo', '/api/agentes/mercado', { activoId: depaRenta, regenerar: true })
  const renta = mR.renta?.rentaRealistaMXN ? Math.round(mR.renta.rentaRealistaMXN / 1000) * 1000 : 55_000
  await admin.from('activos').update({ renta_mensual: renta }).eq('id', depaRenta)
  console.log(`  renta del depa: ${renta}`)

  // ── 3. Lucía: rentar (escena 17b) ─────────────────────────────────────────────────────────
  // r9 · su ficha de renta en /empezar (se graba hasta la renta mensual; la cuenta se crea por API)
  await toma('r9-lucia-ficha', null, '/empezar', async (page, marca) => {
    await clicHasta(page, 'Quiero comprar o rentar', '¿Quieres comprar o rentar?')
    marca('operacion'); await sleep(1800)
    await clicHasta(page, 'Rentar', '¿Qué tipo de propiedad quieres rentar?')
    marca('tipo'); await sleep(1200)
    await clicHasta(page, 'Departamento', 'Lo mínimo que necesitas')
    const nums = await page.$$('input[inputmode="numeric"]')
    await escribir(page, nums[0], '2'); await escribir(page, nums[3], '100')
    await clic(page, 'Continuar'); await esperar(page, 'Hasta tres zonas'); await sinEjemplos(page)
    await escribir(page, await campo(page, 'zona-0-municipio'), 'San Pedro Garza García', 40)
    await escribir(page, await campo(page, 'zona-0-colonia'), 'Valle Oriente', 40); await clic(page, 'Agregar', null, true)
    await clic(page, 'Continuar'); await esperar(page, 'Plazo del contrato')
    marca('renta'); await sleep(900)
    await escribir(page, await campo(page, 'presupuesto-min'), '45000', 45)
    await escribir(page, await campo(page, 'presupuesto-max'), String(renta + 5000), 45)
    await sleep(300); await clic(page, '1 año'); await sleep(350); await clic(page, 'Póliza jurídica'); await sleep(350)
    await clic(page, 'Ya', null, true); await sleep(350); await clic(page, 'Amueblada', null, true); await sleep(350)
    const si = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-renta="mascotas"] button')].find((x) => x.innerText.trim() === 'Sí'); const r = b.getBoundingClientRect(); b.click(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight } })
    marcaActual?.(si.x, si.y)
    marca('lista'); await sleep(3500)
  })

  // La cuenta de Lucía con la misma ficha, y su análisis del departamento.
  const rl = await fetch(BASE + '/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quiere: 'comprar', nombre: 'Lucía Garza', email: CUENTAS.lucia, password: PASS, telefono: '81 5555 1234',
      necesidad: {
        operacion: 'renta', tipo: 'departamento', caracteristicas: { recamaras: 2, m2_min: 100 },
        zonas: [{ estado: 'Nuevo León', municipio: 'San Pedro Garza García', nombre: '', colonias: ['Valle Oriente'] }],
        presupuesto_min: 45000, presupuesto_max: renta + 5000,
        renta: { plazo_contrato: '1_anio', garantia: 'poliza', fecha_entrada: 'ya', amueblada: 'si', mascotas: true },
      },
    }),
  })
  if (!rl.ok) throw new Error('registro de Lucía: ' + rl.status + ' ' + (await rl.text()))
  const { data: lu } = await admin.from('usuarios').select('id').eq('nombre', 'Lucía Garza').eq('es_demo', true).order('created_at', { ascending: false }).limit(1).single()
  const { data: necL } = await admin.from('necesidades').select('id').eq('usuario_id', lu.id).single()
  console.log('Analizando el departamento de Lucía (renta)…')
  await api('lucia', '/api/analisis', { activoId: depaRenta, necesidadId: necL.id })

  // r10 · su análisis en renta
  await toma('r10-lucia-analisis', 'lucia', `/analisis#${depaRenta}`, async (page, marca) => {
    await esperar(page, 'Renta contra mercado'); await sleep(800)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600)
    marca('analisis'); await sleep(2500)
    await irA(page, 'Renta contra mercado', 160, 1300)
    marca('renta'); await sleep(4000)
    await irA(page, 'Para entrar', 300, 1300)
    marca('costos'); await sleep(4500)
  })

  // Las marcas de Lucía reemplazan las suyas en marcas.json (las de Patricia se conservan).
  const previas = JSON.parse(readFileSync(join(OUT, 'marcas.json'), 'utf8')).filter((m) => !m.toma.startsWith('r9-') && !m.toma.startsWith('r10-'))
  writeFileSync(join(OUT, 'marcas.json'), JSON.stringify([...previas, ...marcas], null, 2))
  console.log(`
Tomas de Lucía y marcas en ${OUT}`)
} catch (e) {
  console.error('ERROR', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  await restaurar()
}
