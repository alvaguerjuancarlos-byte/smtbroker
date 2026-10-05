// Verifica contra la base REAL las reglas de acceso del Documento Maestro V6.1 (migración
// 20261005000100_v6_broker_protagonista.sql) y que siguen cerrados los dos hallazgos de la
// auditoría del 2026-10-03. Crea 3 cuentas temporales (2 brokers y 1 propietario) y las borra al
// final con todo lo que hayan creado -- no deja datos en producción, aunque una prueba falle.
//
// Cada insert se prueba EXACTAMENTE como lo hace el código real (sin .select() cuando el código
// no lo usa): un INSERT ... RETURNING también evalúa las políticas de SELECT y cambia el resultado
// (lección registrada en la auditoría del 2026-10-03).
//
// Uso: node --env-file=.env.local scripts/verificar-rls-v6.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = { usuarios: [], activos: [], perfiles: [], solicitudes: [] }
let fallas = 0

function check(nombre, ok, detalle = '') {
  if (!ok) fallas++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? `  (${detalle})` : ''}`)
}

async function cuenta(rol) {
  const email = `rls-v6-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  creados.usuarios.push(data.user.id)
  const { error: e2 } = await admin.from('usuarios').upsert({ id: data.user.id, nombre: `Prueba RLS ${rol}`, rol })
  if (e2) throw new Error(`perfil ${rol}: ${e2.message}`)
  const cli = anon()
  const { error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli }
}

