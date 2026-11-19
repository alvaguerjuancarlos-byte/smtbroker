// Prueba de punta a punta del CIERRE EN RENTA con asesor (guion v12, partes 4 y 5; Documento Maestro V10
// §25): el caso del video, con cuentas TEMPORALES del mundo demo que se BORRAN al terminar.
//   1. Un asesor (temporal) tiene un depa en renta en Valle Poniente (Santa Catarina).
//   2. El cliente se da de alta por la entrada demo y guarda su búsqueda: renta, 3 recámaras, $55k–$60k.
//   3. El asesor le propone su depa → Me interesa → Conectar (con propuesta se valida sola) → teléfonos.
//   4. El cliente marca "Negociando". Antes del cierre no puede calificar.
//   5. El asesor reporta la renta (renta mensual y fecha de firma): queda en cierres_reportados y la
//      propiedad (solo en renta) se cierra.
//   6. EN PANTALLA, el cliente entra con su usuario, abre la conexión, toca "Confirmo que ya rento" y
//      califica al asesor (estrellas + "Enviar calificación").
// Uso: node --env-file=.env.local scripts/verificar-cierre-renta.mjs   (BASE_URL, por omisión localhost:3011)

import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'http://localhost:3011'
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const ts = Date.now(), SUF = Math.random().toString(36).slice(2, 6)
const PASS = 'PruebaCierre-' + ts
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fallas = 0, total = 0
const ok = (c, m) => { total++; console.log(`${c ? 'OK ' : 'FALLA'} ${m}`); if (!c) fallas++ }
const api = async (tk, ruta, metodo = 'GET', cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
const creado = { usuarios: [], activos: [], solicitudes: [] }

async function limpiar() {
  for (const id of creado.usuarios) {
    await admin.from('calificaciones').delete().or(`comprador_id.eq.${id},broker_id.eq.${id}`)
    await admin.from('cierres_reportados').delete().eq('broker_id', id)
    await admin.from('analisis').delete().eq('usuario_id', id)
    await admin.from('conexiones').delete().or(`comprador_id.eq.${id},contraparte_id.eq.${id}`)
  }
  if (creado.activos.length) {
    await admin.from('propuestas').delete().in('activo_id', creado.activos)
    await admin.from('activos').delete().in('id', creado.activos)
  }
  for (const id of creado.solicitudes) await admin.from('solicitudes').delete().eq('id', id)
  for (const id of creado.usuarios) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', id)
    for (const x of pf ?? []) { await admin.from('radar_opciones').delete().eq('perfil_id', x.id); await admin.from('oportunidades').delete().eq('perfil_id', x.id) }
    await admin.from('oportunidades').delete().eq('broker_id', id)
    await admin.from('busquedas_registro').delete().eq('usuario_id', id)
    for (const t of ['necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`Limpieza: ${creado.usuarios.length} cuentas, ${creado.activos.length} propiedad(es) y ${creado.solicitudes.length} solicitud(es) temporales borradas.`)
}

let b
try {
  // ── 1. El asesor y su depa en renta ───────────────────────────────────────────────────────
  const emailAsesor = `cierre-asesor-${ts}@demo.smtbroker.mx`
  const { data: ua, error: ea } = await admin.auth.admin.createUser({ email: emailAsesor, password: PASS, email_confirm: true })
  if (ea) throw ea
  creado.usuarios.push(ua.user.id)
  await admin.from('usuarios').upsert({ id: ua.user.id, nombre: 'Asesor Cierre Prueba', rol: 'broker', es_demo: true, pionero: true })
  const { data: sol } = await admin.from('solicitudes').insert({ nombre: 'Asesor Cierre Prueba', email: emailAsesor, telefono: '81 3333 4444', rol: 'broker', status: 'aprobada' }).select('id').single()
  if (sol) creado.solicitudes.push(sol.id)
  const { data: sa } = await anon().auth.signInWithPassword({ email: emailAsesor, password: PASS })
  const tkAsesor = sa.session.access_token
  const { data: act, error: eAct } = await admin.from('activos').insert({
    usuario_id: ua.user.id, broker_id: ua.user.id, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
    propietario_nombre: 'Propietario de prueba', nombre: 'Prueba Cierre · Depa en Valle Poniente', tipo: 'Departamento', estado: 'Nuevo León',
    municipio: 'Santa Catarina', colonia: 'Valle Poniente', superficie: 190, recamaras: 3, status: 'ingresado', es_demo: true,
    operacion: 'renta', renta_mensual: 58_000,
    renta: { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '1_anio', garantia: 'cualquiera', amueblada: false, mascotas: true },
  }).select('id').single()
  if (eAct) throw eAct
  creado.activos.push(act.id)
  ok(true, 'asesor temporal con su depa en renta en Valle Poniente (Santa Catarina), $58,000 al mes')

  // ── 2. El cliente: alta por la entrada demo y su búsqueda ──────────────────────────────────
  const usuarioCliente = `prueba.cierre.${SUF}`
  let r = await api(null, '/api/entrada-demo', 'POST', { accion: 'alta', nombre: 'Prueba Cierre Renta', usuario: usuarioCliente, whatsapp: `81 66${String(ts).slice(-6, -4)} ${String(ts).slice(-4)}` })
  ok(r.status === 200 && !!r.j.tokenHash, `el cliente se da de alta por la entrada demo (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  const { data: sc, error: eSc } = await anon().auth.verifyOtp({ token_hash: r.j.tokenHash, type: 'email' })
  if (eSc) throw eSc
  creado.usuarios.push(sc.user.id)
  const tkCliente = sc.session.access_token
  r = await api(tkCliente, '/api/necesidades', 'POST', {
    operacion: 'renta', renta: { plazo_contrato: null, garantia: null, fecha_entrada: null, amueblada: null, mascotas: null },
    tipo: 'departamento', zonas: [{ estado: 'Nuevo León', municipio: 'Santa Catarina', nombre: 'Valle Poniente', colonias: ['Valle Poniente'] }],
    caracteristicas: { recamaras: '3' }, presupuesto_min: '55000', presupuesto_max: '60000', forma_pago: null, plazo: null, proposito: null,
    busqueda_directa: true, publicada_brokers: true, camino: 'por_mi_cuenta',
  })
  ok(r.status === 200, `guarda su búsqueda: renta, depa de 3 recámaras en Valle Poniente, $55k–$60k (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', sc.user.id).single()

  // ── 3. Propuesta, Me interesa, Conectar ─────────────────────────────────────────────────────
  r = await api(tkAsesor, '/api/propuestas', 'POST', { necesidadId: nec.id, activoId: act.id, aceptoTerminos: true })
  ok(r.status === 200, `el asesor le propone su depa (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  for (let i = 0; i < 20; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('necesidad_id', nec.id).maybeSingle(); if (data?.precio_mercado) break; await sleep(2000) }
  const t = await api(tkCliente, '/api/necesidades')
  const enBanda2 = (t.j.bandeja ?? []).find((o) => o.activoId === act.id)
  ok(enBanda2?.origen === 'broker' && !!enBanda2?.broker?.nombre, `en su tablero llega como propuesta de asesor (${enBanda2?.broker?.nombre ?? 'no llegó'}${enBanda2?.broker?.nivel ? ' · ' + enBanda2.broker.nivel : ''})`)
  r = await api(tkCliente, '/api/analisis', 'POST', { activoId: act.id, necesidadId: nec.id })
  ok(r.status === 200, `"Me interesa": su análisis (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  r = await api(tkCliente, '/api/conexiones', 'POST', { activoId: act.id })
  const { data: cx } = await admin.from('conexiones').select('id, estado').eq('comprador_id', sc.user.id).eq('activo_id', act.id).maybeSingle()
  ok(r.status === 200 && cx?.estado === 'activa', `"Conectar" con la propuesta de un asesor se valida sola (${cx?.estado})`)
  let d = await api(tkCliente, `/api/conexiones/${cx.id}`)
  ok(!!d.j.telefonos?.contraparte, `el cliente ve el teléfono del asesor (${d.j.telefonos?.contraparte})`)
  d = await api(tkAsesor, `/api/conexiones/${cx.id}`)
  ok(!!d.j.telefonos?.comprador, `y el asesor ve el del cliente (${d.j.telefonos?.comprador})`)

  // ── 4. ¿En qué va? ──────────────────────────────────────────────────────────────────────────
  r = await api(tkCliente, `/api/conexiones/${cx.id}`, 'POST', { accion: 'estado', estado: 'negociando' })
  ok(r.status === 200, 'el cliente marca "Negociando"')
  r = await api(tkCliente, `/api/conexiones/${cx.id}`, 'POST', { accion: 'calificar', atencion: 5, rapidez: 5, honestidad: 5 })
  ok(r.status === 409, `antes del cierre no se puede calificar (${r.status})`)
  r = await api(tkCliente, `/api/conexiones/${cx.id}`, 'POST', { accion: 'reportar_cierre', precio: '58000', fecha: '2026-11-19' })
  ok(r.status === 403, `el cliente no puede reportar el cierre (${r.status})`)

  // ── 5. El asesor reporta la renta ───────────────────────────────────────────────────────────
  const hoy = new Date().toISOString().slice(0, 10)
  r = await api(tkAsesor, `/api/conexiones/${cx.id}`, 'POST', { accion: 'reportar_cierre', precio: '58000', fecha: hoy })
  ok(r.status === 200, `el asesor reporta la renta: $58,000 al mes, firmada hoy (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  const { data: cr } = await admin.from('cierres_reportados').select('precio_cierre, operacion, conexion_id').eq('conexion_id', cx.id).maybeSingle()
  ok(cr?.operacion === 'renta' && Number(cr?.precio_cierre) === 58_000, `queda en cierres_reportados como renta (para su nivel): ${JSON.stringify(cr)}`)
  const { data: a2 } = await admin.from('activos').select('status').eq('id', act.id).single()
  ok(a2.status === 'cerrado', `la propiedad (solo en renta) queda cerrada (${a2.status})`)

  // ── 6. En pantalla: el cliente confirma y califica ──────────────────────────────────────────
  b = await puppeteer.launch({ headless: true, defaultViewport: { width: 1280, height: 900 } })
  const page = await b.newPage()
  const texto = () => page.evaluate(() => document.body.innerText)
  await page.goto(BASE + '/entrar?mundo=demo', { waitUntil: 'networkidle2' })
  await page.click('[data-entrada-si]')
  await page.waitForSelector('[data-campo="usuario-o-telefono"]'); await page.type('[data-campo="usuario-o-telefono"]', usuarioCliente); await page.keyboard.press('Enter')
  await page.waitForFunction(() => location.pathname === '/inicio', { timeout: 30000 })
  await page.goto(`${BASE}/conexion/${cx.id}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => /Confirmo que ya rento/.test(document.body.innerText), { timeout: 30000 })
  ok(/Renta reportada/.test(await texto()), 'su pantalla: "Renta reportada" con la renta y la fecha, y el botón "Confirmo que ya rento"')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Confirmo que ya rento/.test(x.innerText))?.click())
  await page.waitForFunction(() => /Califica al asesor/.test(document.body.innerText), { timeout: 30000 })
  const { data: c2 } = await admin.from('conexiones').select('estado, cierre_confirmado_at').eq('id', cx.id).single()
  ok(c2.estado === 'cerrada' && !!c2.cierre_confirmado_at, `confirma: cierre verificado por los dos (${c2.estado})`)
  ok(/Confirmado por quien renta/.test(await texto()), 'su pantalla dice "Confirmado por quien renta ✓" y le pide calificar al asesor')
  // Cinco estrellas en cada concepto (cada fila tiene 5 botones "N de 5").
  await page.evaluate(() => { const est = [...document.querySelectorAll('button[aria-label="5 de 5"]')]; est.forEach((x) => x.click()) })
  await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Enviar calificación/.test(x.innerText))?.click())
  await page.waitForFunction(() => /Calificación: atención/.test(document.body.innerText), { timeout: 30000 }).catch(() => null)
  const { data: cal } = await admin.from('calificaciones').select('atencion, rapidez, honestidad, broker_id').eq('conexion_id', cx.id).maybeSingle()
  ok(cal?.broker_id === ua.user.id && cal.atencion === 5 && cal.rapidez === 5 && cal.honestidad === 5, `califica al asesor: ${cal ? `${cal.atencion}/${cal.rapidez}/${cal.honestidad}` : 'sin calificación'}`)
  ok(/Calificación: atención 5\/5/.test(await texto()), 'su pantalla muestra la calificación enviada')
  r = await api(tkCliente, `/api/conexiones/${cx.id}`, 'POST', { accion: 'calificar', atencion: 1, rapidez: 1, honestidad: 1 })
  ok(r.status === 409, `no se puede calificar dos veces (${r.status})`)
} catch (e) {
  console.error('ERROR', e.message); fallas++
} finally {
  await b?.close().catch(() => {})
  await limpiar()
  console.log(`\nResultado: ${total - fallas}/${total} OK`)
  process.exitCode = fallas ? 1 : 0
}
