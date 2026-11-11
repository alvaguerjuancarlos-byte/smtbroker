// Capturas de pantallas clave a 1440x900 para revisar el look (no toca datos).
// Uso: BASE=http://localhost:3011 node --env-file=.env.local scripts/capturas-look.mjs <carpeta-salida>
import puppeteer from 'puppeteer'
import { join } from 'node:path'
const BASE = process.env.BASE ?? 'http://localhost:3011'
const OUT = process.argv[2]
const PASS = process.env.DEMO_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TOMAS = [
  [null, '/login', '01-login'],
  [null, '/empezar', '02-empezar'],
  ['diego.salinas@demo.smtbroker.mx', '/portal-broker?pestana=necesidades', '03-diego-necesidades'],
  ['diego.salinas@demo.smtbroker.mx', '/portal-broker', '04-diego-portafolio'],
  ['patricia.longoria@demo.smtbroker.mx', '/inicio', '05-patricia-inicio'],
  ['patricia.longoria@demo.smtbroker.mx', '/analisis', '06-patricia-analisis'],
  ['ricardo.villarreal@demo.smtbroker.mx', '/inicio', '07-ricardo-inicio'],
  ['ricardo.villarreal@demo.smtbroker.mx', '/dashboard', '08-ricardo-dashboard'],
  [null, '/bienvenida', '09-bienvenida'],
  ['patricia.longoria@demo.smtbroker.mx', '/portal-inversion', '10-patricia-portal'],
  ['operacion@demo.smtbroker.mx', '/panel', '11-panel'],
  ['ricardo.villarreal@demo.smtbroker.mx', '/dashboard#Terreno Valle Poniente', '12-ricardo-activo'],
  ['ricardo.villarreal@demo.smtbroker.mx', '/dashboard#Terreno Valle Poniente>marketing', '13-ricardo-marketing'],
]
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null
const browser = await puppeteer.launch({ args: ['--lang=es-MX'] })
for (const [cuenta, rutaCompleta, nombre] of TOMAS) {
  if (SOLO && !SOLO.some((x) => nombre.startsWith(x))) continue
  const [ruta, clic] = rutaCompleta.split('#')
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  try {
    if (cuenta) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
      await page.type('input[type="email"]', cuenta)
      await page.type('input[type="password"]', PASS)
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
    }
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await sleep(3000)
    if (clic) {
      // "Nombre de la propiedad" abre su ficha; ">sub" agrega un subtramo de ruta (p. ej. marketing)
      const [texto, sub] = clic.split('>')
      const href = await page.evaluate((t) => [...document.querySelectorAll('a,button,div')].find((e) => e.textContent?.trim().startsWith(t) && e.closest('a'))?.closest('a')?.getAttribute('href'), texto)
      if (href) await page.goto(`${BASE}${href}${sub ? '/' + sub : ''}`, { waitUntil: 'networkidle2', timeout: 90000 })
      else { await page.evaluate((t) => [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent?.trim() === t)?.click(), texto); await sleep(2000)
        if (sub) await page.goto(`${page.url()}/${sub}`, { waitUntil: 'networkidle2', timeout: 90000 }) }
      await sleep(4000)
    }
    await page.screenshot({ path: join(OUT, `${nombre}.png`) })
    console.log('ok', nombre, page.url())
  } catch (e) { console.log('error', nombre, e.message) }
  await ctx.close()
}
await browser.close()
