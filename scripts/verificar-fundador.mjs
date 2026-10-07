// Verifica contra la base REAL el paso 3A del plan V6.3: marca "Fundador"
// (migración 20261008000100_broker_fundador.sql, app/api/operacion/fundador).
// Crea cuentas temporales (broker, comprador y Operación) y las borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-fundador.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const usuariosCreados = []
let fallas = 0

function check(nombre, ok, detalle = '') {
  if (!ok) fallas++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? `  (${detalle})` : ''}`)
}

async function cuenta(rol) {
  const email = `fundador-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  usuariosCreados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token }
}

const marcar = (u, brokerId, fundador) => fetch(`${BASE}/api/operacion/fundador`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: JSON.stringify({ brokerId, fundador }),
}).then((r) => r.status)

const fundadorDe = async (id) =>
  (await admin.from('usuarios').select('fundador').eq('id', id).single()).data?.fundador

async function main() {
  const { error } = await admin.from('usuarios').select('fundador').limit(1)
  if (error) throw new Error(`falta usuarios.fundador -- aplica primero la migración 20261008000100 (${error.message})`)

  const B = await cuenta('broker')
  const C = await cuenta('inversionista')
  const OP = await cuenta('broker_maestro')

  check('broker nuevo NO es Fundador', (await fundadorDe(B.id)) === false)

  // El broker intenta ponérsela él mismo por la API de datos: grant update solo (nombre).
  const { error: eSelf } = await B.cli.from('usuarios').update({ fundador: true }).eq('id', B.id)
  check('broker no puede auto-otorgarse Fundador (BD)', !!eSelf && (await fundadorDe(B.id)) === false, eSelf?.message)

  check('broker no puede usar la ruta de Operación', (await marcar(B, B.id, true)) === 403)
  check('comprador no puede usar la ruta de Operación', (await marcar(C, B.id, true)) === 403)
  check('sin sesión → 401', (await fetch(`${BASE}/api/operacion/fundador`, { method: 'POST' })).status === 401)

  check('Operación no puede marcar a un comprador', (await marcar(OP, C.id, true)) === 422)
  check('Operación marca al broker como Fundador', (await marcar(OP, B.id, true)) === 200 && (await fundadorDe(B.id)) === true)

  const { data: propia } = await B.cli.from('usuarios').select('fundador').eq('id', B.id).single()
  check('el broker ve su propia marca', propia?.fundador === true)

  check('Operación quita la marca', (await marcar(OP, B.id, false)) === 200 && (await fundadorDe(B.id)) === false)
}

async function limpiar() {
  for (const id of usuariosCreados) {
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`\nLimpieza: ${usuariosCreados.length} cuentas temporales borradas.`)
}

main()
  .catch((e) => { fallas++; console.error('ERROR', e.message) })
  .finally(async () => {
    await limpiar()
    console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
    process.exit(fallas ? 1 : 0)
  })
