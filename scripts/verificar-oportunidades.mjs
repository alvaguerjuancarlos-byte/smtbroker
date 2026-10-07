// Verifica contra la base REAL el paso 3B del plan V6.3: el propietario elige un broker certificado
// (migración 20261008000400_oportunidades.sql, app/api/brokers-zona, app/api/oportunidades).
//
// Escenario (mundo real salvo BD): un propietario con una casa en San Pedro sin broker y cinco
// brokers --
//   B1 Oro en San Pedro (3 propiedades, 2 documentadas, 1 cierre verificado)   → elegible
//   B2 Aliado en San Pedro (1 propiedad)                                       → NO (nivel)
//   B3 Pionero en San Pedro (1 propiedad; Pionero = Plata)                     → elegible
//   B4 Plata solo en Monterrey                                                 → NO (zona)
//   BD Plata en San Pedro pero cuenta DEMO                                     → NO (mundo)
// Crea todo y lo borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-oportunidades.mjs

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
  const email = `oport-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${nombre} ${sufijo}`, rol, ...extra })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token }
}

const propiedadBroker = (b, n, municipio, folio) => ({
  usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
  representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
  nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio, estado: 'Nuevo León', status: 'valoracion',
  precio_total: 9_000_000, folio_real: folio,
})

const api = (u, ruta, body, method = 'POST') => fetch(`${BASE}${ruta}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

async function main() {
  const { error } = await admin.from('oportunidades').select('id').limit(1)
  if (error) throw new Error(`falta la tabla oportunidades -- aplica primero la migración 20261008000400 (${error.message})`)

  const SP = 'San Pedro Garza García'
  const P = await cuenta('propietario', 'Propietario')
  const X = await cuenta('propietario', 'Otro propietario')
  const B1 = await cuenta('broker', 'Broker Oro')
  const B2 = await cuenta('broker', 'Broker Aliado')
  const B3 = await cuenta('broker', 'Broker Pionero', { pionero: true })
  const B4 = await cuenta('broker', 'Broker Monterrey')
  const BD = await cuenta('broker', 'Broker Demo', { es_demo: true })

  const { data: casasB1 } = await admin.from('activos').insert([
    propiedadBroker(B1, 'B1 a', SP, 'FR-1'), propiedadBroker(B1, 'B1 b', SP, 'FR-2'), propiedadBroker(B1, 'B1 c', SP, null),
  ]).select('id')
  await admin.from('cierres_reportados').insert({
    activo_id: casasB1[0].id, broker_id: B1.id, precio_cierre: 9_000_000, fecha_cierre: '2026-09-01',
    origen_comprador: 'mi_cliente', estado: 'verificado', verificado_at: new Date().toISOString(),
  })
  await admin.from('activos').insert([
    propiedadBroker(B2, 'B2 a', SP, null),
    propiedadBroker(B3, 'B3 a', SP, null),
    propiedadBroker(B4, 'B4 a', 'Monterrey', 'FR-3'), propiedadBroker(B4, 'B4 b', 'Monterrey', 'FR-4'), propiedadBroker(B4, 'B4 c', 'Monterrey', null),
    propiedadBroker(BD, 'BD a', SP, 'FR-5'), propiedadBroker(BD, 'BD b', SP, 'FR-6'), propiedadBroker(BD, 'BD c', SP, null),
  ])

  const { error: eIns } = await P.cli.from('activos').insert({
    usuario_id: P.id, nombre: `Casa del propietario ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro', estado: 'Nuevo León',
    status: 'ingresado', precio_total: 12_000_000, superficie: 350,
  })
  check('propietario crea su activo (municipio escrito "San Pedro")', !eIns, eIns?.message)
  const { data: act } = await admin.from('activos').select('id').eq('usuario_id', P.id).single()
  const activoId = act.id

  // ── Brokers de la zona ───────────────────────────────────────────────────────────────────
  const z = await api(P, '/api/brokers-zona', { activoId })
  check('brokers-zona responde 200', z.status === 200, JSON.stringify(z.json).slice(0, 150))
  const ids = (z.json.brokers || []).map((b) => b.id)
  check('aparece el broker Oro de la zona', ids.includes(B1.id))
  check('aparece el broker Pionero (cuenta como Plata)', ids.includes(B3.id))
  check('NO aparece el broker Aliado', !ids.includes(B2.id))
  check('NO aparece el broker de otro municipio', !ids.includes(B4.id))
  check('NO aparece el broker demo', !ids.includes(BD.id))
  check('ordenados por nivel (Oro antes que Plata)', ids.indexOf(B1.id) < ids.indexOf(B3.id))
  const b1 = (z.json.brokers || []).find((b) => b.id === B1.id)
  check('datos del broker Oro: nivel y cierre verificado', b1?.nivel === 'Oro' && b1?.cierresVerificados === 1, JSON.stringify(b1))
  const llaves = new Set((z.json.brokers || []).flatMap((b) => Object.keys(b)))
  check('sin datos de contacto (correo/teléfono)', !['email', 'correo', 'telefono'].some((k) => llaves.has(k)), [...llaves].join(','))
  check('otro propietario no puede consultar este activo', (await api(X, '/api/brokers-zona', { activoId })).status === 404)

  // ── Ofrecer ──────────────────────────────────────────────────────────────────────────────
  check('no se puede ofrecer a un broker Aliado', (await api(P, '/api/oportunidades', { activoId, brokerId: B2.id })).status === 422)
  check('no se puede ofrecer a un broker demo', (await api(P, '/api/oportunidades', { activoId, brokerId: BD.id })).status === 422)
  check('otro propietario no puede ofrecer este activo', (await api(X, '/api/oportunidades', { activoId, brokerId: B1.id })).status === 404)
  const { error: eDirecto } = await P.cli.from('oportunidades').insert({ activo_id: activoId, propietario_id: P.id, broker_id: B1.id })
  check('nadie inserta oportunidades desde el cliente (BD)', !!eDirecto, eDirecto?.message)

  const o1 = await api(P, '/api/oportunidades', { activoId, brokerId: B1.id })
  check('propietario ofrece su activo al broker Oro', o1.status === 200 && o1.json.oportunidad?.estado === 'ofrecida', JSON.stringify(o1.json).slice(0, 120))
  check('no puede ofrecerlo a otro mientras espera', (await api(P, '/api/oportunidades', { activoId, brokerId: B3.id })).status === 409)

  // ── El broker la ve y responde ───────────────────────────────────────────────────────────
  const g1 = await api(B1, '/api/oportunidades', null, 'GET')
  const vista = (g1.json.oportunidades || []).find((o) => o.id === o1.json.oportunidad.id)
  check('el broker ve la oportunidad con datos del activo', vista?.activo?.id === activoId && vista?.activo?.precio_total === 12_000_000)
  check('…y la lista de documentos que faltan', Array.isArray(vista?.diagnostico?.documentosFaltantes) && vista.diagnostico.documentosFaltantes.length > 0)
  const { data: antes } = await B1.cli.from('activos').select('id').eq('id', activoId)
  check('antes de aceptar, el broker NO lee el activo (RLS)', (antes || []).length === 0)
  check('otro broker no puede responderla', (await api(B3, `/api/oportunidades/${o1.json.oportunidad.id}`, { accion: 'aceptar' })).status === 404)

  const r1 = await api(B1, `/api/oportunidades/${o1.json.oportunidad.id}`, { accion: 'rechazar' })
  check('el broker Oro la rechaza', r1.status === 200 && r1.json.estado === 'rechazada')
  const z2 = await api(P, '/api/brokers-zona', { activoId })
  check('el propietario ve el rechazo', (z2.json.oportunidades || []).some((o) => o.broker_id === B1.id && o.estado === 'rechazada'))

  const o2 = await api(P, '/api/oportunidades', { activoId, brokerId: B3.id })
  check('el propietario elige al broker Pionero', o2.status === 200)
  const r2 = await api(B3, `/api/oportunidades/${o2.json.oportunidad.id}`, { accion: 'aceptar' })
  check('el broker Pionero acepta', r2.status === 200 && r2.json.estado === 'aceptada')
  const { data: asignado } = await admin.from('activos').select('usuario_id, broker_id, cargado_por').eq('id', activoId).single()
  check('el activo queda representado por el Pionero', asignado.broker_id === B3.id)
  check('el dueño sigue siendo el propietario', asignado.usuario_id === P.id && asignado.cargado_por === 'propietario')
  const { data: despues } = await B3.cli.from('activos').select('id').eq('id', activoId)
  check('ahora el broker lee el activo (RLS)', (despues || []).length === 1)
  check('no se puede volver a responder', (await api(B3, `/api/oportunidades/${o2.json.oportunidad.id}`, { accion: 'aceptar' })).status === 409)
  check('con broker asignado ya no se buscan brokers', (await api(P, '/api/brokers-zona', { activoId })).status === 409)
}

async function limpiar() {
  for (const id of creados) {
    await admin.from('activos').delete().eq('usuario_id', id) // oportunidades y cierres caen en cascada
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