const activoBase = (extra) => ({
  nombre: `RLS v6 ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
  status: 'ingresado', ...extra,
})

async function main() {
  const brokerA = await cuenta('broker')
  const brokerB = await cuenta('broker')
  const prop = await cuenta('propietario')

  // ── Activos ──────────────────────────────────────────────────────────────────────────────
  // Igual que app/activo/nuevo/page.tsx: insert + .select('id').single()
  const { data: aA, error: eA } = await brokerA.cli.from('activos').insert(activoBase({
    usuario_id: brokerA.id, broker_id: brokerA.id, cargado_por: 'broker',
    propietario_nombre: 'Propietario de prueba', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
  })).select('id').single()
  if (aA) creados.activos.push(aA.id)
  check('broker carga una propiedad con representación declarada', !eA && !!aA, eA?.message)

  const { data: aSin, error: eSin } = await brokerA.cli.from('activos').insert(activoBase({
    usuario_id: brokerA.id, broker_id: brokerA.id, cargado_por: 'broker',
  })).select('id').single()
  if (aSin) creados.activos.push(aSin.id)
  check('broker NO puede cargar sin representación declarada', !!eSin && !aSin, eSin?.message)

  const { data: aP, error: eP } = await prop.cli.from('activos').insert(activoBase({ usuario_id: prop.id })).select('id').single()
  if (aP) creados.activos.push(aP.id)
  check('propietario sigue cargando su activo', !eP && !!aP, eP?.message)

  if (aA) {
    const { data: verA } = await brokerA.cli.from('activos').select('id').eq('id', aA.id)
    check('broker A ve su propiedad', verA?.length === 1)
    const { data: verB } = await brokerB.cli.from('activos').select('id').eq('id', aA.id)
    check('broker B NO ve la propiedad de A', (verB?.length ?? 0) === 0)
    const { data: verP } = await prop.cli.from('activos').select('id').eq('id', aA.id)
    check('propietario ajeno NO ve la propiedad de A', (verP?.length ?? 0) === 0)
    const { error: eUpd } = await brokerA.cli.from('activos').update({ precio_total: 1234567 }).eq('id', aA.id)
    check('broker A edita su propiedad', !eUpd, eUpd?.message)
  }

  if (aP) {
    // El propietario asigna a broker A (como hace hoy la asignación): A debe verla y editarla,
    // pero NO poder quedarse con la titularidad.
    await admin.from('activos').update({ broker_id: brokerA.id }).eq('id', aP.id)
    const { data: ver } = await brokerA.cli.from('activos').select('id').eq('id', aP.id)
    check('broker ve un activo de propietario que representa', ver?.length === 1)
    const { error: eRobo } = await brokerA.cli.from('activos').update({ usuario_id: brokerA.id }).eq('id', aP.id)
    const { data: tras } = await admin.from('activos').select('usuario_id').eq('id', aP.id).single()
    check('broker NO puede quedarse con la titularidad', tras?.usuario_id === prop.id, eRobo?.message)
    const { data: verB } = await brokerB.cli.from('activos').select('id').eq('id', aP.id)
    check('broker B NO ve el activo representado por A', (verB?.length ?? 0) === 0)
  }

  // ── Clientes del broker (perfiles_intencion) ─────────────────────────────────────────────
  // Igual que app/portal-broker/page.tsx: insert SIN .select()
  const alias = `Cliente RLS ${sufijo}`
  const { error: eC } = await brokerA.cli.from('perfiles_intencion').insert({
    alias_cliente: alias, presupuesto: '$2M – $5M', zona: 'San Pedro', tipo_activo_interes: 'Casa',
    usuario_id: null, broker_id: brokerA.id, consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
  })
  check('broker registra un cliente', !eC, eC?.message)

  const { data: filasC } = await admin.from('perfiles_intencion').select('id').eq('alias_cliente', alias)
  for (const f of filasC || []) creados.perfiles.push(f.id)

  const { error: eSinC } = await brokerA.cli.from('perfiles_intencion').insert({
    alias_cliente: alias + ' sin consentimiento', usuario_id: null, broker_id: brokerA.id, fuente_captura: 'broker',
  })
  check('cliente SIN consentimiento es rechazado', !!eSinC, eSinC?.message)
  const { data: fugas } = await admin.from('perfiles_intencion').select('id').eq('alias_cliente', alias + ' sin consentimiento')
  for (const f of fugas || []) creados.perfiles.push(f.id)

  const { error: eAjeno } = await brokerB.cli.from('perfiles_intencion').insert({
    alias_cliente: alias + ' a nombre de A', usuario_id: null, broker_id: brokerA.id,
    consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
  })
  check('broker B NO puede registrar clientes a nombre de A', !!eAjeno, eAjeno?.message)
  const { data: fugas2 } = await admin.from('perfiles_intencion').select('id').eq('alias_cliente', alias + ' a nombre de A')
  for (const f of fugas2 || []) creados.perfiles.push(f.id)

  const { data: verCA } = await brokerA.cli.from('perfiles_intencion').select('id').eq('alias_cliente', alias)
  check('broker A ve a su cliente', verCA?.length === 1)
  const { data: verCB } = await brokerB.cli.from('perfiles_intencion').select('id').eq('alias_cliente', alias)
  check('broker B NO ve a los clientes de A', (verCB?.length ?? 0) === 0)
  const { data: verCP } = await prop.cli.from('perfiles_intencion').select('id').eq('alias_cliente', alias)
  check('propietario NO ve clientes de brokers', (verCP?.length ?? 0) === 0)

  if (filasC?.[0]) {
    const { error: eBorrarB } = await brokerB.cli.from('perfiles_intencion').delete().eq('id', filasC[0].id)
    const { data: sigue } = await admin.from('perfiles_intencion').select('id').eq('id', filasC[0].id)
    check('broker B NO puede borrar al cliente de A', sigue?.length === 1, eBorrarB?.message)
  }

  // ── Hallazgos de la auditoría del 2026-10-03 siguen cerrados ─────────────────────────────
  await brokerA.cli.from('usuarios').update({ rol: 'broker_maestro' }).eq('id', brokerA.id)
  const { data: rolTras } = await admin.from('usuarios').select('rol').eq('id', brokerA.id).single()
  check('nadie puede autootorgarse broker_maestro', rolTras?.rol === 'broker', `rol=${rolTras?.rol}`)

  // Igual que app/bienvenida/page.tsx: insert anónimo SIN .select()
  const emailSol = `rls-v6-solicitud-${sufijo}@prueba.smtbroker.mx`
  const { error: eSol } = await anon().from('solicitudes').insert({ nombre: 'Prueba RLS', email: emailSol, rol: 'broker', status: 'pendiente' })
  check('/bienvenida sigue guardando solicitudes', !eSol, eSol?.message)
  const { data: sols } = await admin.from('solicitudes').select('id').eq('email', emailSol)
  for (const s of sols || []) creados.solicitudes.push(s.id)
}

async function limpiar() {
  for (const id of creados.perfiles) await admin.from('perfiles_intencion').delete().eq('id', id)
  for (const id of creados.activos) await admin.from('activos').delete().eq('id', id)
  for (const id of creados.solicitudes) await admin.from('solicitudes').delete().eq('id', id)
  for (const id of creados.usuarios) {
    await admin.from('perfiles_intencion').delete().eq('broker_id', id)
    await admin.from('activos').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const { data: restos } = await admin.from('activos').select('id').eq('nombre', `RLS v6 ${sufijo}`)
  console.log(`\nLimpieza: ${creados.usuarios.length} cuentas temporales borradas; activos de prueba restantes: ${restos?.length ?? '?'}`)
}

try {
  await main()
} catch (e) {
  fallas++
  console.error('ERROR', e.message)
} finally {
  await limpiar()
  console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLA(S)`)
  process.exit(fallas === 0 ? 0 : 1)
}
