// Verifica contra la base REAL el Bloque 1 del plan V6.3: mundos demo y real separados
// (migración 20261008000000_mundos_demo_real.sql, lib/mundo.ts, app/api/matches).
//
// Crea un mundo real (broker R + comprador C) y un mundo demo (broker D, cuenta marcada es_demo)
// con propiedades y clientes que SÍ harían match entre mundos si no estuvieran separados, prueba
// que no se cruzan, y lo borra todo al final aunque una prueba falle.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-mundos.mjs

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

async function cuenta(rol, nombre, esDemo) {
  const email = `mundos-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  usuariosCreados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre, rol, es_demo: esDemo })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token }
}

const api = (u, method = 'GET', body) => fetch(`${BASE}/api/matches`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

async function main() {
  const { error: sinColumna } = await admin.from('activos').select('es_demo').limit(1)
  if (sinColumna) throw new Error(`falta activos.es_demo -- aplica primero la migración 20261008000000 (${sinColumna.message})`)

  // Backfill: ningún activo ni perfil de una cuenta demo quedó marcado como real.
  const { data: demos } = await admin.from('usuarios').select('id').eq('es_demo', true)
  const idsDemo = (demos || []).map((u) => u.id)
  if (idsDemo.length) {
    const { count: actMal } = await admin.from('activos').select('id', { count: 'exact', head: true })
      .in('usuario_id', idsDemo).eq('es_demo', false)
    check('backfill: activos de cuentas demo marcados es_demo', actMal === 0, `${actMal} sin marcar`)
    const { data: perfs } = await admin.from('perfiles_intencion').select('usuario_id, broker_id, es_demo')
    const perfMal = (perfs || []).filter((p) => idsDemo.includes(p.usuario_id ?? p.broker_id) && !p.es_demo).length
    check('backfill: perfiles de cuentas demo marcados es_demo', perfMal === 0, `${perfMal} sin marcar`)
  }

  const R = await cuenta('broker', `Broker real ${sufijo}`, false)
  const C = await cuenta('inversionista', `Comprador real ${sufijo}`, false)
  const D = await cuenta('broker', `Broker demo ${sufijo}`, true)

  // Una casa y un cliente por broker, todos compatibles entre sí (Casa, San Pedro, ~$9M): sin la
  // separación, cada broker vería la casa y el cliente del otro mundo.
  const casa = (b, n) => ({
    usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
    representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
    nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
    status: 'valoracion', precio_total: 9_000_000,
  })
  const cliente = (b, alias) => ({
    usuario_id: null, broker_id: b.id, alias_cliente: alias, presupuesto: '$5M – $15M', zona: 'San Pedro',
    tipo_activo_interes: 'Casa', consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
  })

  // La casa de R se crea desde SU sesión (como lo hace /activo/nuevo); la de D con admin, igual que
  // el seed demo. El trigger debe fijar el mundo en ambos casos, sin que nadie mande es_demo.
  const { error: eR } = await R.cli.from('activos').insert(casa(R, 'Casa real'))
  check('broker real crea su activo', !eR, eR?.message)
  const { data: casaR } = await admin.from('activos').select('id, es_demo').eq('usuario_id', R.id).single()
  const { data: casaD } = await admin.from('activos').insert(casa(D, 'Casa demo')).select('id, es_demo').single()
  check('trigger: activo de cuenta real queda es_demo=false', casaR?.es_demo === false)
  check('trigger: activo de cuenta demo queda es_demo=true', casaD?.es_demo === true)

  const { error: ePR } = await R.cli.from('perfiles_intencion').insert(cliente(R, `Cliente real ${sufijo}`))
  check('broker real registra un cliente', !ePR, ePR?.message)
  const { data: cliR } = await admin.from('perfiles_intencion').select('id, es_demo').eq('broker_id', R.id).single()
  const { data: cliD } = await admin.from('perfiles_intencion').insert(cliente(D, `Cliente demo ${sufijo}`)).select('id, es_demo').single()
  check('trigger: perfil de cuenta real queda es_demo=false', cliR?.es_demo === false)
  check('trigger: perfil de cuenta demo queda es_demo=true', cliD?.es_demo === true)

  // Nadie puede cambiar de mundo su propio activo desde la aplicación.
  await R.cli.from('activos').update({ es_demo: true }).eq('id', casaR.id)
  const { data: casaR2 } = await admin.from('activos').select('es_demo').eq('id', casaR.id).single()
  check('trigger: el cliente no puede cambiar es_demo', casaR2?.es_demo === false)

  // ── API de matches ─────────────────────────────────────────────────────────────────────────
  const gR = await api(R)
  check('GET matches broker real responde 200', gR.status === 200, JSON.stringify(gR.json).slice(0, 120))
  const activosVistosR = (gR.json.paraMisClientes || []).map((m) => m.activoId)
  const perfilesVistosR = (gR.json.paraMiPortafolio || []).map((m) => m.perfilId)
  check('broker real SÍ ve match con su propia casa', activosVistosR.includes(casaR.id))
  check('broker real NO ve la casa demo', !activosVistosR.includes(casaD.id))
  check('broker real NO ve el cliente demo', !perfilesVistosR.includes(cliD.id))
  check('broker real no ve NINGÚN activo demo', await sinDemo('activos', activosVistosR))
  check('broker real no ve NINGÚN perfil demo', await sinDemo('perfiles_intencion', perfilesVistosR))

  const gD = await api(D)
  const activosVistosD = (gD.json.paraMisClientes || []).map((m) => m.activoId)
  const perfilesVistosD = (gD.json.paraMiPortafolio || []).map((m) => m.perfilId)
  check('broker demo SÍ ve match con su casa demo', activosVistosD.includes(casaD.id))
  check('broker demo NO ve la casa real', !activosVistosD.includes(casaR.id))
  check('broker demo NO ve el cliente real', !perfilesVistosD.includes(cliR.id))

  const cruzado = await api(R, 'POST', { activoId: casaR.id, perfilId: cliD.id })
  check('POST cruzado (casa real ↔ cliente demo) rechazado', cruzado.status === 403 || cruzado.status === 422, `status ${cruzado.status}`)
  const cruzado2 = await api(D, 'POST', { activoId: casaR.id, perfilId: cliD.id })
  check('POST cruzado desde demo rechazado', cruzado2.status === 422, `status ${cruzado2.status}`)

  // ── Vista activos_publicos (portal del comprador) ──────────────────────────────────────────
  const { data: pubC, error: ePub } = await C.cli.from('activos_publicos').select('id')
  check('comprador real lee activos_publicos', !ePub, ePub?.message)
  const idsPubC = (pubC || []).map((a) => a.id)
  check('comprador real ve la casa real', idsPubC.includes(casaR.id))
  check('comprador real NO ve la casa demo', !idsPubC.includes(casaD.id))
  check('comprador real no ve NINGÚN activo demo', await sinDemo('activos', idsPubC))

  const { data: pubD } = await D.cli.from('activos_publicos').select('id')
  const idsPubD = (pubD || []).map((a) => a.id)
  check('cuenta demo ve la casa demo', idsPubD.includes(casaD.id))
  check('cuenta demo NO ve la casa real', !idsPubD.includes(casaR.id))

  const { data: pubAnon, error: eAnon } = await anon().from('activos_publicos').select('id')
  check('anon sigue sin acceso a activos_publicos', !!eAnon || (pubAnon || []).length === 0, eAnon?.message)
}

async function sinDemo(tabla, ids) {
  if (!ids.length) return true
  const { count } = await admin.from(tabla).select('id', { count: 'exact', head: true }).in('id', ids).eq('es_demo', true)
  return count === 0
}

async function limpiar() {
  // activos.usuario_id y perfiles_intencion.usuario_id tienen ON DELETE CASCADE desde auth.users;
  // los de broker (usuario_id null en perfiles) se borran a mano antes.
  for (const id of usuariosCreados) {
    await admin.from('perfiles_intencion').delete().eq('broker_id', id)
    await admin.from('activos').delete().eq('usuario_id', id)
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
