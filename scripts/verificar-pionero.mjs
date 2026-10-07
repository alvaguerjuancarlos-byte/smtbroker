// Verifica contra la base REAL el paso 3A del plan V6.3: marca "Pionero"
// (migración 20261008000100_broker_fundador.sql, renombrada a pionero en 20261008000300, app/api/operacion/pionero).
// Crea cuentas temporales (broker, comprador y Operación) y las borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-pionero.mjs

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
  const email = `pionero-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  usuariosCreados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token }
}

const marcar = (u, brokerId, pionero) => fetch(`${BASE}/api/operacion/pionero`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: JSON.stringify({ brokerId, pionero }),
}).then((r) => r.status)

const pioneroDe = async (id) =>
  (await admin.from('usuarios').select('pionero').eq('id', id).single()).data?.pionero

async function main() {
  const { error } = await admin.from('usuarios').select('pionero').limit(1)
  if (error) throw new Error(`falta usuarios.pionero -- aplica primero las migraciones 20261008000100 y 20261008000300 (${error.message})`)

  const B = await cuenta('broker')
  const C = await cuenta('inversionista')
  const OP = await cuenta('broker_maestro')

  check('broker nuevo NO es Pionero', (await pioneroDe(B.id)) === false)

  // El broker intenta ponérsela él mismo por la API de datos: grant update solo (nombre).
  const { error: eSelf } = await B.cli.from('usuarios').update({ pionero: true }).eq('id', B.id)
  check('broker no puede auto-otorgarse Pionero (BD)', !!eSelf && (await pioneroDe(B.id)) === false, eSelf?.message)

  check('broker no puede usar la ruta de Operación', (await marcar(B, B.id, true)) === 403)
  check('comprador no puede usar la ruta de Operación', (await marcar(C, B.id, true)) === 403)
  check('sin sesión → 401', (await fetch(`${BASE}/api/operacion/pionero`, { method: 'POST' })).status === 401)

  check('Operación no puede marcar a un comprador', (await marcar(OP, C.id, true)) === 422)
  check('Operación marca al broker como Pionero', (await marcar(OP, B.id, true)) === 200 && (await pioneroDe(B.id)) === true)

  const { data: propia } = await B.cli.from('usuarios').select('pionero').eq('id', B.id).single()
  check('el broker ve su propia marca', propia?.pionero === true)

  check('Operación quita la marca', (await marcar(OP, B.id, false)) === 200 && (await pioneroDe(B.id)) === false)
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
