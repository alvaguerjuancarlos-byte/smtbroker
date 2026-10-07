// Recorrido visual de la Fase A del V6.1 con las personas demo (scripts/seed-demo.mjs): Diego
// (broker), Ricardo (propietario) y Patricia (compradora). Toma capturas para revisión; no deja
// datos nuevos (abre el formulario de cliente y lo cancela).
//   DEMO_PASSWORD=... BASE_URL=http://localhost:3001 node scripts/recorrido-v6.mjs <carpeta-salida>
import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OUT = process.argv[2] ?? 'recorrido-v6'
if (!process.env.DEMO_PASSWORD) throw new Error('Falta DEMO_PASSWORD')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 800 } })
const errores = []

async function sesion(email) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(`${email}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`${email}: ${m.text()}`) })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', process.env.DEMO_PASSWORD)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await sleep(2500)
  return { page, ctx }
}
const texto = (page) => page.evaluate(() => document.body.innerText)
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
const clic = async (page, t) => { const el = await page.waitForSelector(`::-p-text(${t})`); await el.click(); await sleep(1200) }

// ── Diego (broker) ──
{
  const { page, ctx } = await sesion('diego.salinas@demo.smtbroker.mx')
  console.log('Diego aterriza en:', new URL(page.url()).pathname)
  await shot(page, '01-diego-portafolio')
  const t = await texto(page)
  console.log('Diego ve su portafolio:', ['Casa Fuentes del Valle', 'Departamento Arboleda 1204', 'Terreno Chipinque Residencial'].every((n) => t.includes(n)))
  console.log('Diego ve propietario declarado:', t.includes('Familia Treviño Garza'))
  await clic(page, 'Mis clientes')
  await shot(page, '02-diego-clientes')
  const tc = await texto(page)
  console.log('Diego ve sus clientes:', ['Familia G.', 'Dr. R.', 'Cliente 07'].every((n) => tc.includes(n)))
  await clic(page, '+ Registrar cliente')
  await shot(page, '03-diego-nuevo-cliente')
  await clic(page, 'Cancelar')
  await clic(page, 'Mi desempeño')
  await shot(page, '04-diego-desempeno')
  console.log('Diego ve su nivel:', /Nivel (Aliado|Plata|Oro|Platino)/i.test(await texto(page)))
  await clic(page, 'Matches')
  await page.waitForFunction(() => !/Buscando coincidencias/i.test(document.body.innerText), { timeout: 30000 })
  await sleep(800)
  await shot(page, '04b-diego-matches')
  const tm = await texto(page)
  console.log('Matches: Familia G. con Casa Fuentes del Valle:', /Familia G\. → Casa Fuentes del Valle/.test(tm))
  console.log('Matches: muestra propiedades de otros brokers sin identificarlos:', /Representada por otro broker de la red/i.test(tm))
  console.log('Matches: no revela alias de clientes ajenos:', !/Cliente RLS|SECRETO/.test(tm))
  await clic(page, 'Mi portafolio')
  await clic(page, 'Casa Fuentes del Valle')
  await page.waitForFunction(() => location.pathname.startsWith('/activo/'), { timeout: 20000 })
  console.log('Diego abre una propiedad que representa:', new URL(page.url()).pathname)
  await page.waitForFunction(
    () => /Agente Due Diligence/i.test(document.body.innerText) && !/Analizando|Buscando|Cargando/i.test(document.body.innerText),
    { timeout: 180000, polling: 1000 })
  const td = await texto(page)
  console.log('Agentes corrieron con acceso de broker:', !/No se pudo generar|Activo no encontrado/.test(td))
  await shot(page, '05-diego-diagnostico')
  await page.goto(`${BASE}/activo/nuevo`, { waitUntil: 'networkidle2' })
  await sleep(1500)
  await shot(page, '06-diego-cargar-propiedad')
  console.log('Formulario pide representación:', /Representación del propietario/i.test(await texto(page)))
  await ctx.close()
}

// ── Ricardo (propietario) ──
{
  const { page, ctx } = await sesion('ricardo.villarreal@demo.smtbroker.mx')
  const t = await texto(page)
  await shot(page, '07-ricardo-dashboard')
  console.log('Ricardo aterriza en:', new URL(page.url()).pathname)
  console.log('Ricardo NO ve botón Panel maestro:', !/Panel maestro/i.test(t))
  console.log('Ricardo NO ve el portafolio de Diego:', !t.includes('Casa Fuentes del Valle'))
  await ctx.close()
}

// ── Patricia (compradora) ──
{
  const { page, ctx } = await sesion('patricia.longoria@demo.smtbroker.mx')
  await page.waitForFunction(() => /Coinciden con lo que buscas|Propiedades disponibles/i.test(document.body.innerText), { timeout: 30000 })
  await sleep(1500)
  const t = await texto(page)
  await shot(page, '08-patricia-portal')
  console.log('Patricia ve Coinciden con lo que buscas:', /Coinciden con lo que buscas/i.test(await texto(page)))
  console.log('Patricia ve el lenguaje nuevo:', /Lo que buscas/i.test(t) && !/tesis de inversión|perfil de inversión/i.test(t))
  console.log('Patricia ve su perfil guardado:', /\$3M|San Pedro/.test(t))
  console.log('Patricia ve el listado de propiedades:', t.includes('Casa Fuentes del Valle') || t.includes('Casa Cumbres Elite'))
  await ctx.close()
}

await browser.close()
console.log(errores.length ? `\nErrores de consola:\n- ${errores.join('\n- ')}` : '\nSin errores de consola')
