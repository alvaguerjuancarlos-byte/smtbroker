// Verifica contra la base REAL el recorrido guiado del Documento Maestro V7.2 (registro inmediato
// para clientes; migración 20261101000200_registro_cliente.sql; app/api/registro-cliente y el
// filtro "por tu cuenta solo ves el Radar" de app/api/matches). No llama al Agente de Mercado.
// Crea todo y lo borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-registro-cliente.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }
const correo = (q) => `reg-${q}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
const IP = `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`

const registrar = (body, ip = IP) => fetch(`${BASE}/api/registro-cliente`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
const api = (u, ruta, body, method = 'POST') => fetch(`${BASE}${ruta}`, {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token }, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
async function entrar(email, password) {
  const cli = anon()
  const { data, error } = await cli.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  creados.push(data.user.id)
  return { id: data.user.id, cli, token: data.session.access_token, email }
}
async function cuenta(rol, nombre, extra = {}) {
  const email = correo(rol)
  const { data } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${nombre} ${sufijo}`, rol, ...extra })
  return entrar(email, PASS)
}

const SP = 'San Pedro Garza García'
const vendedor = (email) => ({
  quiere: 'vender', nombre: `Vendedor ${sufijo}`, email, password: PASS, telefono: '81 1111 2222',
  propiedad: { tipo: 'Casa', superficie: '320', municipio: SP, colonia: 'Del Valle', precio: '9,500,000' },
})
const comprador = (email) => ({
  quiere: 'comprar', nombre: `Compradora ${sufijo}`, email, password: PASS, telefono: '81 3333 4444',
  busqueda: { busca: 'Casa', zona: SP, presupuesto: '$5M – $15M' },
})

