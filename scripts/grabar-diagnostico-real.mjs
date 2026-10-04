// Graba el segmento "Fase 1, Diagnóstico" del video demo con los agentes Legal y Mercado
// REALES (2026-10-03), para reemplazar el tramo simulado del demo del 27-sep.
// Entra como Ricardo (persona demo de scripts/seed-demo.mjs), abre un activo suyo en San Pedro
// y graba mientras los agentes corren en vivo contra producción. Requiere un ffmpeg completo:
//   DEMO_PASSWORD=... FFMPEG=<ruta a ffmpeg.exe> node scripts/grabar-diagnostico-real.mjs [salida.webm] [nombreActivo]
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const SALIDA = process.argv[2] ?? 'diagnostico-real.webm'
const ACTIVO = process.argv[3] ?? 'Terreno Valle Poniente'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 720 } })
const page = await browser.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', 'ricardo.villarreal@demo.smtbroker.mx')
if (!process.env.DEMO_PASSWORD) throw new Error('Falta DEMO_PASSWORD (contraseña de las personas demo)')
await page.type('input[type="password"]', process.env.DEMO_PASSWORD)
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
await page.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 20000 }, ACTIVO)

const recorder = await page.screencast({ path: SALIDA, ffmpegPath: process.env.FFMPEG })
const t0 = Date.now()
const marca = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

await sleep(1500)
const link = await page.waitForSelector(`::-p-text(${ACTIVO})`)
await link.click()
marca('clic en activo')
await page.waitForFunction(() => location.pathname.startsWith('/activo/'), { timeout: 20000 })

// Espera a que ambos agentes terminen (o fallen) -- desaparecen los textos de carga.
try {
  await page.waitForFunction(
    () => /Agente Due Diligence/i.test(document.body.innerText) && !/Analizando|Buscando|Cargando/i.test(document.body.innerText),
    { timeout: 180000, polling: 1000 },
  )
} catch (e) {
  await page.screenshot({ path: SALIDA.replace(/\.\w+$/, '-timeout.png'), fullPage: true })
  console.log(page.url(), '\n', (await page.evaluate(() => document.body.innerText)).slice(0, 1500))
  await recorder.stop()
  await browser.close()
  throw e
}
marca('agentes terminaron')

// Recorrido lento hacia abajo por el resultado.
const alto = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < alto; y += 6) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await sleep(25)
}
marca('scroll terminado')
await sleep(2000)

await recorder.stop()
await page.screenshot({ path: SALIDA.replace(/\.\w+$/, '-final.png'), fullPage: true })
await browser.close()
