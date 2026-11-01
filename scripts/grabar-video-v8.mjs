// Graba las tomas del video demo v8 (guion-demo-v8, aprobado por JC el 1-nov-2026): primero POR TU CUENTA
// (Ricardo hace su ficha, su página y ve sus interesados; Patricia compra y Operación la conecta), luego
// CON BROKER (Ricardo elige a Diego, Diego acepta y ve la red). Base, el grabador del v7.2:
// las del v7 más dos del recorrido guiado /empezar en celular -- Ricardo vende (r0a) y Patricia compra
// (r0b) -- con cuentas nuevas @demo.smtbroker.mx que van al mundo demo y se BORRAN al restaurar.
// Base (v7): video demo v7 (guion: Documents/SMTBROKER/demo-v2/guion-demo-v7.docx, aprobado por
// JC el 2026-10-31) contra producción, en el MUNDO DEMO (no manda correos ni toca datos reales). Es el
// grabador del v6 con un cambio en la toma de Patricia. V7.1 (2026-11-01, JC): Patricia compra POR SU
// CUENTA (sin broker en el mundo demo) y la toma termina en su Radar de mercado (marca "16b"). Las marcas conservan los nombres del v6; el montaje
// (demo-v2/armar_v7.py) decide qué tramo va en cada escena del v7.
//
// Prepara el mundo demo (Diego Pionero con su cierre por verificar, para que suba de Plata a Oro en
// cámara), toma "foto" de todo lo que toca y lo RESTAURA al final aunque algo falle. Hace dos llamadas
// reales a la IA (ficha de venta y dictamen legal).
//
// Uso: FFMPEG=<ffmpeg.exe> node --env-file=.env.local scripts/grabar-video-v7.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'video-v7'
if (!process.env.DEMO_PASSWORD || !process.env.FFMPEG) throw new Error('Faltan DEMO_PASSWORD (.env.local) y FFMPEG')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const INICIO = new Date().toISOString()
const SUFIJO = Math.random().toString(36).slice(2, 8)
const RECORRIDO = { ricardo: `recorrido.ricardo.${SUFIJO}@demo.smtbroker.mx`, patricia: `recorrido.patricia.${SUFIJO}@demo.smtbroker.mx` }
const CEL = { width: 390, height: 844 }
const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx',
  patricia: 'patricia.longoria@demo.smtbroker.mx', operacion: 'operacion@demo.smtbroker.mx',
}

// ── Foto del mundo demo (para restaurar) ────────────────────────────────────────────────────
const { data: lista } = await admin.auth.admin.listUsers({ perPage: 500 })
const ids = Object.fromEntries(Object.entries(CUENTAS).map(([k, e]) => [k, lista.users.find((u) => u.email === e).id]))
const { data: terreno } = await admin.from('activos').select('*').eq('usuario_id', ids.ricardo).eq('nombre', 'Terreno Valle Poniente').single()
const { data: diegoAntes } = await admin.from('usuarios').select('pionero').eq('id', ids.diego).single()
const { data: cierresDiego } = await admin.from('cierres_reportados').select('id, estado, verificado_at').eq('broker_id', ids.diego)
const CAMPOS = ['broker_id', 'folio_real', 'escritura_publica', 'clave_catastral', 'gravamenes_conocidos', 'uso_suelo_declarado', 'estado_documentacion_legal', 'publicada_at', 'status']
const foto = { terreno: Object.fromEntries(CAMPOS.map((c) => [c, terreno[c]])), pionero: diegoAntes.pionero, cierres: cierresDiego }
writeFileSync(join(OUT, 'foto.json'), JSON.stringify(foto, null, 2))

async function restaurar() {
  const id = terreno.id
  for (const t of ['oportunidades', 'certificaciones', 'leads', 'visitas_publicas']) await admin.from(t).delete().eq('activo_id', id)
  await admin.from('diagnosticos').delete().eq('activo_id', id).gte('created_at', INICIO)
  await admin.from('matches').delete().gte('created_at', INICIO).in('solicitado_por', Object.values(ids))
  await admin.from('activos').update(foto.terreno).eq('id', id)
  await admin.from('usuarios').update({ pionero: foto.pionero }).eq('id', ids.diego)
  for (const c of foto.cierres) await admin.from('cierres_reportados').update({ estado: c.estado, verificado_at: c.verificado_at }).eq('id', c.id)
  // Cuentas del recorrido: su propiedad, su búsqueda y la cuenta misma.
  const { data: todas } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of todas.users.filter((x) => Object.values(RECORRIDO).includes(x.email))) {
    await admin.from('perfiles_intencion').delete().eq('usuario_id', u.id)
    await admin.from('activos').delete().eq('usuario_id', u.id)
    await admin.from('usuarios').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log('Restaurado el mundo demo.')
}

