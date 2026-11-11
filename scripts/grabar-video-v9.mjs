// Graba las tomas del video demo v9 (guion-demo-v9, aprobado por JC el 10-nov-2026; Documento Maestro
// V8): todo empieza con lo que busca Patricia. Contra producción, en el MUNDO DEMO (no manda correos
// ni toca datos reales). Tomas:
//   r1 Patricia captura su ficha en /empezar (celular) y crea su cuenta al final        (escenas 4-6)
//   r2 Diego ve la necesidad en su pestaña Necesidades y propone su bodega             (escenas 7-8)
//   r3 Patricia: su bandeja → "Me interesa" → su análisis → el comparativo             (escenas 9-13)
//   r4 Patricia: "Quiero verla" → conversación con Diego → propone horarios            (escenas 14-15)
//   r5 Diego confirma la visita y aparecen los teléfonos                                (escena 15)
//   r6 Patricia: "¿Cómo te fue?" → quiero ofertar → intención de oferta                (escena 16)
//   r7 Diego reporta el cierre                                                           (escena 17)
//   r8 Patricia confirma que compró y califica a Diego                                   (escena 17)
//
// Datos demo (se crean aquí y se BORRAN al terminar, aunque algo falle): una bodega en Apodaca en la
// cartera de Diego, dos bodegas de particulares (de Ricardo) para la bandeja y el comparativo, un
// WhatsApp de ejemplo para Diego y la cuenta de Patricia del recorrido. Antes de grabar, el Agente de
// Mercado calcula el precio real de cada bodega con comparables reales de Apodaca, y los precios se
// ajustan para que el análisis salga creíble: la de Diego en línea con el mercado, una particular
// arriba y otra en línea. El presupuesto de Patricia se fija alrededor de esos precios. Hace llamadas
// reales a la IA (3 diagnósticos de mercado y los análisis).
//
// Uso: FFMPEG=<ffmpeg.exe> node --env-file=.env.local scripts/grabar-video-v9.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v9'
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG) throw new Error('Faltan DEMO_PASSWORD (.env.local) y FFMPEG')
mkdirSync(OUT, { recursive: true })
const PASS = process.env.DEMO_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const INICIO = new Date().toISOString()
const SUFIJO = Math.random().toString(36).slice(2, 8)
const CEL = { width: 390, height: 844 }
const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx',
  patricia: `recorrido.patricia.v9.${SUFIJO}@demo.smtbroker.mx`,
}
const creados = { activos: [], solicitud: null }

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 500 })
const ids = { ricardo: lista.users.find((u) => u.email === CUENTAS.ricardo).id, diego: lista.users.find((u) => u.email === CUENTAS.diego).id }

async function restaurar() {
  if (creados.activos.length) await admin.from('activos').delete().in('id', creados.activos) // cascada: propuestas, análisis, conexiones, cierres, diagnósticos
  if (creados.solicitud) await admin.from('solicitudes').delete().eq('id', creados.solicitud)
  const { data: todas } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of todas.users.filter((x) => x.email === CUENTAS.patricia)) {
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

// ── Grabación (mismas piezas que el grabador del v8) ────────────────────────────────────────
const marcas = []
// En español: los campos de fecha (visita) se ven dd/mm/aaaa y no mm/dd/yyyy.
const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 720 }, args: ['--lang=es-MX'], env: { ...process.env, LANG: 'es_MX.UTF-8' } })

