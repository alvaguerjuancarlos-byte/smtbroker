// Prueba de punta a punta de la V10 (Documento Maestro V10, §24, §25 y §27): los dos caminos
// ("por mi cuenta" y "con un asesor") en COMPRA y en RENTA, con las propuestas de asesores
// encendidas y apagadas, la conexión simple y el tablero del dueño. Contra la base real, en el
// MUNDO DEMO, con cuentas y propiedades temporales que se borran al final.
// Uso: node --env-file=.env.local scripts/verificar-v10-punta-a-punta.mjs <carpeta-para-capturas>
//      (con la app corriendo; BASE_URL por defecto http://localhost:3011: en modo dev, Next solo hidrata desde localhost)
//
// Reparto: un dueño particular (depa en venta y depa en renta en Valle Oriente), la asesora A
// (cartera: depa en venta y depa en renta) y el asesor B (depa en venta para proponer), Operación,
// y cuatro clientes: C1 compra por su cuenta (propuestas ON), C2 renta por su cuenta (propuestas
// OFF), C3 compra con asesor (A) y C4 renta con asesor (A).
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://localhost:3011'
const out = process.argv[2] || '.'
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY)
const REF = new URL(URL_SB).hostname.split('.')[0]
const ts = Date.now()
const PASS = 'PruebaV10-' + ts
const limpiar = { usuarios: [], activos: [] }
let fallas = 0, total = 0
const ok = (c, m) => { total++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) { fallas++; process.exitCode = 1 } }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function sesion(email) {
  const cli = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (error) throw error
  return data.session
}
const api = async (tk, ruta, metodo = 'GET', cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
async function cuenta(clave, nombre, rol, extra = {}) {
  const email = `v10-${clave}-${ts}@demo.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw error
  limpiar.usuarios.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre, rol, es_demo: true, ...extra })
  const s = await sesion(email)
  return { id: data.user.id, email, tk: s.access_token, sesion: s }
}
async function propiedad(campos) {
  const { data, error } = await admin.from('activos').insert({
    estado: 'Nuevo León', status: 'ingresado', tipo: 'Departamento', municipio: 'San Pedro Garza García', colonia: 'Valle Oriente', es_demo: true, ...campos,
  }).select('id').single()
  if (error) throw error
  limpiar.activos.push(data.id)
  return data.id
}
const zonaVO = [{ estado: 'Nuevo León', municipio: 'San Pedro Garza García', nombre: 'Valle Oriente', colonias: [] }]
const fichaCompra = (camino, propuestas) => ({ operacion: 'compra', tipo: 'departamento', caracteristicas: { recamaras: 2 }, zonas: zonaVO, presupuesto_min: 5_000_000, presupuesto_max: 6_500_000, forma_pago: 'credito', plazo: 'ya', proposito: 'vivir', busqueda_directa: true, publicada_brokers: propuestas, camino })
const fichaRenta = (camino, propuestas) => ({ operacion: 'renta', tipo: 'departamento', caracteristicas: {}, zonas: zonaVO, presupuesto_min: 25_000, presupuesto_max: 35_000, renta: { plazo_contrato: '1_anio', garantia: 'poliza', fecha_entrada: 'ya', amueblada: 'indistinto', mascotas: null }, plazo: 'ya', proposito: 'vivir', busqueda_directa: true, publicada_brokers: propuestas, camino })
const conRenta = { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '1_anio', garantia: 'cualquiera', amueblada: true, mascotas: true }

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/bienvenida')).ok) break } catch {} await espera(2000) }

  // ── Reparto ──────────────────────────────────────────────────────────────
  const dueno = await cuenta('dueno', 'Dueño V10 Prueba', 'propietario')
  const A = await cuenta('asesora-a', 'Asesora A V10', 'broker', { pionero: true })
  const B = await cuenta('asesor-b', 'Asesor B V10', 'broker', { pionero: true })
  const op = await cuenta('operacion', 'Operación V10', 'broker_maestro')
  const C1 = await cuenta('c1', 'Cliente Compra Solo', 'inversionista')
  const C2 = await cuenta('c2', 'Cliente Renta Solo', 'inversionista')
  const C3 = await cuenta('c3', 'Cliente Compra Asesor', 'inversionista')
  const C4 = await cuenta('c4', 'Cliente Renta Asesor', 'inversionista')
  await admin.from('contactos_cliente').upsert([{ usuario_id: dueno.id, telefono: '8111111111' }, { usuario_id: C1.id, telefono: '8122222222' }])

  const deDueno = { usuario_id: dueno.id, cargado_por: 'propietario' }
  const deBroker = (x) => ({ usuario_id: x.id, broker_id: x.id, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba' })
  const duenoVenta = await propiedad({ ...deDueno, nombre: 'V10 Depa del Dueño (venta)', superficie: 120, operacion: 'venta', precio_total: 6_000_000 })
  const duenoRenta = await propiedad({ ...deDueno, nombre: 'V10 Depa del Dueño (renta)', superficie: 100, operacion: 'renta', renta_mensual: 30_000, renta: conRenta })
  const aVenta = await propiedad({ ...deBroker(A), nombre: 'V10 Depa de la Asesora A (venta)', superficie: 115, operacion: 'venta', precio_total: 6_200_000 })
  const aRenta = await propiedad({ ...deBroker(A), nombre: 'V10 Depa de la Asesora A (renta)', superficie: 95, operacion: 'renta', renta_mensual: 32_000, renta: conRenta })
  const bVenta = await propiedad({ ...deBroker(B), nombre: 'V10 Depa del Asesor B (venta)', superficie: 110, operacion: 'venta', precio_total: 5_900_000 })
  const bRenta = await propiedad({ ...deBroker(B), nombre: 'V10 Depa del Asesor B (renta)', superficie: 90, operacion: 'renta', renta_mensual: 31_000, renta: conRenta })

  // ── 1. Las cuatro búsquedas (§24.1) ──────────────────────────────────────
  console.log('\n1. Las búsquedas')
  const nueva = async (c, ficha) => { const r = await api(c.tk, '/api/necesidades', 'POST', ficha); if (r.status !== 200) throw new Error('necesidad: ' + JSON.stringify(r.j)); return r.j.id }
  const n1 = await nueva(C1, fichaCompra('por_mi_cuenta', true))
  const n2 = await nueva(C2, fichaRenta('por_mi_cuenta', false))
  const n3 = await nueva(C3, fichaCompra('con_asesor', true))
  const n4 = await nueva(C4, fichaRenta('con_asesor', true))
  const { data: guardadas } = await admin.from('necesidades').select('id, camino, publicada_brokers, operacion').in('id', [n1, n2, n3, n4])
  const g = Object.fromEntries((guardadas ?? []).map((x) => [x.id, x]))
  ok(g[n1]?.camino === 'por_mi_cuenta' && g[n1]?.publicada_brokers && g[n1]?.operacion === 'compra', 'C1: compra, por su cuenta, propuestas encendidas')
  ok(g[n2]?.camino === 'por_mi_cuenta' && !g[n2]?.publicada_brokers && g[n2]?.operacion === 'renta', 'C2: renta, por su cuenta, propuestas apagadas')
  ok(g[n3]?.camino === 'con_asesor' && g[n4]?.camino === 'con_asesor', 'C3 y C4: con asesor')

  // Con asesor: eligen a la asesora A y ella acepta (§24.1 punto 4; oportunidades, §15).
  for (const c of [C3, C4]) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', c.id).single()
    const r = await api(c.tk, '/api/oportunidades', 'POST', { perfilId: pf.id, brokerId: A.id })
    const { data: opo } = await admin.from('oportunidades').select('id').eq('perfil_id', pf.id).eq('broker_id', A.id).maybeSingle()
    const ra = opo ? await api(A.tk, `/api/oportunidades/${opo.id}`, 'POST', { accion: 'aceptar' }) : { status: 0 }
    ok(r.status === 200 && ra.status === 200, `${c === C3 ? 'C3' : 'C4'} elige a la asesora A y ella acepta (${r.status}/${ra.status}${r.j.error ? ' ' + r.j.error : ''})`)
  }

  // ── 2. Panel de asesores: anónimo y respeta el interruptor (§24.4) ────────
  console.log('\n2. Panel de necesidades de los asesores')
  let pb = await api(B.tk, '/api/necesidades')
  const idsPanel = () => (pb.j.necesidades ?? []).map((n) => n.id)
  ok(idsPanel().includes(n1), 'el asesor B ve la búsqueda de C1 (propuestas encendidas)')
  ok(!idsPanel().includes(n2), 'el asesor B NO ve la de C2 (propuestas apagadas)')
  const crudo = JSON.stringify(pb.j)
  ok(!crudo.includes(C1.id) && !crudo.includes('Cliente Compra Solo') && !crudo.includes(C1.email), 'el panel es anónimo: sin id, nombre ni correo del cliente')
  let rp = await api(B.tk, '/api/propuestas', 'POST', { necesidadId: n2, activoId: bRenta, aceptoTerminos: true })
  ok(rp.status === 404, `proponer a la búsqueda apagada se rechaza (${rp.status} ${rp.j.error ?? ''})`)
  // C2 enciende el interruptor: aparece; lo apaga: se retira.
  await api(C2.tk, `/api/necesidades/${n2}`, 'PATCH', { publicada_brokers: true })
  pb = await api(B.tk, '/api/necesidades'); ok(idsPanel().includes(n2), 'C2 enciende "Recibir propuestas" y su búsqueda aparece en el panel')
  rp = await api(B.tk, '/api/propuestas', 'POST', { necesidadId: n2, activoId: bRenta, aceptoTerminos: true })
  ok(rp.status === 200, `con el interruptor encendido, B le propone su depa en renta (${rp.status})`)
  await api(C2.tk, `/api/necesidades/${n2}`, 'PATCH', { publicada_brokers: false })
  pb = await api(B.tk, '/api/necesidades'); ok(!idsPanel().includes(n2), 'C2 lo apaga y su búsqueda se retira del panel')
  rp = await api(C2.tk, `/api/necesidades/${n2}`, 'PATCH', { busqueda_directa: false })
  ok(rp.status === 400, 'no se pueden apagar las dos formas de buscar a la vez')

  // Propuestas a C1 (de B) y a C3 (de A, su asesora, y de B).
  rp = await api(B.tk, '/api/propuestas', 'POST', { necesidadId: n1, activoId: bVenta, aceptoTerminos: true }); ok(rp.status === 200, 'B propone su depa a C1')
  rp = await api(B.tk, '/api/propuestas', 'POST', { necesidadId: n3, activoId: bVenta, aceptoTerminos: true }); ok(rp.status === 200, 'B propone su depa a C3')
  rp = await api(A.tk, '/api/propuestas', 'POST', { necesidadId: n3, activoId: aVenta, aceptoTerminos: true }); ok(rp.status === 200, 'A propone su depa a C3, su cliente')
  rp = await api(A.tk, '/api/propuestas', 'POST', { necesidadId: n1, activoId: aRenta, aceptoTerminos: true })
  ok(rp.status === 422, `una propuesta que no cumple la ficha se rechaza (${rp.j.error ?? rp.status})`)

  // ── 3. Tablero de tres bandas (§24.2, §24.3) ─────────────────────────────
  console.log('\n3. Lo que ve cada cliente en su tablero')
  const bandeja = async (c) => (await api(c.tk, '/api/necesidades')).j
  const de = (t, id) => (t.bandeja ?? []).filter((o) => o.activoId === id)
  let t = await bandeja(C1)
  ok(!t.conBroker, 'C1 va por su cuenta')
  ok(de(t, duenoVenta).some((o) => o.origen === 'particular'), 'C1, banda 1: ve el depa del dueño particular')
  ok(de(t, aVenta).length === 0, 'C1, banda 1: NO ve la cartera de la asesora A (por su cuenta, solo particulares)')
  ok(de(t, bVenta).some((o) => o.origen === 'broker' && o.broker && !o.broker.deTuAsesor), 'C1, banda 2: ve la propuesta del asesor B')
  ok(de(t, duenoRenta).length === 0, 'C1 (compra) no ve propiedades solo en renta')

  t = await bandeja(C2)
  ok(de(t, duenoRenta).some((o) => o.origen === 'particular'), 'C2, banda 1: ve el depa en renta del dueño')
  ok(de(t, aRenta).length === 0, 'C2: no ve la renta de la cartera de A')
  ok(de(t, bRenta).some((o) => o.origen === 'broker'), 'C2: la propuesta que recibió con el interruptor encendido se queda en su tablero (§24.4)')
  ok(de(t, duenoVenta).length === 0, 'C2 (renta) no ve propiedades solo en venta')

  t = await bandeja(C3)
  ok(t.conBroker === true, 'C3 va con asesor')
  ok(de(t, duenoVenta).length > 0, 'C3, banda 1: ve al dueño particular')
  ok(de(t, aVenta).some((o) => o.origen === 'broker' && o.broker?.deTuAsesor), 'C3, banda 2: la propuesta de su asesora llega marcada como "de tu asesor"')
  ok(de(t, bVenta).some((o) => o.origen === 'broker' && !o.broker?.deTuAsesor), 'C3, banda 2: la de otro asesor llega sin esa marca')

  t = await bandeja(C4)
  ok(t.conBroker === true && de(t, aRenta).length > 0 && de(t, bRenta).length > 0, 'C4 (renta con asesor), banda 1: toda la red, incluidas las carteras de A y B')
  ok(de(t, duenoRenta).length > 0, 'C4: también ve al dueño particular')

  // ── 4. Conexión simple (§25) ─────────────────────────────────────────────
  console.log('\n4. Conectar')
  let r = await api(C1.tk, '/api/conexiones', 'POST', { activoId: duenoVenta })
  ok(r.status === 409, 'sin "Me interesa" antes, no deja conectar')
  r = await api(C1.tk, '/api/analisis', 'POST', { activoId: duenoVenta, necesidadId: n1 })
  ok(r.status === 200, `"Me interesa": se genera su análisis (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  r = await api(C1.tk, '/api/conexiones', 'POST', { activoId: duenoVenta })
  const { data: cx } = await admin.from('conexiones').select('id, estado').eq('comprador_id', C1.id).eq('activo_id', duenoVenta).maybeSingle()
  ok(r.status === 200 && cx?.estado === 'por_validar', `"Conectar" con un particular queda por validar (${cx?.estado})`)
  let d = await api(C1.tk, `/api/conexiones/${cx.id}`)
  ok(!d.j.telefonos, 'antes de validar, nadie ve teléfonos')
  r = await api(dueno.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'validar' })
  ok(r.status === 403 || r.status === 400, `el dueño no puede validar (${r.status})`)
  r = await api(op.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'validar' })
  ok(r.status === 200, 'Operación valida la conexión')
  d = await api(C1.tk, `/api/conexiones/${cx.id}`)
  ok(d.j.telefonos?.contraparte === '8111111111', `al validarse, C1 ve el teléfono del dueño (${d.j.telefonos?.contraparte})`)
  const dd = await api(dueno.tk, `/api/conexiones/${cx.id}`)
  ok(dd.j.telefonos?.comprador === '8122222222', `y el dueño ve el de C1 (${dd.j.telefonos?.comprador})`)
  r = await api(C1.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'oferta', monto: 5_800_000 })
  ok(r.status === 410, `las acciones retiradas (oferta) responden 410 (${r.status})`)
  r = await api(dueno.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'estado', estado: 'visitada' })
  ok(r.status === 403, 'el estado solo lo marca quien busca')
  for (const e of ['visitada', 'negociando']) {
    r = await api(C1.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'estado', estado: e })
    const { data: f } = await admin.from('conexiones').select('estado_cliente').eq('id', cx.id).single()
    ok(r.status === 200 && f.estado_cliente === e, `C1 marca "${e}"`)
  }

  // ── 5. Tablero del dueño (§27) ───────────────────────────────────────────
  console.log('\n5. Tablero del dueño')
  let td = await api(dueno.tk, '/api/tablero-dueno', 'POST', { activoId: duenoVenta })
  ok(td.status === 200 && td.j.demanda?.compra >= 2, `su depa en venta: ${td.j.demanda?.compra} personas buscan algo así (C1 y C3, al menos)`)
  ok(td.j.precioPedido === 6_000_000, 'trae su precio para compararlo contra el mercado')
  ok(td.j.interesados?.conexiones === 1 && td.j.interesados?.activas === 1, `interesados: 1 conexión activa (${JSON.stringify(td.j.interesados)})`)
  td = await api(dueno.tk, '/api/tablero-dueno', 'POST', { activoId: duenoRenta })
  ok(td.status === 200 && td.j.demanda?.renta >= 2 && td.j.demanda?.compra === 0, `su depa en renta: ${td.j.demanda?.renta} personas buscan rentar algo así, 0 comprar`)
  r = await api(C1.tk, '/api/tablero-dueno', 'POST', { activoId: duenoVenta })
  ok(r.status === 404, 'nadie más ve el tablero de su propiedad')

  // ── 6. Cierre verificado (§25.5) ─────────────────────────────────────────
  console.log('\n6. Cierre')
  r = await api(C1.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'estado', estado: 'cerrada' }); ok(r.status === 200, 'C1 marca "Cerré"')
  r = await api(dueno.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'reportar_cierre', precio: '5900000', fecha: new Date().toISOString().slice(0, 10) })
  ok(r.status === 200, `el dueño reporta el cierre (${r.status}${r.j.error ? ' ' + r.j.error : ''})`)
  r = await api(C1.tk, `/api/conexiones/${cx.id}`, 'POST', { accion: 'confirmar_cierre' })
  const { data: fc } = await admin.from('conexiones').select('estado, cierre_confirmado_at').eq('id', cx.id).single()
  ok(r.status === 200 && !!fc.cierre_confirmado_at, `C1 lo confirma: cierre verificado (${fc.estado})`)

  // ── 7. Pantallas ─────────────────────────────────────────────────────────
  console.log('\n7. Pantallas')
  b = await puppeteer.launch({ headless: true })
  const pantalla = async (c, ruta, archivo, esperar) => {
    // Entra por la pantalla de login, como una persona (cada cuenta en su propio contexto).
    const ctx = await b.createBrowserContext()
    const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 900 })
    await p.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 120000 })
    const correo = (await p.$$('input[type="email"]')).at(-1)
    await correo.type(c.email); await p.type('input[type="password"]', PASS)
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}), (await p.$$('button[type="submit"]')).at(-1).click()])
    await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
    await p.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 })
    if (esperar) await p.waitForFunction(esperar, { timeout: 45000 }).catch(() => {})
    await espera(1500)
    await p.screenshot({ path: `${out}/v10-${archivo}.png`, fullPage: true })
    const txt = await p.evaluate(() => document.body.innerText)
    await ctx.close()
    return txt
  }
  const pub = await b.newPage(); await pub.goto(BASE + '/bienvenida', { waitUntil: 'networkidle2' })
  const tPub = await pub.evaluate(() => document.body.innerText); await pub.close()
  ok(/Compra, vende o renta/.test(tPub) && ['Comprar', 'Rentar', 'Vender', 'Poner en renta'].every((x) => tPub.includes(x)), 'página pública: la historia del cliente y las cuatro puertas')
  ok((tPub.match(/¿Eres asesor inmobiliario\?/g) ?? []).length >= 1 && !/broker/i.test(tPub), 'página pública: el asesor solo como entrada discreta; nunca dice "broker"')
  const emp = await b.newPage(); await emp.goto(BASE + '/empezar?quiere=rentar', { waitUntil: 'networkidle2' })
  const tEmp = await emp.evaluate(() => document.body.innerText); await emp.close()
  ok(/Por mi cuenta/i.test(tEmp) && /Con un asesor/i.test(tEmp) && !/recomendad/i.test(tEmp), 'entrada: "Por mi cuenta" y "Con un asesor", sin una recomendada')
  const t1 = await pantalla(C1, '/inicio', 'c1-tablero', () => /Encontradas por SMT Match/i.test(document.body.innerText))
  ok(/Encontradas por SMT Match/i.test(t1) && /Propuestas por asesores/i.test(t1), 'tablero de C1: bandas "Encontradas por SMT Match" y "Propuestas por asesores"')
  ok(!/broker/i.test(t1), 'tablero de C1: nunca dice "broker"')
  const t3 = await pantalla(C3, '/inicio', 'c3-tablero', () => /Propuestas por asesores/i.test(document.body.innerText))
  ok(/tu asesor/i.test(t3), 'tablero de C3: la propuesta de su asesora se ve como de "tu asesor"')
  const tD = await pantalla(dueno, '/inicio', 'dueno-tablero', () => !!document.querySelector('[data-demanda]'))
  ok(/Quién busca algo como lo tuyo/.test(tD) && /Interesados/.test(tD), 'tablero del dueño: demanda e interesados')
  const tC = await pantalla(C1, `/conexion/${cx.id}`, 'c1-conexion', () => /8111111111|Contacto/.test(document.body.innerText))
  ok(/8111111111/.test(tC), 'pantalla de la conexión: C1 ve el teléfono del dueño')
} catch (e) {
  console.log('ERROR', e?.stack ?? e)
  process.exitCode = 1
} finally {
  if (b) await b.close()
  for (const id of limpiar.usuarios) {
    await admin.from('analisis').delete().eq('usuario_id', id)
    await admin.from('conexiones').delete().or(`comprador_id.eq.${id},contraparte_id.eq.${id}`)
  }
  if (limpiar.activos.length) {
    await admin.from('conexiones').delete().in('activo_id', limpiar.activos)
    await admin.from('propuestas').delete().in('activo_id', limpiar.activos)
    await admin.from('activos').delete().in('id', limpiar.activos)
  }
  for (const id of limpiar.usuarios) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', id)
    for (const x of pf ?? []) { await admin.from('radar_opciones').delete().eq('perfil_id', x.id); await admin.from('oportunidades').delete().eq('perfil_id', x.id) }
    await admin.from('oportunidades').delete().eq('broker_id', id)
    await admin.from('necesidades').delete().eq('usuario_id', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('contactos_cliente').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const { count: quedan } = await admin.from('activos').select('id', { count: 'exact', head: true }).like('nombre', 'V10 %')
  console.log(`\nResultado: ${total - fallas}/${total} OK. Limpieza: ${limpiar.usuarios.length} cuentas y ${limpiar.activos.length} propiedades temporales borradas (quedan ${quedan ?? '?'} con "V10 ").`)
}
