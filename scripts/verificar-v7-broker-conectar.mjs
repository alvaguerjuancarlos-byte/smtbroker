// Verifica contra la base REAL el Documento Maestro V7 (2026-10-31): el comprador elige broker
// (V7.1: "broker para conectar" se reemplazó por dos caminos; lo de conectar sin broker se prueba en
// verificar-v71-dos-caminos.mjs). Antes: "libre para empezar, broker para conectar" y un broker por lado (migración 20261031000000_v7_broker_para_conectar.sql,
// app/api/brokers-zona, app/api/oportunidades, app/api/matches, app/api/leads).
//
// Escenario (mundo real): un comprador directo C que busca casa en San Pedro, un propietario P con
// una casa en San Pedro sin broker, dos brokers Plata de San Pedro (B1, B2) y una cuenta de
// Operación. Crea todo y lo borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-v7-broker-conectar.mjs

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
  const email = `v7-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
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
const casaBroker = (b, n, folio) => ({
  usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
  representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
  nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio: SP, estado: 'Nuevo León', status: 'valoracion',
  precio_total: 9_000_000, folio_real: folio, escritura_publica: folio ? 'si' : null,
})

const api = (u, ruta, body, method = 'POST') => fetch(`${BASE}${ruta}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

async function main() {
  const { error } = await admin.from('perfiles_intencion').select('representado_por').limit(1)
  if (error) throw new Error(`falta la migración 20261031000000 (${error.message})`)

  const C = await cuenta('inversionista', 'Compradora')
  const P = await cuenta('propietario', 'Propietario')
  const B1 = await cuenta('broker', 'Broker Uno', { pionero: true }) // Pionero = Plata: visible en el directorio
  const B2 = await cuenta('broker', 'Broker Dos', { pionero: true })
  const OP = await cuenta('broker_maestro', 'Operacion')
  for (const b of [B1, B2]) {
    await admin.from('activos').insert([casaBroker(b, `${b === B1 ? 'B1' : 'B2'} a`, 'FR-1'), casaBroker(b, 'b', null), casaBroker(b, 'c', null)])
  }

  // ── 1. Libre para empezar: el comprador registra lo que busca y ve coincidencias ──────────
  const { error: ePerfil } = await C.cli.from('perfiles_intencion').insert({
    usuario_id: C.id, presupuesto: '$5M – $15M', zona: SP, tipo_activo_interes: 'Casa', fuente_captura: 'registro_directo',
  })
  check('el comprador registra lo que busca', !ePerfil, ePerfil?.message)
  const { data: perf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', C.id).single()
  const perfilId = perf.id

  const { error: eAuto } = await C.cli.from('perfiles_intencion').update({ representado_por: B1.id }).eq('id', perfilId)
  check('el comprador NO se puede asignar broker él mismo (trigger)', !!eAuto, eAuto?.message)

  const { error: eAct } = await P.cli.from('activos').insert({
    usuario_id: P.id, nombre: `Casa del propietario ${sufijo}`, tipo: 'Casa', municipio: SP, estado: 'Nuevo León',
    status: 'valoracion', precio_total: 9_500_000, superficie: 320,
  })
  check('el propietario registra su casa sin broker', !eAct, eAct?.message)
  const { data: act } = await admin.from('activos').select('id').eq('usuario_id', P.id).single()
  const activoId = act.id

  const m0 = await api(C, '/api/matches', null, 'GET')
  const coincide = (m0.json.coincidencias || []).some((c) => c.activoId === activoId)
  check('el comprador ve sus coincidencias sin broker', m0.status === 200 && coincide, JSON.stringify(m0.json).slice(0, 160))
  check('…y la app sabe que aún no tiene broker', m0.json.tieneBroker === false && m0.json.perfilId === perfilId)

  // ── 2. El comprador elige broker (opcional desde la V7.1) ───────────────────────────────

  const z = await api(C, '/api/brokers-zona', { perfilId })
  const ids = (z.json.brokers || []).map((b) => b.id)
  check('el comprador ve los brokers de su zona', z.status === 200 && ids.includes(B1.id) && ids.includes(B2.id), JSON.stringify(z.json).slice(0, 160))
  check('otro usuario no puede consultar su perfil', (await api(P, '/api/brokers-zona', { perfilId })).status === 404)

  const o1 = await api(C, '/api/oportunidades', { perfilId, brokerId: B1.id })
  check('el comprador elige a B1', o1.status === 200 && o1.json.oportunidad?.estado === 'ofrecida', JSON.stringify(o1.json).slice(0, 160))
  check('no puede elegir a otro mientras espera', (await api(C, '/api/oportunidades', { perfilId, brokerId: B2.id })).status === 409)

  const g1 = await api(B1, '/api/oportunidades', null, 'GET')
  const vista = (g1.json.oportunidades || []).find((o) => o.id === o1.json.oportunidad.id)
  check('B1 ve la oportunidad de comprador con lo que busca', vista?.tipo === 'comprador' && vista?.comprador?.zona === SP)
  check('…sin su contacto antes de aceptar', vista?.comprador?.contacto === null)
  check('otro broker no puede responderla', (await api(B2, `/api/oportunidades/${o1.json.oportunidad.id}`, { accion: 'aceptar' })).status === 404)

  const r1 = await api(B1, `/api/oportunidades/${o1.json.oportunidad.id}`, { accion: 'aceptar' })
  check('B1 acepta representar al comprador', r1.status === 200 && r1.json.estado === 'aceptada', JSON.stringify(r1.json))
  const { data: perf2 } = await admin.from('perfiles_intencion').select('representado_por, usuario_id, broker_id').eq('id', perfilId).single()
  check('el perfil queda representado por B1 y sigue siendo del comprador', perf2.representado_por === B1.id && perf2.usuario_id === C.id && perf2.broker_id === null)
  const g2 = await api(B1, '/api/oportunidades', null, 'GET')
  const vista2 = (g2.json.oportunidades || []).find((o) => o.id === o1.json.oportunidad.id)
  check('al aceptar, B1 recibe nombre y correo del comprador', vista2?.comprador?.contacto?.correo === C.email && !!vista2?.comprador?.contacto?.nombre, JSON.stringify(vista2?.comprador))
  const { data: rlsPerfil } = await B1.cli.from('perfiles_intencion').select('id').eq('id', perfilId)
  check('B1 lee el perfil que representa (RLS)', (rlsPerfil || []).length === 1)
  const { data: rlsOtro } = await B2.cli.from('perfiles_intencion').select('id').eq('id', perfilId)
  check('B2 no lo lee (RLS)', (rlsOtro || []).length === 0)
  const z2 = await api(C, '/api/brokers-zona', { perfilId })
  check('el comprador ve a su broker asignado', z2.json.asignado?.id === B1.id, JSON.stringify(z2.json).slice(0, 120))

  const m1 = await api(C, '/api/matches', null, 'GET')
  check('ahora la app sabe que tiene broker', m1.json.tieneBroker === true)
  const s1 = await api(C, '/api/matches', { activoId, perfilId })
  check('con broker, el comprador pide la conexión', s1.status === 200 && s1.json.estado === 'solicitado', JSON.stringify(s1.json))
  const mb = await api(B1, '/api/matches', null, 'GET')
  const deMiCliente = (mb.json.paraMisClientes || []).find((x) => x.perfilId === perfilId && x.activoId === activoId)
  check('B1 ve el match entre sus clientes, con el nombre del comprador', !!deMiCliente && deMiCliente.cliente?.startsWith('Compradora'), JSON.stringify(deMiCliente).slice(0, 160))

  const { data: match } = await admin.from('matches').select('id').eq('activo_id', activoId).eq('perfil_id', perfilId).single()
  await admin.from('leads').insert({
    activo_id: activoId, nombre: 'Interesado prueba', contacto: 'interesado@ejemplo.com', plazo: 'menos_3m',
    forma_pago: 'contado', categoria: 'serio', razones: ['prueba'], consentimiento_at: new Date().toISOString(),
  })

  // ── 5. El propietario elige broker: se completa un broker por lado ───────────────────────
  const o2 = await api(P, '/api/oportunidades', { activoId, brokerId: B2.id })
  const r2 = await api(B2, `/api/oportunidades/${o2.json.oportunidad?.id}`, { accion: 'aceptar' })
  check('el propietario elige a B2 y B2 acepta', o2.status === 200 && r2.status === 200, `${o2.status}/${r2.status}`)
  const { data: leadsDespues } = await P.cli.from('leads').select('id, contacto').eq('activo_id', activoId)
  check('con broker, el dueño ya lee el contacto (RLS)', leadsDespues?.[0]?.contacto === 'interesado@ejemplo.com')
  const { data: leadsB2 } = await B2.cli.from('leads').select('id, contacto').eq('activo_id', activoId)
  check('su broker también', leadsB2?.[0]?.contacto === 'interesado@ejemplo.com')
  const conecta = await api(OP, `/api/matches/${match.id}`, { estado: 'en_contacto' })
  check('con un broker por lado, Operación los pone en contacto', conecta.status === 200, JSON.stringify(conecta.json))
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