// ── Grabación ───────────────────────────────────────────────────────────────────────────────
const marcas = []
const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 720 } })

async function toma(nombre, cuenta, inicio, fn, viewport) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  if (viewport) await page.setViewport(viewport)
  // Chrome headless deja de emitir cuadros cuando la página queda quieta: un punto invisible con
  // animación continua obliga a seguir pintando (hallazgo 2026-10-05, grabador del v4).
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
    await page.type('input[type="password"]', process.env.DEMO_PASSWORD)
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  }
  await page.goto(`${BASE}${inicio}`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  const rec = await page.screencast({ path: join(OUT, `${nombre}.webm`), ffmpegPath: process.env.FFMPEG })
  const t0 = Date.now()
  const marca = (escena) => { marcas.push({ toma: nombre, escena, t: (Date.now() - t0) / 1000 }); console.log(`  [${nombre}] ${escena} @ ${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  await sleep(300)
  await fn(page, marca)
  await sleep(1500)
  marca('fin')
  await rec.stop()
  await ctx.close()
}

// Desplaza suavemente hasta que el elemento con ese texto quede a `offset` px del borde superior.
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
// Hace clic en el botón con esa etiqueta, dentro del bloque más chico que contiene `dentroDe`.
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
// Acercamiento lento (solo visual) al bloque que contiene el texto: la escalera de niveles.
async function acercar(page, texto, escala = 1.12, ms = 2600) {
  await page.evaluate((texto, escala, ms) => {
    const xpath = `//*[contains(normalize-space(text()), ${JSON.stringify(texto)})]`
    const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
    const caja = el?.closest('div.border') ?? el?.parentElement
    if (!caja) return
    caja.style.transition = `transform ${ms}ms ease-in-out`
    caja.style.transformOrigin = 'center top'
    caja.style.transform = `scale(${escala})`
  }, texto, escala, ms)
  await sleep(ms)
}
const hayTexto = (page, t, timeout) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout, polling: 400 }, t)
// Producción a veces se queda colgada en una carga (dos veces el 1-nov). Sin timeout explícito: espera
// 60 s, recarga la página y espera otros 120 s. Con timeout explícito (IA corriendo) no recarga.
const esperar = async (page, t, timeout) => {
  if (timeout) return hayTexto(page, t, timeout)
  try { await hayTexto(page, t, 60000) } catch {
    console.log(`  (recargo: no apareció «${t}» en 60 s)`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await hayTexto(page, t, 120000)
  }
}
// Que un error tardío del grabador de pantalla no tumbe el proceso antes de restaurar el mundo demo.
process.on('unhandledRejection', (e) => console.error('  (aviso)', e?.message ?? e))

try {
  await admin.from('usuarios').update({ pionero: true }).eq('id', ids.diego)
  for (const c of cierresDiego) await admin.from('cierres_reportados').update({ estado: 'pendiente', verificado_at: null }).eq('id', c.id)

  // R1 · Apertura: las tres puertas (escena 3)
  await toma('r1-apertura', null, '/bienvenida', async (page, marca) => {
    marca('03'); await sleep(2500)
    await irA(page, 'Cómo quieres participar', 60, 2200); await sleep(5000)
  })

  // R0a · Recorrido guiado de Ricardo (vender), en celular
  await toma('r0a-ricardo-recorrido', null, '/empezar', async (page, marca) => {
    marca('que'); await sleep(2500)
    await clic(page, 'Quiero vender'); await esperar(page, 'Cuéntanos de tu propiedad')
    marca('datos'); await sleep(800)
    const campos = await page.$$('form input:not([name="sitio_web"])')
    const escribir = async (i, t) => { await campos[i].click(); await page.keyboard.type(t, { delay: 28 }) }
    await escribir(0, 'Ricardo Villarreal'); await escribir(1, '81 1234 5678')
    await page.select('form select', 'Terreno'); await sleep(300)
    await escribir(2, '1020'); await escribir(3, 'Valle Poniente'); await escribir(4, 'San Pedro Garza García')
    await escribir(5, '24,000,000'); await escribir(6, RECORRIDO.ricardo); await escribir(7, process.env.DEMO_PASSWORD)
    await sleep(600)
    await clic(page, 'Continuar'); await esperar(page, '¿Cómo quieres vender?')
    marca('camino'); await sleep(4000)
    // Su panel (/inicio, desde el 1-nov): analizando → precio realista → invitación a certificar.
    await clic(page, 'Continuar por mi cuenta'); await esperar(page, 'Esto es lo que preparamos para ti')
    marca('panel'); await sleep(1500)
    await esperar(page, 'Ver análisis completo', 180000)
    marca('precio'); await sleep(4500)
    await irA(page, 'Certifica tu propiedad', 80, 1400)
    marca('certificar'); await sleep(4500)
    // La plataforma le prepara su ficha y su página; él solo publica (1-nov, commit 9b38252).
    await esperar(page, 'Tu página de venta está lista', 240000)
    await irA(page, 'Tu página de venta', 80, 1400)
    marca('lista'); await sleep(4000)
    await clic(page, 'Publicar'); await esperar(page, 'Tu página está publicada')
    marca('publicada'); await sleep(4000)
  }, CEL)

  // R0b · Recorrido guiado de Patricia (comprar), en celular
  await toma('r0b-patricia-recorrido', null, '/empezar', async (page, marca) => {
    await sleep(1200)
    await clic(page, 'Quiero comprar'); await esperar(page, '¿Qué estás buscando?')
    marca('datos'); await sleep(800)
    const campos = await page.$$('form input:not([name="sitio_web"])')
    const escribir = async (i, t) => { await campos[i].click(); await page.keyboard.type(t, { delay: 28 }) }
    await escribir(0, 'Patricia Longoria'); await escribir(1, '81 8765 4321')
    await escribir(2, 'Departamento'); await escribir(3, 'San Pedro Garza García')
    await page.select('form select', '$5M – $15M'); await sleep(300)
    await escribir(4, RECORRIDO.patricia); await escribir(5, process.env.DEMO_PASSWORD)
    await sleep(600)
    await clic(page, 'Continuar'); await esperar(page, '¿Cómo quieres buscar?')
    marca('camino'); await sleep(4000)
    // Su panel (/inicio): afina su búsqueda y guarda.
    await clic(page, 'Buscar por mi cuenta'); await esperar(page, 'Cuéntanos más de lo que buscas')
    marca('panel'); await sleep(1500)
    await clic(page, 'Departamento'); await sleep(500)
    const det = await page.$$('main input')
    const poner = async (i, t) => { await det[i].click(); await page.keyboard.type(t, { delay: 60 }) }
    await poner(0, '3'); await poner(1, '2'); await poner(2, '120'); await poner(3, 'Valle Oriente')
    await clic(page, 'Terraza'); await sleep(400); await clic(page, 'Amenidades'); await sleep(600)
    await clic(page, 'Guardar y afinar mi búsqueda'); await esperar(page, 'Guardado')
    marca('guardado'); await sleep(1200)
    await irA(page, 'Lo que coincide contigo', 120, 1400); await sleep(3500)
  }, CEL)

  // R2 · Ricardo por su cuenta: expediente y certificación (escena 6), su ficha y su página (escena 7)
  await toma('r2-ricardo', 'ricardo', '/dashboard', async (page, marca) => {
    marca('04'); await sleep(2500)
    await page.goto(`${BASE}/activo/${terreno.id}`, { waitUntil: 'domcontentloaded' })
    await esperar(page, 'Precio de salida recomendado'); await esperar(page, 'Para certificar te falta'); await sleep(800)
    marca('06'); await irA(page, 'Uso de suelo y expediente legal', 90, 1800); await sleep(4500)
    await admin.from('activos').update({
      folio_real: 'FR-847231', escritura_publica: 'si', clave_catastral: '19-045-012', gravamenes_conocidos: 'ninguno',
      uso_suelo_declarado: 'habitacional', estado_documentacion_legal: 'completa',
    }).eq('id', terreno.id)
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperar(page, 'Expediente completo')
    await irA(page, 'Expediente para certificar', 90, 10); await sleep(600)
    marca('07'); await sleep(1500)
    await clic(page, 'Solicitar certificación legal'); await esperar(page, 'Certificación en revisión'); await sleep(3000)
    await page.goto(`${BASE}/activo/${terreno.id}/marketing`, { waitUntil: 'domcontentloaded' }); await esperar(page, 'Generar ficha de venta'); await sleep(800)
    marca('ficha'); await irA(page, 'Ficha de venta', 100, 800); await sleep(1200)
    await clic(page, 'Generar ficha de venta'); await sleep(2000)
    marca('ficha-espera'); await esperar(page, 'Puntos fuertes', 180000); await sleep(400)
    marca('ficha-lista'); await sleep(4500)
    await irA(page, 'Página pública', 100, 1400); await clic(page, 'Publicar página'); await esperar(page, 'Compartir por WhatsApp')
    marca('publicada'); await sleep(3500)
  })

  // R4 · Visitante en un celular: "Me interesa" en la página de Ricardo (el segundo interesado va aparte)
  await toma('r4-visitante', null, `/p/${terreno.id}`, async (page, marca) => {
    marca('14'); await sleep(2500)
    await irA(page, 'Diagnóstico de mercado', 80, 2200); await sleep(1500)
    await clic(page, 'Me interesa esta propiedad'); await sleep(800)
    await page.type('input[placeholder="Tu nombre"]', 'Laura Treviño', { delay: 40 })
    await page.type('input[placeholder^="Correo o WhatsApp"]', '8112345678', { delay: 40 })
    const s = await page.$$('form select')
    await s[0].select('$10M – $20M'); await s[1].select('menos_3m'); await s[2].select('contado')
    await page.click('form input[type="checkbox"]'); await sleep(800)
    await clic(page, 'Enviar'); await esperar(page, 'Recibimos tu interés'); await sleep(2500)
  }, { width: 405, height: 720, deviceScaleFactor: 1, isMobile: true })
  await fetch(`${BASE}/api/leads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activoId: terreno.id, nombre: 'Jorge Ruiz', contacto: 'jorge.ruiz@ejemplo.mx', presupuesto: 'Menos de $5M', plazo: 'sin_definir', formaPago: 'no_se', aceptaAviso: true }),
  })

  // R5 · Ricardo ve SUS interesados (vende por su cuenta): escena 8
  await toma('r5-ricardo-leads', 'ricardo', `/activo/${terreno.id}/leads`, async (page, marca) => {
    await esperar(page, 'Laura Treviño')
    marca('15'); await sleep(3000); await irA(page, 'Interesados de la página pública', 90, 1500); await sleep(4000)
  })

  // R6 · Patricia por su cuenta: coincidencias de particulares, su Radar y "Me interesa" (escenas 10-11)
  await toma('r6-patricia', 'patricia', '/portal-inversion', async (page, marca) => {
    await esperar(page, 'Propiedades de particulares que coinciden'); await esperar(page, 'Radar de mercado')
    marca('16'); await irA(page, 'Propiedades de particulares que coinciden', 90, 1600); await sleep(3000)
    marca('16b'); await irA(page, 'Radar de mercado', 90, 1600); await sleep(4500)
    marca('16c'); await irA(page, 'Propiedades de particulares que coinciden', 90, 1200)
    await clic(page, 'Me interesa'); await esperar(page, 'Solicitado'); await sleep(3000)
  })

  // R7 · Operación valida la conexión de Patricia con el departamento de Laura (escena 11)
  await toma('r7-operacion', 'operacion', '/panel', async (page, marca) => {
    await esperar(page, 'Matches por validar'); await sleep(1500)
    marca('17'); await irA(page, 'Matches por validar', 90, 1200); await sleep(3000)
    await clic(page, 'Poner en contacto', 'Patricia'); await esperar(page, 'Marcar cerrado')
    marca('contacto'); await sleep(2500)
  })

  // R6b · Patricia ya tiene el contacto de la vendedora (escena 11)
  await toma('r6b-patricia-contacto', 'patricia', '/portal-inversion', async (page, marca) => {
    await esperar(page, 'Contacto:'); await sleep(500)
    marca('contacto'); await irA(page, 'Contacto:', 260, 1400); await sleep(4500)
  })

  // R2b · Ricardo decide sumar a un broker verificado: el directorio y Diego (escenas 15-16)
  await toma('r2b-ricardo-broker', 'ricardo', `/activo/${terreno.id}`, async (page, marca) => {
    await esperar(page, 'Elige un broker verificado'); await esperar(page, 'Diego Salinas'); await sleep(500)
    marca('directorio'); await irA(page, 'Elige un broker verificado', 90, 1600); await sleep(4000)
    marca('elige'); await clic(page, 'Elegir', 'Diego Salinas'); await esperar(page, 'Esperando respuesta de'); await sleep(3500)
  })

  // R3 · Diego acepta a Ricardo y ve la red: compradores de otros brokers (escenas 13-14)
  await toma('r3-diego', 'diego', '/portal-broker', async (page, marca) => {
    await esperar(page, 'Hola, Diego'); await sleep(1500)
    await clic(page, 'Oportunidades'); await esperar(page, 'Terreno Valle Poniente'); await sleep(800)
    marca('acepta'); await sleep(2500)
    await clic(page, 'Aceptar y representar'); await esperar(page, 'Aceptada'); await sleep(2500)
    marca('red'); await page.evaluate(() => window.scrollTo(0, 0)); await clic(page, 'Matches'); await esperar(page, 'Para tu portafolio', 30000); await sleep(1500)
    await irA(page, 'Para tu portafolio', 90, 1600); await sleep(5000)
  })

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
