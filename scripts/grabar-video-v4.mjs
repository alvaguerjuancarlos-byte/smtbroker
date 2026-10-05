// Graba las tomas del video demo v4 (guion: Documents/SMTBROKER/demo-v2/guion-demo-v4.docx) contra
// producción, con las personas demo de scripts/seed-demo.mjs. Cada persona se graba en su propia
// toma (.webm) y se registran marcas de tiempo por escena en marcas.json, que usa el montaje.
//
// Crea datos durante la grabación (diagnóstico actualizado, solicitud de conexión, cierre
// reportado y verificado): correr ANTES `scripts/limpiar-grabacion.mjs foto` y DESPUÉS
// `scripts/limpiar-grabacion.mjs restaurar`.
//
//   DEMO_PASSWORD=... FFMPEG=<ffmpeg.exe> node scripts/grabar-video-v4.mjs <carpeta-salida>
import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v4'
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG) throw new Error('Faltan DEMO_PASSWORD y FFMPEG')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ID = {
  cumbres: '34fbb04f-08f7-4105-96e1-7c0da2b1a6d5',
}
const marcas = []
const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 720 } })

async function toma(nombre, email, inicio, fn) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  if (email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
    await page.type('input[type="email"]', email)
    await page.type('input[type="password"]', process.env.DEMO_PASSWORD)
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  }
  await page.goto(`${BASE}${inicio}`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  const rec = await page.screencast({ path: `${OUT}/${nombre}.webm`, ffmpegPath: process.env.FFMPEG })
  const t0 = Date.now()
  const marca = (escena) => { marcas.push({ toma: nombre, escena, t: (Date.now() - t0) / 1000 }); console.log(`  [${nombre}] ${escena} @ ${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  await sleep(300)
  await fn(page, marca)
  await sleep(1500)
  marca('fin')
  await rec.stop()
  await ctx.close()
}

// Desplaza suavemente hasta que el elemento con ese texto quede a ~140 px del borde superior.
async function irA(page, texto, offset = 140, ms = 1400) {
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

// Resalta (solo en pantalla) la fila que contiene todos esos textos y devuelve su botón, si lo hay.
async function resaltarFila(page, textos) {
  return page.evaluateHandle((textos) => {
    // La fila completa (con su botón), no el bloque de texto interior que también contiene los textos.
    const filas = [...document.querySelectorAll('div')]
      .filter((d) => d.querySelector('button') && textos.every((t) => d.innerText?.includes(t)))
    const fila = filas.sort((a, b) => a.innerText.length - b.innerText.length)[0]
    if (!fila) return null
    fila.style.outline = '2px solid #c9a227'
    fila.style.outlineOffset = '-2px'
    return fila.querySelector('button')
  }, textos)
}

const clicTexto = async (page, t) => { const el = await page.waitForSelector(`::-p-text(${t})`); await el.click() }
const esperar = (page, re, timeout = 180000) => page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), { timeout, polling: 400 }, re)
const esperarQueNo = (page, re, timeout = 180000) => page.waitForFunction((src) => !new RegExp(src, 'i').test(document.body.innerText), { timeout, polling: 400 }, re)

// ── R1 Apertura ──────────────────────────────────────────────────────────────────────────
await toma('r1-apertura', null, '/bienvenida', async (page, marca) => {
  marca('01'); await sleep(3000)
  marca('02'); await sleep(4000)
  marca('03'); await irA(page, '¿Cómo quieres participar?', 60, 2000); await sleep(4000)
})

// ── R2 Ricardo: diagnóstico en vivo + Marketing y Leads (visión) ────────────────────────
await toma('r2-ricardo', 'ricardo.villarreal@demo.smtbroker.mx', '/dashboard', async (page, marca) => {
  marca('04'); await sleep(2500)
  await clicTexto(page, 'Terreno Valle Poniente')
  await esperar(page, 'Actualizar diagnóstico')
  await sleep(1500)
  marca('05')
  await clicTexto(page, 'Actualizar diagnóstico')
  await sleep(500)
  await esperarQueNo(page, 'Actualizando diagnóstico|Analizando|Buscando comparables')
  marca('05-fin')
  await sleep(1500)
  marca('06'); await irA(page, 'Estrategia recomendada', 160, 1500); await sleep(5000)
  marca('07'); await irA(page, 'Diagnóstico Legal · Agente Due Diligence', 90, 1600); await sleep(5000)
  await page.goto(`${BASE}/activo/${ID.cumbres}/marketing`, { waitUntil: 'domcontentloaded' }); await esperar(page, 'Vistas por día', 30000)
  await sleep(1500)
  marca('08'); await sleep(5000)
  marca('09'); await irA(page, 'Vistas por día', 120, 1600); await sleep(4000)
  await page.goto(`${BASE}/activo/${ID.cumbres}/leads`, { waitUntil: 'domcontentloaded' }); await sleep(2500)
  await sleep(1500)
  marca('10'); await sleep(4000)
  marca('11'); await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' })); await sleep(4000)
})

// ── R3 Diego: portafolio, clientes, matches, Me interesa conectar ───────────────────────
await toma('r3-diego', 'diego.salinas@demo.smtbroker.mx', '/portal-broker', async (page, marca) => {
  marca('12'); await sleep(3500)
  marca('13'); await sleep(5000)
  await clicTexto(page, 'Mis clientes'); await sleep(800)
  marca('14'); await sleep(5000)
  await clicTexto(page, 'Matches')
  await esperarQueNo(page, 'Buscando coincidencias', 30000); await sleep(800)
  marca('15'); await sleep(5000)
  marca('16'); await irA(page, 'Familia G.', 260, 1000); await resaltarFila(page, ['Familia G.', 'Casa Fuentes del Valle']); await sleep(5000)
  marca('17'); await irA(page, 'Dr. R.', 220, 1200)
  const boton = await resaltarFila(page, ['Dr. R.', 'Departamento Punto Valle'])
  await sleep(5000)
  marca('18'); await boton.asElement()?.click(); await sleep(3000)
})

// ── R4 Patricia: lo que busca y sus coincidencias ───────────────────────────────────────
await toma('r4-patricia', 'patricia.longoria@demo.smtbroker.mx', '/portal-inversion', async (page, marca) => {
  await esperar(page, 'Coinciden con lo que buscas', 30000)
  marca('19'); await sleep(5000)
  marca('20'); await irA(page, 'Coinciden con lo que buscas', 100, 1600); await sleep(5000)
})

// ── R5 Operación: matches por validar → Poner en contacto ───────────────────────────────
await toma('r5-operacion', 'operacion@demo.smtbroker.mx', '/panel', async (page, marca) => {
  await esperar(page, 'Matches por validar', 30000)
  marca('21'); await irA(page, 'Matches por validar', 90, 1600); await resaltarFila(page, ['Departamento Punto Valle', 'Poner en contacto']); await sleep(6000)
  marca('22'); await clicTexto(page, 'Poner en contacto'); await sleep(4000)
})

// ── R6 Diego: reportar cierre ───────────────────────────────────────────────────────────
await toma('r6-diego-cierre', 'diego.salinas@demo.smtbroker.mx', '/portal-broker', async (page, marca) => {
  marca('23')
  const boton = await resaltarFila(page, ['Departamento Arboleda 1204', 'Reportar cierre'])
  await sleep(1200)
  await boton.asElement()?.click(); await sleep(1000)
  await irA(page, 'Reportar cierre ·', 120, 900)
  await page.type('input[type="number"]', '7700000', { delay: 60 })
  await page.select('select', 'otro_broker')
  await sleep(800)
  await page.evaluate(() => [...document.querySelectorAll('button[type="submit"]')].find((b) => /Reportar cierre/.test(b.innerText))?.click())
  await sleep(2500)
})

// ── R7 Operación: verificar el cierre ───────────────────────────────────────────────────
await toma('r7-operacion-verifica', 'operacion@demo.smtbroker.mx', '/panel', async (page, marca) => {
  await esperar(page, 'Cierres por verificar', 30000)
  marca('24'); await irA(page, 'Cierres por verificar', 90, 1400); await resaltarFila(page, ['Departamento Arboleda 1204', 'Verificar']); await sleep(2500)
  await clicTexto(page, 'Verificar'); await sleep(2500)
})

// ── R8 Diego: su nivel ──────────────────────────────────────────────────────────────────
await toma('r8-diego-nivel', 'diego.salinas@demo.smtbroker.mx', '/portal-broker', async (page, marca) => {
  await clicTexto(page, 'Mi desempeño'); await sleep(800)
  marca('24b'); await sleep(4500)
  marca('25'); await sleep(3000)
})

writeFileSync(`${OUT}/marcas.json`, JSON.stringify(marcas, null, 2))
await browser.close()
console.log(`\nListo: ${marcas.length} marcas en ${OUT}/marcas.json`)
