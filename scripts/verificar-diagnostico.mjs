// Verifica el diagnóstico guardado (migración 20261007000000_diagnosticos_guardados.sql) contra la
// base REAL y la API en BASE_URL. Crea un broker, otro broker y un activo temporales y los borra al
// final. Hace 4 llamadas reales a los agentes (unos centavos de Claude + Serper).
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-diagnostico.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const usuarios = []
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }

async function cuenta(rol) {
  const email = `diag-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  usuarios.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `Diag ${rol} ${sufijo}`, rol })
  const cli = anon()
  const { data: s } = await cli.auth.signInWithPassword({ email, password: PASS })
  return { id: data.user.id, cli, token: s.session.access_token }
}

const agente = async (u, nombre, activoId, regenerar = false) => {
  const t0 = Date.now()
  const r = await fetch(`${BASE}/api/agentes/${nombre}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
    body: JSON.stringify({ activoId, regenerar }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, j, ms: Date.now() - t0 }
}
const sinMeta = ({ _guardado, ...resto }) => JSON.stringify(resto)

async function main() {
  const { error: eTabla } = await admin.from('diagnosticos').select('id').limit(1)
  if (eTabla) throw new Error(`falta la tabla diagnosticos -- aplica la migración 20261007000000 (${eTabla.message})`)

  const A = await cuenta('broker')
  const B = await cuenta('broker')
  const OP = await cuenta('broker_maestro')
  const { data: act } = await admin.from('activos').insert({
    usuario_id: A.id, broker_id: A.id, cargado_por: 'broker', propietario_nombre: 'Prop diag',
    representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
    nombre: `Diag ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
    status: 'valoracion', precio_total: 9_000_000, superficie: 300,
  }).select('id').single()

  for (const nombre of ['legal', 'mercado']) {
    const r1 = await agente(A, nombre, act.id)
    check(`${nombre}: la primera llamada calcula y guarda`, r1.status === 200 && r1.j._guardado?.nuevo === true, `status=${r1.status} ${r1.j.error ?? ''} ${r1.ms}ms`)
    const r2 = await agente(A, nombre, act.id)
    check(`${nombre}: la segunda devuelve el guardado (mismo id)`, r2.j._guardado?.id === r1.j._guardado?.id && r2.j._guardado?.nuevo === false)
    check(`${nombre}: mismo resultado en ambas visitas`, sinMeta(r2.j) === sinMeta(r1.j))
    check(`${nombre}: la segunda es rápida (sin llamar a Claude)`, r2.ms < 2000, `${r2.ms}ms`)
    if (nombre === 'legal') {
      const r3 = await agente(A, nombre, act.id, true)
      check('legal: regenerar crea un diagnóstico nuevo', r3.j._guardado?.nuevo === true && r3.j._guardado?.id !== r1.j._guardado?.id)
      const r4 = await agente(A, nombre, act.id)
      check('legal: después se usa el más reciente', r4.j._guardado?.id === r3.j._guardado?.id)
    }
  }

  const rB = await agente(B, 'legal', act.id)
  check('otro broker NO obtiene el diagnóstico por la API', rB.status === 404)
  const { data: vA } = await A.cli.from('diagnosticos').select('id').eq('activo_id', act.id)
  check('el broker del activo lee sus diagnósticos', vA?.length === 3, `filas=${vA?.length}`)
  const { data: vB } = await B.cli.from('diagnosticos').select('id').eq('activo_id', act.id)
  check('otro broker NO los lee', (vB?.length ?? 0) === 0)
  const { data: vOp } = await OP.cli.from('diagnosticos').select('id').eq('activo_id', act.id)
  check('Operación los lee', vOp?.length === 3)
  const { data: vAnon } = await anon().from('diagnosticos').select('id').eq('activo_id', act.id)
  check('anon NO los lee', (vAnon?.length ?? 0) === 0)
  const { error: eIns } = await A.cli.from('diagnosticos').insert({ activo_id: act.id, agente: 'legal', resultado: { falso: true } })
  check('nadie inserta diagnósticos desde el cliente', !!eIns, eIns?.message)
}

try { await main() } catch (e) { fallas++; console.error('ERROR', e.message) } finally {
  for (const id of usuarios) {
    await admin.from('activos').delete().eq('usuario_id', id) // diagnosticos se borran en cascada
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const { data: r } = await admin.from('activos').select('id').like('nombre', `%${sufijo}`)
  console.log(`\nLimpieza: ${usuarios.length} cuentas borradas; activos de prueba restantes: ${r?.length ?? '?'}`)
  console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLA(S)`)
  process.exit(fallas === 0 ? 0 : 1)
}
