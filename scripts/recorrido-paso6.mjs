// Recorrido visual del paso 6 con Puppeteer: el dueño ve su ficha de venta en Marketing y publica
// la página; una persona sin cuenta abre /p/[id] y llena «Me interesa»; el dueño ve el lead
// calificado en Leads. Para no llamar a Claude, siembra un diagnóstico de mercado y una ficha de
// prueba (se borran con el activo). Capturas en scripts/capturas-paso6/. Los textos se comparan en
// minúsculas (innerText aplica text-transform). El mapa de Google falla en localhost (se ignora).
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/recorrido-paso6.mjs

import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OUT = 'scripts/capturas-paso6'
mkdirSync(OUT, { recursive: true })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const email = `recorrido6-${sufijo}@prueba.smtbroker.mx`
const errores = []
let uid = null
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }
const esperar = (page, t, timeout = 30000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout }, t).then(() => true, () => false)
const clic = async (page, t) => (await page.waitForSelector(`::-p-text(${t})`)).click()

const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } })
try {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  uid = data.user.id
  await admin.from('usuarios').upsert({ id: uid, nombre: `Propietaria ${sufijo}`, rol: 'propietario' })
  const { data: act } = await admin.from('activos').insert({
    usuario_id: uid, nombre: `Casa Valle Oriente ${sufijo}`, tipo: 'Casa', colonia: 'Valle Oriente', municipio: 'San Pedro Garza García',
    estado: 'Nuevo León', status: 'ingresado', precio_total: 12_000_000, superficie: 350,
  }).select('id').single()
  const id = act.id
  await admin.from('diagnosticos').insert([
    { activo_id: id, agente: 'mercado', modelo: 'prueba', resultado: {
      precioSalidaRecomendadoMXN: 12_500_000, rangoMinMXN: 11_000_000, rangoMaxMXN: 14_000_000, comparablesAnalizados: 8,
      precioPromedioM2Zona: 36_000, plusvalia3AniosTexto: '9.6% anualizado (Índice SHF)', interpretacion: 'Prueba.' } },
    { activo_id: id, agente: 'ficha', modelo: 'prueba', resultado: {
      titular: 'Casa en Valle Oriente con 350 m² de terreno', narrativa: 'Párrafo uno de prueba.\nPárrafo dos de prueba.',
      puntosFuertes: ['350 m² de terreno', 'Valle Oriente, San Pedro'], precioSugeridoMXN: 12_500_000,
      argumentosComprador: ['Precio dentro del rango de 8 comparables reales'], mensajeWhatsApp: 'Casa en Valle Oriente, San Pedro.' } },
  ])

  const page = await browser.newPage()
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', PASS)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])

  await page.goto(`${BASE}/activo/${id}/marketing`, { waitUntil: 'domcontentloaded' })
  check('Marketing muestra la ficha de venta', await esperar(page, 'Casa en Valle Oriente con 350 m²'))
  check('ya no dice "Datos de ejemplo" salvo en Próximamente', (await page.evaluate(() => document.body.innerText)).toLowerCase().split('datos de ejemplo').length === 2)
  await clic(page, 'Publicar página')
  check('al publicar aparece el enlace y WhatsApp', await esperar(page, 'Compartir por WhatsApp'))
  await page.screenshot({ path: `${OUT}/1-marketing.png`, fullPage: true })

  const pub = await (await browser.createBrowserContext()).newPage()
  pub.on('pageerror', (e) => errores.push(e.message))
  await pub.goto(`${BASE}/p/${id}`, { waitUntil: 'networkidle2' })
  check('la página pública abre sin sesión', await esperar(pub, 'Casa en Valle Oriente con 350 m²'))
  await pub.screenshot({ path: `${OUT}/2-pagina-publica.png`, fullPage: true })
  await clic(pub, 'Me interesa esta propiedad')
  await pub.type('input[placeholder="Tu nombre"]', 'Laura Prueba')
  await pub.type('input[placeholder^="Correo o WhatsApp"]', '8112345678')
  const selects = await pub.$$('form select')
  await selects[0].select('$10M – $20M')
  await selects[1].select('menos_3m')
  await selects[2].select('credito_aprobado')
  await pub.click('form input[type="checkbox"]')
  await pub.screenshot({ path: `${OUT}/3-me-interesa.png`, fullPage: true })
  await clic(pub, 'Enviar')
  check('el interesado recibe confirmación', await esperar(pub, 'Recibimos tu interés'))

  await page.goto(`${BASE}/activo/${id}/leads`, { waitUntil: 'domcontentloaded' })
  check('el lead aparece en Leads', await esperar(page, 'Laura Prueba'))
  check('calificado como Serio, con razones', (await page.evaluate(() => document.body.innerText)).toLowerCase().includes('por qué: el precio'))
  await page.screenshot({ path: `${OUT}/4-leads.png`, fullPage: true })

  await page.goto(`${BASE}/activo/${id}/marketing`, { waitUntil: 'domcontentloaded' })
  await esperar(page, 'Visitas a la página')
  await new Promise((r) => setTimeout(r, 1500))
  const t = await page.evaluate(() => document.body.innerText)
  check('Marketing cuenta 1 visita y 1 «Me interesa»', /visitas a la página\s*1/i.test(t) && /me interesa» \(total\)\s*1/i.test(t))
} catch (e) {
  fallas++; console.error('ERROR', e.message)
} finally {
  await browser.close()
  if (uid) {
    await admin.from('activos').delete().eq('usuario_id', uid)
    await admin.from('usuarios').delete().eq('id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  const relevantes = errores.filter((e) => !/favicon|React DevTools|RefererNotAllowedMapError/i.test(e))
  check('sin errores de consola', relevantes.length === 0, relevantes.slice(0, 3).join(' | '))
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
  process.exit(fallas ? 1 : 0)
}
