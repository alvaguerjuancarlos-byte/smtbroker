// Prueba de la RENTA REALISTA del dueño (Documento Maestro V9, §22.3) contra la base real, en el
// MUNDO DEMO, con cuentas temporales que se borran al final. Usa búsquedas reales (Serper + Claude).
// Uso: node --env-file=.env.local scripts/verificar-renta-realista.mjs <carpeta-para-capturas>
//
// Dos dueñas se registran por /api/registro-cliente: una con un departamento SOLO EN RENTA y otra
// con uno EN VENTA Y EN RENTA. El Agente de Mercado debe dar renta realista (y precio de venta solo
// a la segunda); el panel /inicio y la página de la propiedad lo muestran.
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaRR-' + ts
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 }
const limpiar = []

async function registrar(nombre, correo, propiedad) {
  const r = await fetch(BASE + '/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiere: 'vender', nombre, email: correo, password: PASS, telefono: '8112345678', propiedad }),
  })
  const j = await r.json()
  const { data } = await admin.from('usuarios').select('id').eq('nombre', nombre).eq('es_demo', true).order('created_at', { ascending: false }).limit(1)
  if (data?.[0]) limpiar.push(data[0].id)
  const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: s } = await cli.auth.signInWithPassword({ email: correo, password: PASS })
  return { status: r.status, activoId: j.activoId, tk: s?.session?.access_token, correo }
}
const mercado = async (tk, activoId) => {
  const r = await fetch(BASE + '/api/agentes/mercado', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ activoId }) })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}

let b
try {
  const base = { tipo: 'Departamento', superficie: '120', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente' }
  const soloRenta = await registrar('Dueña Solo Renta Prueba', `rr-renta-${ts}@demo.smtbroker.mx`, { ...base, operacion: 'renta', renta_mensual: '35000', renta: { deposito_meses: '2' } })
  const ambas = await registrar('Dueña Ambas Prueba', `rr-ambas-${ts}@demo.smtbroker.mx`, { ...base, operacion: 'ambas', precio: '9500000', renta_mensual: '35000' })
  ok(soloRenta.status === 200 && ambas.status === 200, 'las dos dueñas se registran')

  const [m1, m2] = await Promise.all([mercado(soloRenta.tk, soloRenta.activoId), mercado(ambas.tk, ambas.activoId)])
  ok(m1.status === 200 && m1.j.operacion === 'renta' && m1.j.precioSalidaRecomendadoMXN == null && m1.j.comparablesAnalizados === 0 && !!m1.j.renta,
    'solo en renta: sin valuación de venta y con bloque de renta')
  const rr = m1.j.renta
  console.log(`INFO  solo renta: renta realista ${rr?.rentaRealistaMXN ?? 'sin dato'} al mes (${rr?.comparablesUsados}/${rr?.comparablesAnalizados} comparables, ${rr?.rentaM2Zona ?? '—'}/m²) · "${m1.j.interpretacion}"`)
  ok(rr && (rr.rentaRealistaMXN == null || (rr.rentaRealistaMXN > 5_000 && rr.rentaRealistaMXN < 200_000)), `la renta realista es renta mensual, no precio de venta (${rr?.rentaRealistaMXN})`)
  ok(!/plusval[ií]a|invers/i.test(m1.j.interpretacion ?? '') || /renta/i.test(m1.j.interpretacion ?? ''), 'la lectura del analista habla de renta')
  ok(m2.status === 200 && m2.j.operacion === 'ambas' && !!m2.j.renta && m2.j.comparablesAnalizados > 0, `en venta y renta: las dos (${m2.j.comparablesAnalizados} comparables de venta, ${m2.j.renta?.comparablesAnalizados} de renta)`)
  console.log(`INFO  ambas: venta ${m2.j.precioSalidaRecomendadoMXN ?? 'sin dato'} · renta ${m2.j.renta?.rentaRealistaMXN ?? 'sin dato'} al mes`)

  // Panel del dueño y página de la propiedad.
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 })
  await p.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await p.type('input[type="email"]', soloRenta.correo); await p.type('input[type="password"]', PASS)
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.keyboard.press('Enter')])
  await p.goto(BASE + '/inicio', { waitUntil: 'networkidle2' })
  await p.waitForFunction(() => /renta realista/i.test(document.querySelector('[data-precio-realista]')?.innerText ?? '') && !/analizando el mercado/i.test(document.body.innerText), { timeout: 120000 })
  const panel = (await p.evaluate(() => document.body.innerText)).toLowerCase()
  ok(panel.includes('tu renta realista de mercado') && (panel.includes('al mes') || panel.includes('sin dato todavía')), 'el panel dice "Tu renta realista de mercado"')
  await p.screenshot({ path: `${out}/rr-1-panel.png`, fullPage: true })
  await p.goto(`${BASE}/activo/${soloRenta.activoId}`, { waitUntil: 'networkidle2' })
  await p.waitForSelector('[data-renta-mercado]', { timeout: 60000 })
  const pag = (await p.evaluate(() => document.body.innerText)).toLowerCase()
  ok(pag.includes('renta realista recomendada') && !pag.includes('precio de salida recomendado'), 'la página de la propiedad muestra la renta realista y no el precio de venta')
  await p.screenshot({ path: `${out}/rr-2-activo.png`, fullPage: true })
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
} finally {
  if (b) await b.close()
  for (const id of limpiar) {
    const { data: act } = await admin.from('activos').select('id').eq('usuario_id', id)
    if (act?.length) await admin.from('activos').delete().in('id', act.map((a) => a.id))
    await admin.from('contactos_cliente').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`limpieza: ${limpiar.length} cuentas temporales borradas`)
}
