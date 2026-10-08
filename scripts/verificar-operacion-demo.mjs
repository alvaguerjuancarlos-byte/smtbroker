// Verifica contra la base REAL el aislamiento de la cuenta Operación DEMO (migración
// 20261008000700_operacion_demo_aislada.sql; hallazgo de seguridad del recorrido guiado).
//
// Crea un mundo real (broker, comprador, activo, perfil, match, cierre, certificación, oportunidad,
// lead y una solicitud) y otro demo, más dos cuentas de Operación (real y demo). Prueba que la demo
// NO lee ni modifica nada real por la API de datos ni por las rutas del servidor, y que la real sí.
// Lo borra todo al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-operacion-demo.mjs

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

async function cuenta(rol, esDemo) {
  const email = `aislada-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol, es_demo: esDemo })
  const cli = anon()
  const { data: s } = await cli.auth.signInWithPassword({ email, password: PASS })
  return { id: data.user.id, cli, token: s.session.access_token }
}
const api = (u, ruta, body) => fetch(`${BASE}${ruta}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
const casa = (b, n) => ({
  usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop', representacion_tipo: 'exclusiva',
  representacion_declarada_at: new Date().toISOString(), nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García',
  estado: 'Nuevo León', status: 'valoracion', precio_total: 9_000_000, folio_real: 'FR', escritura_publica: 'si', clave_catastral: 'CC',
  uso_suelo_declarado: 'habitacional', publicada_at: new Date().toISOString(),
})
const filas = async (cli, tabla, col, valor) => ((await cli.from(tabla).select('id').eq(col, valor)).data || []).length

async function main() {
  const { error } = await admin.rpc('es_operacion_demo')
  if (error && /could not find|does not exist/i.test(error.message)) throw new Error('falta la migración 20261008000700')

  const BR = await cuenta('broker', false)
  const CR = await cuenta('inversionista', false)
  const BD = await cuenta('broker', true)
  const OPR = await cuenta('broker_maestro', false)
  const OPD = await cuenta('broker_maestro', true)

  const { data: real } = await admin.from('activos').insert(casa(BR, 'Casa real')).select('id').single()
  const { data: demo } = await admin.from('activos').insert(casa(BD, 'Casa demo')).select('id').single()
  await admin.from('perfiles_intencion').insert({ usuario_id: CR.id, presupuesto: '$5M – $15M', zona: 'San Pedro', tipo_activo_interes: 'Casa', fuente_captura: 'registro_directo' })
  const { data: perfil } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', CR.id).single()
  const { data: m } = await admin.from('matches').insert({ activo_id: real.id, perfil_id: perfil.id, solicitado_por: CR.id, score: 100 }).select('id').single()
  const { data: ci } = await admin.from('cierres_reportados').insert({ activo_id: real.id, broker_id: BR.id, precio_cierre: 9e6, fecha_cierre: '2026-10-01', origen_comprador: 'mi_cliente' }).select('id').single()
  await admin.from('certificaciones').insert({ activo_id: real.id, solicitado_por: BR.id })
  await admin.from('leads').insert({ activo_id: real.id, nombre: 'Lead real', contacto: '8112345678', plazo: 'menos_3m', forma_pago: 'contado', categoria: 'serio', consentimiento_at: new Date().toISOString() })
  await admin.from('solicitudes').insert({ nombre: 'Solicitud real', email: `solicitud-${sufijo}@prueba.smtbroker.mx`, telefono: '1', rol: 'broker', status: 'pendiente' })

  // ── Operación DEMO: nada real ────────────────────────────────────────────────────────────
  const D = OPD.cli
  check('demo NO lee el activo real', (await filas(D, 'activos', 'id', real.id)) === 0)
  check('demo SÍ lee el activo demo', (await filas(D, 'activos', 'id', demo.id)) === 1)
  check('demo NO lee usuarios reales', (await filas(D, 'usuarios', 'id', BR.id)) === 0)
  check('demo SÍ lee usuarios demo', (await filas(D, 'usuarios', 'id', BD.id)) === 1)
  check('demo NO lee perfiles reales', (await filas(D, 'perfiles_intencion', 'id', perfil.id)) === 0)
  check('demo NO lee matches reales', (await filas(D, 'matches', 'id', m.id)) === 0)
  check('demo NO lee cierres reales', (await filas(D, 'cierres_reportados', 'id', ci.id)) === 0)
  check('demo NO lee certificaciones reales', (await filas(D, 'certificaciones', 'activo_id', real.id)) === 0)
  check('demo NO lee leads reales', (await filas(D, 'leads', 'activo_id', real.id)) === 0)
  check('demo NO lee solicitudes', (await filas(D, 'solicitudes', 'email', `solicitud-${sufijo}@prueba.smtbroker.mx`)) === 0)
  const { data: prosp } = await D.from('prospectos_broker').select('id').limit(1)
  check('demo NO lee prospección', (prosp || []).length === 0)

  await D.from('matches').update({ estado: 'descartado' }).eq('id', m.id)
  await D.from('cierres_reportados').update({ estado: 'verificado' }).eq('id', ci.id)
  const { data: mDespues } = await admin.from('matches').select('estado').eq('id', m.id).single()
  const { data: ciDespues } = await admin.from('cierres_reportados').select('estado').eq('id', ci.id).single()
  check('demo NO puede descartar un match real', mDespues.estado === 'solicitado')
  check('demo NO puede verificar un cierre real', ciDespues.estado === 'pendiente')

  check('demo NO marca Pionero a un broker real', (await api(OPD, '/api/operacion/pionero', { brokerId: BR.id, pionero: true })).status === 403)
  check('demo SÍ marca Pionero a un broker demo', (await api(OPD, '/api/operacion/pionero', { brokerId: BD.id, pionero: true })).status === 200)
  check('demo NO envía invitaciones', (await api(OPD, '/api/invitar-usuario', { email: `x-${sufijo}@prueba.smtbroker.mx`, nombre: 'x', rol: 'broker' })).status === 403)
  check('demo NO corre el dictamen de un activo real', (await api(OPD, '/api/agentes/legal', { activoId: real.id, regenerar: true })).status === 404)

  // ── Operación REAL: sigue viendo todo ────────────────────────────────────────────────────
  const R = OPR.cli
  check('real lee el activo real', (await filas(R, 'activos', 'id', real.id)) === 1)
  check('real lee el activo demo', (await filas(R, 'activos', 'id', demo.id)) === 1)
  check('real lee matches, cierres y leads reales',
    (await filas(R, 'matches', 'id', m.id)) === 1 && (await filas(R, 'cierres_reportados', 'id', ci.id)) === 1 && (await filas(R, 'leads', 'activo_id', real.id)) === 1)
  check('real lee solicitudes', (await filas(R, 'solicitudes', 'email', `solicitud-${sufijo}@prueba.smtbroker.mx`)) === 1)
  await R.from('cierres_reportados').update({ estado: 'verificado', verificado_at: new Date().toISOString() }).eq('id', ci.id)
  check('real verifica un cierre real', (await admin.from('cierres_reportados').select('estado').eq('id', ci.id).single()).data.estado === 'verificado')

  // ── Nadie más ganó acceso ────────────────────────────────────────────────────────────────
  check('un broker real no lee el activo demo', (await filas(BR.cli, 'activos', 'id', demo.id)) === 0)
  check('un broker real no lee solicitudes', (await filas(BR.cli, 'solicitudes', 'email', `solicitud-${sufijo}@prueba.smtbroker.mx`)) === 0)
}

async function limpiar() {
  await admin.from('solicitudes').delete().eq('email', `solicitud-${sufijo}@prueba.smtbroker.mx`)
  for (const id of creados) {
    await admin.from('perfiles_intencion').delete().or(`usuario_id.eq.${id},broker_id.eq.${id}`)
    await admin.from('activos').delete().eq('usuario_id', id)
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
