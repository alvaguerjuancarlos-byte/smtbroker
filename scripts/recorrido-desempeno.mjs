// Recorrido visual de "Mi desempeño" (niveles + Pionero + barras de progreso) con Puppeteer: un
// broker Pionero temporal con 4 propiedades (2 documentadas) y sin cierres -- debe verse en Plata,
// con la escalera y "Cierres verificados 0 / 1" para subir a Oro. Captura en
// scripts/capturas-desempeno/. Crea y borra su cuenta y sus activos.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/recorrido-desempeno.mjs

import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OUT = 'scripts/capturas-desempeno'
mkdirSync(OUT, { recursive: true })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const email = `desempeno-${sufijo}@prueba.smtbroker.mx`
const errores = []
let fallas = 0
let uid = null
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }

const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 900 } })
try {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  uid = data.user.id
  await admin.from('usuarios').upsert({ id: uid, nombre: `Broker Desempeño ${sufijo}`, rol: 'broker', pionero: true })
  const casa = (n, folio) => ({
    usuario_id: uid, broker_id: uid, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
    representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
    nombre: `Casa ${n} ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
    status: 'valoracion', precio_total: 9_000_000, folio_real: folio,
  })
  await admin.from('activos').insert([casa(1, 'FR-1'), casa(2, 'FR-2'), casa(3, null), casa(4, null)])

  const page = await browser.newPage()
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', PASS)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await page.waitForFunction(() => document.body.innerText.includes('Mi desempeño'), { timeout: 20000 })
  check('el encabezado muestra nivel y Pionero', (await page.evaluate(() => document.body.innerText)).includes('Nivel Plata · ★ Pionero'))
  await (await page.waitForSelector('::-p-text(Mi desempeño)')).click()
  await page.waitForFunction(() => document.body.innerText.includes('Para subir a'), { timeout: 10000 })
  const t = await page.evaluate(() => document.body.innerText)
  check('insignia de Pionero', t.includes('★ Broker Pionero'))
  check('escalera con los 4 niveles', ['ALIADO', 'PLATA', 'ORO', 'PLATINO'].every((n) => t.toUpperCase().includes(n)))
  check('siguiente nivel: Oro', t.includes('Para subir a Oro'))
  check('barra "Cierres verificados 0 / 1"', /Cierres verificados\s*0 \/ 1/.test(t))
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: `${OUT}/mi-desempeno.png`, fullPage: true })
} catch (e) {
  fallas++; console.error('ERROR', e.message)
} finally {
  await browser.close()
  if (uid) {
    await admin.from('activos').delete().eq('usuario_id', uid)
    await admin.from('usuarios').delete().eq('id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  check('sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '))
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
  process.exit(fallas ? 1 : 0)
}