async function toma(nombre, cuenta, inicio, fn, viewport) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-MX,es;q=0.9' })
  if (viewport) await page.setViewport(viewport)
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
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
    await page.type('input[type="email"]', CUENTAS[cuenta])
    await page.type('input[type="password"]', PASS)
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  }
  await page.goto(`${BASE}${inicio}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await sleep(2500)
  const rec = await page.screencast({ path: join(OUT, `${nombre}.webm`), ffmpegPath: process.env.FFMPEG })
  const t0 = Date.now()
  const marca = (escena) => { marcas.push({ toma: nombre, escena, t: (Date.now() - t0) / 1000 }); console.log(`  [${nombre}] ${escena} @ ${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  await sleep(300)
  try { await fn(page, marca) } catch (e) { await page.screenshot({ path: join(OUT, `${nombre}-error.png`), fullPage: true }).catch(() => {}); throw e }
  await sleep(1500)
  marca('fin')
  await rec.stop()
  await ctx.close()
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
async function clic(page, texto, dentroDe) {
  const ok = await page.evaluate((t, d) => {
    const esBoton = (x) => x.innerText.trim() === t || x.innerText.trim().startsWith(t)
    const raiz = d ? [...document.querySelectorAll('div')]
      .filter((x) => x.innerText.includes(d) && [...x.querySelectorAll('button, a')].some(esBoton))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0] : document
    const b = [...(raiz ?? document).querySelectorAll('button, a')].find(esBoton)
    if (b) { b.click(); return true }
    return false
  }, texto, dentroDe)
  if (!ok) throw new Error(`no encontré «${texto}»${dentroDe ? ` en «${dentroDe}»` : ''}`)
}
// Clic que se reintenta si la pantalla no avanza (la primera vez la página puede no estar lista).
async function clicHasta(page, texto, debeAparecer, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    await clic(page, texto)
    try { await esperar(page, debeAparecer, 8000); return } catch { console.log(`  (reintento «${texto}»)`) }
  }
  throw new Error(`«${texto}» no llevó a «${debeAparecer}»`)
}
const esperar = (page, t, timeout = 90000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout, polling: 400 }, t)
const escribir = async (page, el, t, delay = 45) => { await el.click(); await page.keyboard.type(t, { delay }) }
// Inputs controlados por React (datetime-local): se fija el valor con el setter nativo y se avisa.
const ponerValor = (page, selector, i, valor) => page.evaluate((sel, i, v) => {
  const el = document.querySelectorAll(sel)[i]
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, selector, i, valor)

process.on('unhandledRejection', (e) => console.error('  (aviso)', e?.message ?? e))

try {
  // ── 1. Datos demo y precios de mercado reales ──────────────────────────────────────────────
  const { data: sol, error: eSol } = await admin.from('solicitudes')
    .insert({ nombre: 'Diego Salinas', email: CUENTAS.diego, telefono: '81 2345 6789', rol: 'broker', status: 'aprobada' }).select('id').single()
  if (eSol) console.log('  (sin WhatsApp de ejemplo para Diego:', eSol.message, ')')
  else creados.solicitud = sol.id

  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({ estado: 'Nuevo León', status: 'ingresado', precio_total: 8_000_000, ...campos }).select('id').single()
    if (error) throw error
    creados.activos.push(data.id)
    return data.id
  }
  const bodegaDiego = await nueva({
    usuario_id: ids.diego, broker_id: ids.diego, cargado_por: 'broker', representacion_tipo: 'exclusiva',
    representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Inmobiliaria del Norte',
    nombre: 'Bodega en Parque Industrial Apodaca', tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Parque Industrial', superficie: 1200,
  })
  const parti1 = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Bodega Apodaca Sur', tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Apodaca Centro', superficie: 1100 })
  const parti2 = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre: 'Nave en Huinalá', tipo: 'Bodega', municipio: 'Apodaca', colonia: 'Huinalá', superficie: 1300 })
  console.log('Calculando el precio de mercado de las tres bodegas (Agente de Mercado, comparables reales)…')
  // En Apodaca casi todas las bodegas en venta miden 1,000-1,800 m² y cuestan $21M-$45M (comparables
  // reales, 10-nov): con 450 m² no había comparables de tamaño parecido. La búsqueda varía entre
  // corridas, así que si no sale precio se vuelve a correr (hasta 2 veces más).
  const mercado = async (cuenta, activoId) => {
    let m = await api(cuenta, '/api/agentes/mercado', { activoId })
    for (let i = 0; i < 2 && m.precioSalidaRecomendadoMXN == null; i++) m = await api(cuenta, '/api/agentes/mercado', { activoId, regenerar: true })
    return m
  }
  const [mD, m1, m2] = await Promise.all([mercado('diego', bodegaDiego), mercado('ricardo', parti1), mercado('ricardo', parti2)])
  const salida = (m, sup) => m.precioSalidaRecomendadoMXN ?? 21_000 * sup
  const S = salida(mD, 1200)
  const precios = { diego: redondear(S), parti1: redondear(salida(m1, 1100) * 1.15), parti2: redondear(salida(m2, 1300) * 0.97) }
  console.log(`  mercado: Diego ${mD.precioSalidaRecomendadoMXN} (${mD.comparablesAnalizados} comps) · Sur ${m1.precioSalidaRecomendadoMXN} · Huinalá ${m2.precioSalidaRecomendadoMXN} → precios ${JSON.stringify(precios)}`)
  await admin.from('activos').update({ precio_total: precios.diego }).eq('id', bodegaDiego)
  await admin.from('activos').update({ precio_total: precios.parti1 }).eq('id', parti1)
  await admin.from('activos').update({ precio_total: precios.parti2 }).eq('id', parti2)
  // El presupuesto de Patricia rodea los tres precios (las particulares entran con el ±10 % de la ficha).
  const presupuesto = { min: redondear(Math.min(...Object.values(precios)) * 0.92), max: redondear(Math.max(precios.diego, precios.parti2) * 1.08) }
  console.log(`  presupuesto de Patricia: ${presupuesto.min} a ${presupuesto.max}`)
  writeFileSync(join(OUT, 'datos.json'), JSON.stringify({ precios, presupuesto, mercado: { diego: mD, sur: m1, huinala: m2 } }, null, 2))

  // ── 2. Tomas ───────────────────────────────────────────────────────────────────────────────
  // r1 · Patricia captura su ficha y crea su cuenta (celular)
  await toma('r1-patricia-ficha', null, '/empezar', async (page, marca) => {
    marca('que'); await sleep(2200)
    await clicHasta(page, 'Quiero comprar', '¿Qué tipo de propiedad buscas?')
    marca('tipo'); await sleep(1800)
    await clicHasta(page, 'Bodega', 'Lo mínimo que necesitas')
    marca('caract'); await sleep(900)
    const nums = await page.$$('main input, input[inputmode="numeric"]')
    await escribir(page, nums[0], '1000'); await escribir(page, nums[1], '8'); await escribir(page, nums[2], '2')
    await sleep(300); await clic(page, 'Piso industrial'); await sleep(1200)
    await clic(page, 'Continuar'); await esperar(page, 'Puedes elegir varias colonias')
    marca('ubicacion'); await sleep(700)
    await escribir(page, await page.$('input[list="municipios-nl"]'), 'Apodaca', 70); await sleep(1200)
    await clic(page, 'Continuar'); await esperar(page, '¿Cómo pagarías?')
    marca('presupuesto'); await sleep(700)
    const p = await page.$$('input[inputmode="numeric"]')
    await escribir(page, p[0], String(presupuesto.min), 35); await escribir(page, p[1], String(presupuesto.max), 35)
    await sleep(300); await clic(page, 'Contado'); await sleep(350); await clic(page, 'Ya'); await sleep(350); await clic(page, 'Para invertir'); await sleep(1200)
    await clic(page, 'Buscar'); await esperar(page, 'cómo quieres buscar', 60000)
    marca('resultados'); await sleep(4000)
    await irA(page, '¿Cómo quieres buscar?', 90, 1400)
    marca('caminos'); await sleep(4500)
    await irA(page, 'Para guardar tu búsqueda', 90, 1200)
    const cta = await page.$$('form input:not(.hidden)')
    await escribir(page, cta[0], 'Patricia Longoria', 30); await escribir(page, cta[1], '81 8765 4321', 30)
    await escribir(page, cta[2], CUENTAS.patricia, 12); await escribir(page, cta[3], PASS, 12)
    await sleep(500)
    await clic(page, 'Crear mi cuenta'); await esperar(page, 'Tus búsquedas', 60000)
    marca('panel'); await sleep(4000)
  }, CEL)

  const { data: pu } = await admin.from('usuarios').select('id').eq('nombre', 'Patricia Longoria').eq('es_demo', true).order('created_at', { ascending: false }).limit(1).single()
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', pu.id).single()

  // r2 · Diego ve la necesidad y propone su bodega
  await toma('r2-diego-necesidades', 'diego', '/portal-broker?pestana=necesidades', async (page, marca) => {
    await esperar(page, 'Busca bodega'); await sleep(500)
    marca('panel'); await sleep(4000)
    await clic(page, 'Proponer propiedad', 'Busca bodega'); await esperar(page, 'De tu cartera, cumplen la ficha')
    marca('proponer'); await sleep(2500)
    await page.evaluate(() => document.querySelector('input[type="radio"]').click()); await sleep(1500)
    await page.evaluate(() => document.querySelector('input[type="checkbox"]').click())
    marca('terminos'); await sleep(2500)
    await clic(page, 'Enviar propuesta'); await esperar(page, 'Propuesta enviada')
    marca('enviada'); await sleep(3500)
  })
  for (let i = 0; i < 45; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('necesidad_id', nec.id).maybeSingle(); if (data?.precio_mercado) break; await sleep(2000) }

  // Las dos particulares ya analizadas, para que el comparativo tenga tres bodegas.
  console.log('Analizando las dos particulares (comparativo)…')
  await api('patricia', '/api/analisis', { activoId: parti1, necesidadId: nec.id })
  await api('patricia', '/api/analisis', { activoId: parti2, necesidadId: nec.id })

  // r3 · Patricia: bandeja → Me interesa → análisis → comparativo (celular)
  await toma('r3-patricia-analisis', 'patricia', '/inicio', async (page, marca) => {
    await esperar(page, 'Tu bandeja'); await sleep(500)
    await irA(page, 'Tu bandeja', 90, 1600)
    marca('bandeja'); await sleep(4500)
    await irA(page, 'Bodega en Parque Industrial Apodaca', 160, 1000)
    marca('meinteresa'); await sleep(1500)
    await clic(page, 'Me interesa', 'Bodega en Parque Industrial Apodaca'); await sleep(1500)
    marca('analizando')
    await page.waitForFunction(() => location.pathname === '/analisis', { timeout: 180000 })
    await esperar(page, 'precio contra mercado', 60000); await sleep(1800)
    // El semáforo (no "Precio contra mercado": ese texto también está en el subtítulo de la página).
    await irA(page, 'En línea con el mercado', 230, 900)
    marca('precio'); await sleep(4500)
    await irA(page, 'Plusvalía · proyección', 120, 1300)
    marca('plusvalia'); await sleep(4000)
    await irA(page, '¿Cumple lo que buscas?', 120, 1300)
    marca('cumple'); await sleep(4500)
    await irA(page, 'Si la rentas', 160, 1300)
    marca('renta'); await sleep(4500)
    await irA(page, 'Comparativo', 110, 1800)
    marca('comparativo'); await sleep(5500)
  }, CEL)

  // r4 · Patricia: Quiero verla → conversación → propone horarios (celular)
  const { data: an } = await admin.from('analisis').select('id').eq('usuario_id', pu.id).eq('activo_id', bodegaDiego).limit(1).single()
  void an
  await toma('r4-patricia-conexion', 'patricia', `/analisis#${bodegaDiego}`, async (page, marca) => {
    await esperar(page, 'Quiero verla'); await sleep(1200)
    await irA(page, 'Te conectamos con quien la ofrece', 330, 1200)
    marca('quiero'); await sleep(2000)
    await clic(page, 'Quiero verla', 'Bodega en Parque Industrial Apodaca')
    await esperar(page, 'Todavía no hay mensajes', 60000)
    marca('conversacion'); await sleep(1500)
    await irA(page, 'Conversación', 100, 1000)
    await escribir(page, await page.$('input[placeholder="Escribe un mensaje"]'), 'Hola Diego, me interesa la bodega. ¿Tiene andenes de carga?', 35)
    // Botón exacto: "Enviar intención de oferta" también empieza con "Enviar".
    await page.evaluate(() => [...document.querySelectorAll('form button')].find((b) => b.innerText.trim() === 'Enviar').click())
    await esperar(page, '¿Tiene andenes de carga?')
    marca('mensaje'); await sleep(1500)
    const { data: cx } = await admin.from('conexiones').select('id').eq('comprador_id', pu.id).eq('activo_id', bodegaDiego).single()
    await api('diego', `/api/conexiones/${cx.id}`, { accion: 'mensaje', texto: 'Hola Patricia. Sí, tiene dos andenes y piso industrial. ¿Cuándo le gustaría verla?' })
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperar(page, 'tiene dos andenes')
    await irA(page, 'Conversación', 100, 600)
    marca('respuesta'); await sleep(4000)
    await irA(page, 'Visita', 100, 1200)
    const dia = new Date(Date.now() + 2 * 86400_000), d2 = new Date(Date.now() + 3 * 86400_000)
    const local = (d, h) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${h}`
    await ponerValor(page, 'input[type="datetime-local"]', 0, local(dia, '10:00')); await sleep(900)
    await ponerValor(page, 'input[type="datetime-local"]', 1, local(d2, '16:30')); await sleep(900)
    marca('horarios'); await sleep(1200)
    await clic(page, 'Proponer horarios'); await esperar(page, 'Esperando que confirme')
    marca('propuestos'); await sleep(3500)
  }, CEL)
  const { data: cx } = await admin.from('conexiones').select('id').eq('comprador_id', pu.id).eq('activo_id', bodegaDiego).single()

  // r5 · Diego confirma la visita: aparecen los teléfonos
  await toma('r5-diego-visita', 'diego', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, 'Elige uno'); await sleep(500)
    marca('confirmar'); await sleep(3500)
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Confirmar')).click())
    await esperar(page, 'Visita confirmada') // "Teléfonos" también aparece en el pie ("los teléfonos se comparten…")
    await page.evaluate(() => window.scrollTo(0, 0))
    marca('telefonos'); await sleep(4500)
  })
  // Tiempo comprimido: la visita ya pasó.
  await admin.from('conexiones').update({ visita_at: new Date(Date.now() - 20 * 3600_000).toISOString() }).eq('id', cx.id)

  // r6 · Patricia: ¿cómo te fue? → quiero ofertar → intención de oferta (celular)
  await toma('r6-patricia-oferta', 'patricia', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, '¿Cómo te fue?'); await sleep(500)
    await irA(page, '¿Cómo te fue?', 160, 1200)
    marca('comotefue'); await sleep(3000)
    await clic(page, 'Quiero ofertar'); await esperar(page, 'quiere ofertar')
    marca('ofertar'); await sleep(1200)
    await irA(page, 'Intención de oferta', 100, 1200)
    await escribir(page, await page.$('input[placeholder="Monto (MXN)"]'), String(redondear(precios.diego * 0.95)), 60); await sleep(1200)
    marca('monto'); await sleep(1200)
    await clic(page, 'Enviar intención de oferta'); await esperar(page, 'enviada el')
    marca('oferta'); await sleep(4000)
  }, CEL)

  // r7 · Diego reporta el cierre
  await toma('r7-diego-cierre', 'diego', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, 'Reportar cierre'); await sleep(500)
    await irA(page, 'Intención de oferta', 100, 1200)
    marca('oferta'); await sleep(3000)
    await irA(page, 'Cuando se firme', 140, 1200)
    await escribir(page, await page.$('input[placeholder="Precio de cierre (MXN)"]'), String(redondear(precios.diego * 0.96)), 60); await sleep(1000)
    marca('cierre'); await sleep(1200)
    await clic(page, 'Reportar cierre'); await esperar(page, 'Falta la confirmación del comprador')
    marca('reportado'); await sleep(3500)
  })

  // r8 · Patricia confirma que compró y califica a Diego (celular)
  await toma('r8-patricia-cierre', 'patricia', `/conexion/${cx.id}`, async (page, marca) => {
    await esperar(page, 'Confirmo que compré'); await sleep(500)
    await irA(page, 'Cierre reportado', 160, 1200)
    marca('confirmar'); await sleep(3000)
    await clic(page, 'Confirmo que compré'); await esperar(page, 'Califica al broker')
    marca('calificar'); await sleep(1500)
    for (let k = 0; k < 3; k++) {
      await page.evaluate((k) => [...document.querySelectorAll('button[aria-label="5 de 5"]')][k].click(), k); await sleep(600)
    }
    await escribir(page, await page.$('input[placeholder="Comentario (opcional)"]'), 'Muy claro y rápido. Recomendado.', 40); await sleep(800)
    await clic(page, 'Enviar calificación'); await esperar(page, 'Calificación: atención 5/5')
    marca('calificado'); await sleep(4000)
  }, CEL)

  writeFileSync(join(OUT, 'marcas.json'), JSON.stringify(marcas, null, 2))
  console.log(`\nTomas y marcas en ${OUT}`)
} catch (e) {
  console.error('ERROR', e.message)
  writeFileSync(join(OUT, 'marcas.json'), JSON.stringify(marcas, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
  await restaurar()
}
