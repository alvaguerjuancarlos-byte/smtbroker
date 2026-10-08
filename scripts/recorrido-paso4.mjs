// Recorrido visual del paso 4 V6.3 (diagnóstico en dos niveles) con Puppeteer: un propietario
// temporal abre su activo con el expediente vacío, ve "Para certificar te falta…", completa el
// expediente, solicita la certificación; luego Operación la ve en /panel. Capturas en
// scripts/capturas-paso4/. Crea y borra sus cuentas y su activo.
//
// El mapa de Google da RefererNotAllowedMapError en localhost:3001 (la llave solo autoriza los
// dominios reales); se ignora.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/recorrido-paso4.mjs

import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OUT = 'scripts/capturas-paso4'
mkdirSync(OUT, { recursive: true })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
const errores = []
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function cuenta(rol) {
  const email = `recorrido4-${rol}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `Recorrido ${rol} ${sufijo}`, rol })
  return { id: data.user.id, email }
}

const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } })
async function sesion(email) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', PASS)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  return { page, ctx }
}
const texto = (page) => page.evaluate(() => document.body.innerText)
const esperarTexto = (page, t, timeout = 90000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t).then(() => true, () => false)

try {
  const P = await cuenta('propietario')
  const OP = await cuenta('broker_maestro')
  const { data: act } = await admin.from('activos').insert({
    usuario_id: P.id, nombre: `Casa recorrido ${sufijo}`, tipo: 'Casa', direccion: 'Av. Prueba 100', colonia: 'Valle Oriente',
    municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 400, precio_total: 14_000_000,
    status: 'ingresado', lat: 25.6517, lng: -100.3586, gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'no_determinado',
  }).select('id').single()

  const { page } = await sesion(P.email)
  await page.goto(`${BASE}/activo/${act.id}`, { waitUntil: 'domcontentloaded' })
  check('se ve "Para certificar te falta"', await esperarTexto(page, 'Para certificar te falta'))
  check('se ve el uso de suelo oficial del GIS', await esperarTexto(page, 'Zonificación oficial'))
  await esperarTexto(page, 'Precio de salida recomendado')
  const t1 = await texto(page)
  check('ya no aparece "Requiere validación legal"', !t1.includes('Requiere validación legal'))
  check('botón de certificación deshabilitado', await page.$eval('::-p-text(Solicitar certificación legal)', (b) => b.disabled))
  await page.screenshot({ path: `${OUT}/1-rapido-expediente-vacio.png`, fullPage: true })

  await admin.from('activos').update({
    folio_real: 'FR-REC-1', escritura_publica: 'si', clave_catastral: '01-002-003', uso_suelo_declarado: 'habitacional', estado_documentacion_legal: 'completa',
  }).eq('id', act.id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  check('expediente completo', await esperarTexto(page, 'Expediente completo'))
  await (await page.waitForSelector('::-p-text(Solicitar certificación legal)')).click()
  check('certificación en revisión', await esperarTexto(page, 'Certificación en revisión', 15000))
  await sleep(800)
  await page.screenshot({ path: `${OUT}/2-certificacion-solicitada.png`, fullPage: true })

  const { page: pop } = await sesion(OP.email)
  await pop.goto(`${BASE}/panel`, { waitUntil: 'domcontentloaded' })
  check('Operación ve la certificación en /panel', await esperarTexto(pop, 'Correr dictamen', 30000) && (await texto(pop)).includes('Certificaciones legales'))
  check('con botón "Correr dictamen" (sin paso de pago)', !(await texto(pop)).includes('Confirmar pago'))
  await pop.screenshot({ path: `${OUT}/3-panel-operacion.png`, fullPage: true })
} catch (e) {
  fallas++; console.error('ERROR', e.message)
} finally {
  await browser.close()
  for (const id of creados) {
    await admin.from('activos').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const relevantes = errores.filter((e) => !/favicon|Download the React DevTools|RefererNotAllowedMapError/i.test(e))
  check('sin errores de consola', relevantes.length === 0, relevantes.slice(0, 3).join(' | '))
  console.log(`\nCapturas en ${OUT}/. Limpieza: ${creados.length} cuentas borradas.`)
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
  process.exit(fallas ? 1 : 0)
}