async function main() {
  const { error: eTabla } = await admin.from('contactos_cliente').select('usuario_id').limit(1)
  if (eTabla) throw new Error(`falta la migración 20261101000200 (${eTabla.message})`)

  // ── Validaciones ─────────────────────────────────────────────────────────────────────────
  check('sin elegir vender o comprar → 400', (await registrar({ ...vendedor(correo('x')), quiere: 'rentar' })).status === 400)
  check('contraseña corta → 400', (await registrar({ ...vendedor(correo('x')), password: '123' })).status === 400)
  check('WhatsApp incompleto → 400', (await registrar({ ...vendedor(correo('x')), telefono: '123' })).status === 400)
  check('vender sin precio → 400', (await registrar({ ...vendedor(correo('x')), propiedad: { tipo: 'Casa', municipio: SP } })).status === 400)
  const trampaEmail = correo('trampa')
  const tr = await registrar({ ...vendedor(trampaEmail), sitio_web: 'http://spam' })
  const { data: lista0 } = await admin.auth.admin.listUsers({ perPage: 1000 })
  check('campo trampa: responde OK y no crea cuenta', tr.status === 200 && !lista0.users.some((u) => u.email === trampaEmail))

  // ── Vender ───────────────────────────────────────────────────────────────────────────────
  const emailV = correo('vende')
  const rv = await registrar(vendedor(emailV))
  check('registro inmediato de quien vende', rv.status === 200 && !!rv.json.activoId, JSON.stringify(rv.json))
  const V = await entrar(emailV, PASS)
  check('…y entra con su contraseña de inmediato', !!V.token)
  const { data: uV } = await admin.from('usuarios').select('rol, es_demo').eq('id', V.id).single()
  check('queda como propietario en el mundo real', uV.rol === 'propietario' && uV.es_demo === false)
  const { data: aV } = await admin.from('activos').select('nombre, tipo, municipio, colonia, precio_total, broker_id, cargado_por, usuario_id').eq('id', rv.json.activoId).single()
  check('su propiedad queda cargada, sin broker', aV.usuario_id === V.id && aV.precio_total === 9500000 && aV.broker_id === null && aV.nombre === 'Casa en Del Valle', JSON.stringify(aV))
  const { data: cV } = await V.cli.from('contactos_cliente').select('telefono').eq('usuario_id', V.id)
  check('su WhatsApp queda guardado y lo puede leer él', cV?.[0]?.telefono === '81 1111 2222')
  check('el mismo correo otra vez → 409 "inicia sesión"', (await registrar(vendedor(emailV))).json.yaExiste === true)

  // ── Comprar ──────────────────────────────────────────────────────────────────────────────
  const emailC = correo('compra')
  const rc = await registrar(comprador(emailC))
  check('registro inmediato de quien compra', rc.status === 200, JSON.stringify(rc.json))
  const C = await entrar(emailC, PASS)
  const { data: pC } = await admin.from('perfiles_intencion').select('id, zona, presupuesto, representado_por').eq('usuario_id', C.id).single()
  check('lo que busca queda registrado, sin broker', pC?.zona === SP && pC.presupuesto === '$5M – $15M' && !pC.representado_por)
  // Panel /inicio (migración 20261101000300): el comprador afina su búsqueda; nadie más la toca.
  const det = { recamaras: '3', banos: '2', m2Min: '120', zonas: 'Valle Oriente', imprescindibles: ['Terraza'] }
  const { error: eDet } = await C.cli.from('perfiles_intencion').update({ detalles: det, tipo_activo_interes: 'Casa' }).eq('id', pC.id)
  const { data: pDet } = await admin.from('perfiles_intencion').select('detalles').eq('id', pC.id).single()
  check('el comprador guarda los detalles de su búsqueda', !eDet && pDet?.detalles?.recamaras === '3' && pDet.detalles.imprescindibles?.[0] === 'Terraza', eDet?.message)
  await V.cli.from('perfiles_intencion').update({ detalles: { hackeado: true } }).eq('id', pC.id)
  const { data: pDet2 } = await admin.from('perfiles_intencion').select('detalles').eq('id', pC.id).single()
  check('otro cliente no puede cambiarlos (RLS)', !pDet2?.detalles?.hackeado)
  const { data: cX } = await C.cli.from('contactos_cliente').select('telefono').eq('usuario_id', V.id)
  check('un cliente no lee el WhatsApp de otro (RLS)', (cX || []).length === 0)

  // ── Por tu cuenta solo ves el Radar ──────────────────────────────────────────────────────
  const B = await cuenta('broker', 'Broker', { pionero: true })
  const OP = await cuenta('broker_maestro', 'Operacion')
  const { data: casaB } = await admin.from('activos').insert({
    usuario_id: B.id, broker_id: B.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba', representacion_tipo: 'exclusiva',
    representacion_declarada_at: new Date().toISOString(), nombre: `Casa del broker ${sufijo}`, tipo: 'Casa', municipio: SP,
    estado: 'Nuevo León', status: 'valoracion', precio_total: 9_000_000,
  }).select('id').single()
  const mC = await api(C, '/api/matches', null, 'GET')
  const ids = (mC.json.coincidencias || []).map((x) => x.activoId)
  check('el comprador por su cuenta ve la casa del particular', ids.includes(rv.json.activoId))
  check('…y NO la del broker', !ids.includes(casaB.id))
  const sB = await api(C, '/api/matches', { activoId: casaB.id, perfilId: pC.id })
  check('no puede pedir conexión con la casa del broker', sB.status === 403 && sB.json.necesitaBroker === true, JSON.stringify(sB.json))
  const mB = await api(B, '/api/matches', null, 'GET')
  check('el broker no ve al comprador por su cuenta en su portafolio', !(mB.json.paraMiPortafolio || []).some((x) => x.perfilId === pC.id))

  // ── Conexión entre particulares: contacto con WhatsApp ───────────────────────────────────
  check('pide la conexión con la casa del particular', (await api(C, '/api/matches', { activoId: rv.json.activoId, perfilId: pC.id })).status === 200)
  const { data: m } = await admin.from('matches').select('id').eq('activo_id', rv.json.activoId).eq('perfil_id', pC.id).single()
  check('Operación los pone en contacto', (await api(OP, `/api/matches/${m.id}`, { estado: 'en_contacto' })).status === 200)
  const cC = ((await api(C, '/api/matches', null, 'GET')).json.coincidencias || []).find((x) => x.activoId === rv.json.activoId)
  check('el comprador recibe correo y WhatsApp del vendedor', cC?.contacto?.correo === emailV && cC.contacto.telefono === '81 1111 2222', JSON.stringify(cC?.contacto))
  const cP = ((await api(V, '/api/matches', null, 'GET')).json.conexiones || []).find((x) => x.perfilId === pC.id)
  check('el vendedor recibe correo y WhatsApp del comprador', cP?.contacto?.correo === emailC && cP.contacto.telefono === '81 3333 4444', JSON.stringify(cP?.contacto))

  // ── Límite por IP ────────────────────────────────────────────────────────────────────────
  const ipLimite = `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
  for (let i = 0; i < 5; i++) {
    const e = correo(`lim${i}`)
    const r = await registrar(comprador(e), ipLimite)
    if (r.status === 200) creados.push((await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === e)?.id)
  }
  check('límite: el 6.º registro desde la misma IP en una hora → 429', (await registrar(comprador(correo('lim6')), ipLimite)).status === 429)
}

async function limpiar() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((x) => x.email?.endsWith(`${sufijo}@prueba.smtbroker.mx`))) if (!creados.includes(u.id)) creados.push(u.id)
  for (const id of creados.filter(Boolean)) {
    await admin.from('matches').delete().eq('solicitado_por', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('activos').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id) // contactos_cliente en cascada
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`\nLimpieza: ${creados.filter(Boolean).length} cuentas temporales borradas.`)
}

main()
  .catch((e) => { fallas++; console.error('ERROR', e.message) })
  .finally(async () => {
    await limpiar()
    console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
    process.exit(fallas ? 1 : 0)
  })
