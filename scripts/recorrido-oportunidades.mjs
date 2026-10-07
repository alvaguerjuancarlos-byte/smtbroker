// Recorrido visual del paso 3B (el propietario elige broker) con Puppeteer: un propietario ve
// "Elige un broker certificado de tu zona", elige a un broker Pionero; el broker ve la oportunidad
// en su pestaña "Oportunidades" y la acepta. Capturas en scripts/capturas-oportunidades/. Crea y
// borra sus cuentas y activos. Los textos se comparan sin mayúsculas: innerText aplica text-transform. El mapa de Google da RefererNotAllowedMapError en localhost (se ignora).
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/recorrido-oportunidades.mjs

import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OUT = 'scripts/capturas-oportunidades'
mkdirSync(OUT, { recursive: true })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
const errores = []
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }

async function cuenta(rol, nombre, extra = {}) {
  const email = `recorrido3b-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${nombre} ${sufijo}`, rol, ...extra })
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
  return page
}
const esperar = (page, t, timeout = 30000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout }, t).then(() => true, () => false)

try {
  const P = await cuenta('propietario', 'Propietaria')
  const B = await cuenta('broker', 'Broker Pionero', { pionero: true })
  await admin.from('activos').insert({
    usuario_id: B.id, broker_id: B.id, cargado_por: 'broker', propietario_nombre: 'Prop', representacion_tipo: 'exclusiva',
    representacion_declarada_at: new Date().toISOString(), nombre: `Portafolio del broker ${sufijo}`, tipo: 'Casa',
    municipio: 'San Pedro Garza García', estado: 'Nuevo León', status: 'valoracion', precio_total: 9_000_000,
  })
  const { data: act } = await admin.from('activos').insert({
    usuario_id: P.id, nombre: `Casa de la propietaria ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García',
    estado: 'Nuevo León', status: 'ingresado', precio_total: 12_000_000, superficie: 350,
  }).select('id').single()

  const pp = await sesion(P.email)
  await pp.goto(`${BASE}/activo/${act.id}`, { waitUntil: 'domcontentloaded' })
  check('el propietario ve "Elige un broker certificado"', await esperar(pp, 'Elige un broker certificado de tu zona'))
  check('aparece el broker Pionero con nivel Plata', await esperar(pp, `Broker Pionero ${sufijo}`) && (await pp.evaluate(() => document.body.innerText)).toLowerCase().includes('nivel plata'))
  await pp.screenshot({ path: `${OUT}/1-propietario-elige.png`, fullPage: true })
  await (await pp.waitForSelector('::-p-text(Elegir)')).click()
  check('queda esperando respuesta', await esperar(pp, 'Esperando respuesta de'))

  const pb = await sesion(B.email)
  await esperar(pb, 'Oportunidades')
  await (await pb.waitForSelector('::-p-text(Oportunidades)')).click()
  check('el broker ve la oportunidad', await esperar(pb, `Casa de la propietaria ${sufijo}`))
  await pb.screenshot({ path: `${OUT}/2-broker-oportunidad.png`, fullPage: true })
  await (await pb.waitForSelector('::-p-text(Aceptar y representar)')).click()
  check('aceptada', await esperar(pb, 'Aceptada'))
  await (await pb.waitForSelector('::-p-text(Mi portafolio)')).click()
  check('la propiedad aparece en su portafolio', await esperar(pb, `Casa de la propietaria ${sufijo}`))
} catch (e) {
  fallas++; console.error('ERROR', e.message)
} finally {
  await browser.close()
  for (const id of creados) {
    await admin.from('activos').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const relevantes = errores.filter((e) => !/favicon|React DevTools|RefererNotAllowedMapError/i.test(e))
  check('sin errores de consola', relevantes.length === 0, relevantes.slice(0, 3).join(' | '))
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
  process.exit(fallas ? 1 : 0)
}
