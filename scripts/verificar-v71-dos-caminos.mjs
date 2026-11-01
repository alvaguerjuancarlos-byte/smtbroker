// Verifica contra la base REAL el Documento Maestro V7.1 (2026-10-31): dos caminos, por tu cuenta o
// con broker (migración 20261101000000_v71_conexion_directa.sql, app/api/matches,
// app/api/matches/[id], lib/contactoConexion.ts). Reemplaza la parte "broker para conectar" de
// verificar-v7-broker-conectar.mjs.
//
// Escenarios (mundo real, San Pedro):
//   A. Los dos por su cuenta: comprador C y propietario P sin broker.
//   B. Mixto: C por su cuenta y una casa representada por el broker B2.
//   C. Con broker los dos: comprador C2 representado por B1 y la casa de B2.
// En cada uno, Operación pone en contacto y cada lado ve SOLO el contacto de quien atiende el otro
// lado (su broker o el cliente por su cuenta), nunca el de un cliente que tiene broker.
// Crea todo y lo borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-v71-dos-caminos.mjs

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

async function cuenta(rol, nombre, extra = {}) {
  const email = `v71-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${nombre} ${sufijo}`, rol, ...extra })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, email, cli, token: s.session.access_token }
}

const SP = 'San Pedro Garza García'
const api = (u, ruta, body, method = 'POST') => fetch(`${BASE}${ruta}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

const perfil = async (u, extra = {}) => {
  await admin.from('perfiles_intencion').insert({
    usuario_id: u.id, presupuesto: '$5M – $15M', zona: SP, tipo_activo_interes: 'Casa', fuente_captura: 'registro_directo', ...extra,
  })
  return (await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id).single()).data.id
}
const casa = async (dueno, broker, n) => {
  const fila = broker
    ? { usuario_id: broker.id, broker_id: broker.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
        representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString() }
    : { usuario_id: dueno.id }
  const { data, error } = await admin.from('activos').insert({
    ...fila, nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio: SP, estado: 'Nuevo León', status: 'valoracion',
    precio_total: 9_500_000, superficie: 320,
  }).select('id').single()
  if (error) throw new Error(`casa ${n}: ${error.message}`)
  return data.id
}
const matchId = async (activoId, perfilId) =>
  (await admin.from('matches').select('id').eq('activo_id', activoId).eq('perfil_id', perfilId).single()).data.id
const buscar = (xs, activoId, perfilId) => (xs || []).find((x) => x.activoId === activoId && x.perfilId === perfilId)

async function main() {
  const C = await cuenta('inversionista', 'Compradora')
  const C2 = await cuenta('inversionista', 'Comprador Dos')
  const P = await cuenta('propietario', 'Propietario')
  const B1 = await cuenta('broker', 'Broker Uno', { pionero: true })
  const B2 = await cuenta('broker', 'Broker Dos', { pionero: true })
  const OP = await cuenta('broker_maestro', 'Operacion')

  const perfilC = await perfil(C)
  const perfilC2 = await perfil(C2, { representado_por: B1.id }) // service_role: como si B1 hubiera aceptado
  const casaP = await casa(P, null, 'Casa del propietario')
  const casaB2 = await casa(null, B2, 'Casa de B2')

  // ── A. Los dos por su cuenta ────────────────────────────────────────────────────────────
  const m0 = await api(C, '/api/matches', null, 'GET')
  check('A. el comprador sin broker ve la casa del propietario sin broker', !!buscar(m0.json.coincidencias, casaP, perfilC) && m0.json.tieneBroker === false)
  const s0 = await api(C, '/api/matches', { activoId: casaP, perfilId: perfilC })
  check('A. sin broker, el comprador pide la conexión (ya no hay 409)', s0.status === 200 && s0.json.estado === 'solicitado', JSON.stringify(s0.json))
  const p0 = await api(P, '/api/matches', null, 'GET')
  const conP0 = buscar(p0.json.conexiones, casaP, perfilC)
  check('A. el propietario por su cuenta ve la solicitud, aún sin contacto', p0.status === 200 && conP0?.solicitud === 'solicitado' && !conP0.contacto, JSON.stringify(p0.json).slice(0, 200))
  check('A. el comprador aún no ve contacto', !buscar((await api(C, '/api/matches', null, 'GET')).json.coincidencias, casaP, perfilC).contacto)

  const idA = await matchId(casaP, perfilC)
  check('A. un comprador no puede validar conexiones', (await api(C, `/api/matches/${idA}`, { estado: 'en_contacto' })).status === 403)
  const vA = await api(OP, `/api/matches/${idA}`, { estado: 'en_contacto' })
  check('A. Operación los pone en contacto sin broker de ningún lado', vA.status === 200, JSON.stringify(vA.json))
  check('A. no se puede poner en contacto dos veces', (await api(OP, `/api/matches/${idA}`, { estado: 'en_contacto' })).status === 409)
  const cA = buscar((await api(C, '/api/matches', null, 'GET')).json.coincidencias, casaP, perfilC)
  check('A. el comprador recibe el contacto del propietario', cA?.contacto?.correo === P.email && cA.contacto.esBroker === false, JSON.stringify(cA?.contacto))
  const pA = buscar((await api(P, '/api/matches', null, 'GET')).json.conexiones, casaP, perfilC)
  check('A. el propietario recibe el contacto del comprador', pA?.contacto?.correo === C.email && pA.contraparte === 'Comprador por su cuenta', JSON.stringify(pA))

  await admin.from('leads').insert({
    activo_id: casaP, nombre: 'Interesado prueba', contacto: 'interesado@ejemplo.com', plazo: 'menos_3m',
    forma_pago: 'contado', categoria: 'serio', razones: ['prueba'], consentimiento_at: new Date().toISOString(),
  })
  const { data: leadsP } = await P.cli.from('leads').select('contacto').eq('activo_id', casaP)
  check('A. el dueño sin broker vuelve a leer el contacto de sus interesados (RLS)', leadsP?.[0]?.contacto === 'interesado@ejemplo.com')
  const { data: leadsX } = await C.cli.from('leads').select('id').eq('activo_id', casaP)
  check('A. otro usuario no los lee', (leadsX || []).length === 0)

  // ── B. Comprador por su cuenta y casa con broker ────────────────────────────────────────
  await api(C, '/api/matches', { activoId: casaB2, perfilId: perfilC })
  const vB = await api(OP, `/api/matches/${await matchId(casaB2, perfilC)}`, { estado: 'en_contacto' })
  check('B. Operación conecta al comprador por su cuenta con la casa de B2', vB.status === 200, JSON.stringify(vB.json))
  const cB = buscar((await api(C, '/api/matches', null, 'GET')).json.coincidencias, casaB2, perfilC)
  check('B. el comprador recibe el contacto del broker B2', cB?.contacto?.correo === B2.email && cB.contacto.esBroker === true, JSON.stringify(cB?.contacto))
  const bB = buscar((await api(B2, '/api/matches', null, 'GET')).json.paraMiPortafolio, casaB2, perfilC)
  check('B. B2 recibe el contacto del comprador, que sigue siendo "por su cuenta"', bB?.contacto?.correo === C.email && bB.contraparte === 'Comprador por su cuenta', JSON.stringify(bB))

  // ── C. Con broker los dos ────────────────────────────────────────────────────────────────
  const sC = await api(B1, '/api/matches', { activoId: casaB2, perfilId: perfilC2 })
  check('C. B1 pide la conexión para su cliente', sC.status === 200, JSON.stringify(sC.json))
  await api(OP, `/api/matches/${await matchId(casaB2, perfilC2)}`, { estado: 'en_contacto' })
  const b1C = buscar((await api(B1, '/api/matches', null, 'GET')).json.paraMisClientes, casaB2, perfilC2)
  check('C. B1 recibe el contacto de B2', b1C?.contacto?.correo === B2.email, JSON.stringify(b1C?.contacto))
  const b2C = buscar((await api(B2, '/api/matches', null, 'GET')).json.paraMiPortafolio, casaB2, perfilC2)
  check('C. B2 recibe el contacto de B1, NO el del comprador', b2C?.contacto?.correo === B1.email && b2C.contacto.esBroker, JSON.stringify(b2C?.contacto))
  const c2C = buscar((await api(C2, '/api/matches', null, 'GET')).json.coincidencias, casaB2, perfilC2)
  check('C. el comprador con broker no recibe el contacto directo (lo tiene su broker)', c2C?.solicitud === 'en_contacto' && !c2C.contacto, JSON.stringify(c2C))

  // ── Propietario con broker: no ve conexiones directas ───────────────────────────────────
  check('una cuenta sin propiedades por su cuenta no recibe conexiones', ((await api(P, '/api/matches', null, 'GET')).json.conexiones || []).every((x) => x.activoId === casaP))
}

async function limpiar() {
  for (const id of creados) {
    await admin.from('matches').delete().eq('solicitado_por', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('activos').delete().eq('usuario_id', id) // oportunidades, leads y matches caen en cascada
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`\nLimpieza: ${creados.length} cuentas temporales borradas.`)
}

main()
  .catch((e) => { fallas++; console.error('ERROR', e.message) })
  .finally(async () => {
    await limpiar()
    console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
    process.exit(fallas ? 1 : 0)
  })
