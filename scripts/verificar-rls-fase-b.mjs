// Verifica contra la base REAL la Fase B del V6.1 (migración 20261006000000_fase_b_matches_cierres.sql)
// y la privacidad de app/api/matches. Crea cuentas temporales (2 brokers, 1 comprador y Operación)
// con datos de prueba y lo borra todo al final, aunque una prueba falle.
//
// La API se prueba contra BASE_URL (por defecto http://localhost:3001, con `next start`).
// Cada insert se hace igual que el código real (sin .select() cuando el código no lo usa).
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-rls-fase-b.mjs

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

async function cuenta(rol, nombre) {
  const email = `rls-b-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  usuariosCreados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre, rol })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token, nombre }
}

const api = (u, method = 'GET', body) => fetch(`${BASE}/api/matches`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + u.token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

async function main() {
  // Sin las tablas, los "rechazos" de abajo pasarían por la razón equivocada (tabla inexistente,
  // no RLS). Se usa un SELECT normal: un HEAD con count no reporta el error de tabla inexistente.
  for (const t of ['matches', 'cierres_reportados']) {
    const { error } = await admin.from(t).select('id').limit(1)
    if (error) throw new Error(`falta la tabla ${t} -- aplica primero la migración 20261006000000 (${error.message})`)
  }

  const A = await cuenta('broker', `Broker A ${sufijo}`)
  const B = await cuenta('broker', `Broker B ${sufijo}`)
  const C = await cuenta('inversionista', `Comprador ${sufijo}`)
  const OP = await cuenta('broker_maestro', `Operacion ${sufijo}`)

  // Datos: A y B tienen una casa cada uno en un municipio inventado (para no cruzarse con los
  // datos demo); A tiene un cliente, B tiene un cliente con alias secreto, C tiene su perfil.
  const muni = `San Pedro Garza García`
  const casa = (b, n, precio) => ({
    usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop prueba',
    representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
    nombre: `${n} ${sufijo}`, tipo: 'Casa', municipio: muni, estado: 'Nuevo León', status: 'valoracion', precio_total: precio,
  })
  const { data: casaA } = await admin.from('activos').insert(casa(A, 'Casa A', 9_000_000)).select('id').single()
  const { data: casaB } = await admin.from('activos').insert(casa(B, 'Casa B', 9_500_000)).select('id').single()
  const cliente = (b, alias) => ({
    usuario_id: null, broker_id: b.id, alias_cliente: alias, presupuesto: '$5M – $15M', zona: 'San Pedro',
    tipo_activo_interes: 'Casa', consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
  })
  const aliasSecretoB = `SECRETO-B-${sufijo}`
  const { data: cliA } = await admin.from('perfiles_intencion').insert(cliente(A, `Cliente A ${sufijo}`)).select('id').single()
  const { data: cliB } = await admin.from('perfiles_intencion').insert(cliente(B, aliasSecretoB)).select('id').single()
  await admin.from('perfiles_intencion').insert({ usuario_id: C.id, presupuesto: '$5M – $15M', zona: 'San Pedro', tipo_activo_interes: 'Casa', fuente_captura: 'registro_directo' })
  const { data: perfC } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', C.id).single()

  // ── API: privacidad ──────────────────────────────────────────────────────────────────────
  const gA = await api(A)
  check('GET /api/matches responde al broker', gA.status === 200, `status=${gA.status} ${gA.json.error ?? ''}`)
  const txtA = JSON.stringify(gA.json)
  check('broker A ve su cliente cruzado con la casa de B', gA.json.paraMisClientes?.some((m) => m.activoId === casaB.id && m.perfilId === cliA.id))
  check('la casa de B aparece como "otro broker"', gA.json.paraMisClientes?.find((m) => m.activoId === casaB.id)?.representacion === 'Representada por otro broker de la red')
  check('broker A ve compradores para su casa', gA.json.paraMiPortafolio?.some((m) => m.activoId === casaA.id && m.contraparte === 'Comprador directo'))
  check('la API NO revela el alias del cliente de B', !txtA.includes(aliasSecretoB))
  check('la API NO revela el nombre del broker B', !txtA.includes(B.nombre))
  check('la API NO revela el nombre del comprador', !txtA.includes(C.nombre))
  check('la API NO revela ids de usuarios ajenos', !txtA.includes(B.id) && !txtA.includes(C.id))
  check('el cliente de B aparece solo como "Cliente de otro broker"', gA.json.paraMiPortafolio?.some((m) => m.perfilId === cliB.id && m.contraparte === 'Cliente de otro broker'))

  const gC = await api(C)
  check('comprador ve coincidencias', gC.status === 200 && gC.json.coincidencias?.some((m) => m.activoId === casaA.id))
  const txtC = JSON.stringify(gC.json)
  check('al comprador NO se le revelan brokers', !txtC.includes(A.nombre) && !txtC.includes(B.nombre) && !txtC.includes(A.id))

  const sin = await api(null)
  check('sin sesión → 401', sin.status === 401)
  const gOp = await api(OP)
  check('Operación no usa esta API (403)', gOp.status === 403)

  // ── API: solicitudes ─────────────────────────────────────────────────────────────────────
  const pOk = await api(A, 'POST', { activoId: casaB.id, perfilId: cliA.id })
  check('A pide conexión de su cliente con la casa de B', pOk.status === 200 && pOk.json.estado === 'solicitado', JSON.stringify(pOk.json))
  const pAjeno = await api(A, 'POST', { activoId: casaB.id, perfilId: cliB.id })
  check('A NO puede pedir conexión entre partes ajenas', pAjeno.status === 403)
  const { data: casaMala } = await admin.from('activos').insert({ ...casa(A, 'Terreno A', 9_000_000), tipo: 'Terreno' }).select('id').single()
  const pBajo = await api(A, 'POST', { activoId: casaMala.id, perfilId: cliA.id })
  check('POST rechaza un match que no alcanza el umbral', pBajo.status === 422)
  const pDup = await api(A, 'POST', { activoId: casaB.id, perfilId: cliA.id })
  check('pedirlo dos veces no duplica', pDup.status === 200)
  const { data: filas } = await admin.from('matches').select('id').eq('activo_id', casaB.id).eq('perfil_id', cliA.id)
  check('existe exactamente una solicitud', filas?.length === 1)

  // ── RLS de matches ───────────────────────────────────────────────────────────────────────
  const { error: eIns } = await A.cli.from('matches').insert({ activo_id: casaA.id, perfil_id: cliA.id, solicitado_por: A.id, score: 100 })
  check('nadie inserta en matches directo (solo vía API)', !!eIns, eIns?.message)
  const { data: verA } = await A.cli.from('matches').select('id').eq('activo_id', casaB.id)
  check('A ve la solicitud que hizo', verA?.length === 1)
  const { data: verB } = await B.cli.from('matches').select('id').eq('activo_id', casaB.id)
  check('B NO ve solicitudes que no hizo', (verB?.length ?? 0) === 0)
  await A.cli.from('matches').update({ estado: 'en_contacto' }).eq('activo_id', casaB.id)
  const { data: est } = await admin.from('matches').select('estado').eq('activo_id', casaB.id).single()
  check('A NO puede cambiar el estado de su solicitud', est?.estado === 'solicitado')
  const { error: eOp } = await OP.cli.from('matches').update({ estado: 'en_contacto' }).eq('activo_id', casaB.id)
  const { data: est2 } = await admin.from('matches').select('estado').eq('activo_id', casaB.id).single()
  check('Operación pone en contacto', !eOp && est2?.estado === 'en_contacto', eOp?.message)

  // ── Cierres ──────────────────────────────────────────────────────────────────────────────
  // Igual que portal-broker: insert SIN .select()
  const cierre = (b, activoId, extra = {}) => ({
    activo_id: activoId, broker_id: b.id, precio_cierre: 9_000_000, fecha_cierre: '2026-10-06', origen_comprador: 'otro_broker', ...extra,
  })
  const { error: eC1 } = await A.cli.from('cierres_reportados').insert(cierre(A, casaA.id))
  check('broker reporta el cierre de su propiedad', !eC1, eC1?.message)
  const { error: eC2 } = await A.cli.from('cierres_reportados').insert(cierre(A, casaB.id))
  check('broker NO reporta el cierre de una propiedad ajena', !!eC2, eC2?.message)
  const { error: eC3 } = await A.cli.from('cierres_reportados').insert(cierre(A, casaA.id, { estado: 'verificado' }))
  check('broker NO puede reportar un cierre ya verificado', !!eC3, eC3?.message)
  const { data: miC } = await A.cli.from('cierres_reportados').select('id, estado').eq('activo_id', casaA.id)
  check('broker ve su cierre', miC?.length === 1 && miC[0].estado === 'pendiente')
  await A.cli.from('cierres_reportados').update({ estado: 'verificado' }).eq('activo_id', casaA.id)
  const { data: cTras } = await admin.from('cierres_reportados').select('estado').eq('activo_id', casaA.id)
  check('broker NO puede autoverificarse', cTras?.every((c) => c.estado === 'pendiente'))
  const { data: verCB } = await B.cli.from('cierres_reportados').select('id').eq('activo_id', casaA.id)
  check('otro broker NO ve el cierre', (verCB?.length ?? 0) === 0)
  const { error: eV } = await OP.cli.from('cierres_reportados').update({ estado: 'verificado', verificado_at: new Date().toISOString() }).eq('activo_id', casaA.id)
  const { data: cV } = await admin.from('cierres_reportados').select('estado').eq('activo_id', casaA.id).single()
  check('Operación verifica el cierre', !eV && cV?.estado === 'verificado', eV?.message)

  // ── anon ─────────────────────────────────────────────────────────────────────────────────
  const { count: nM } = await anon().from('matches').select('*', { count: 'exact', head: true })
  const { count: nC } = await anon().from('cierres_reportados').select('*', { count: 'exact', head: true })
  check('anon NO ve matches ni cierres', !nM && !nC, `matches=${nM} cierres=${nC}`)
}

async function limpiar() {
  for (const id of usuariosCreados) {
    const { data: acts } = await admin.from('activos').select('id').eq('usuario_id', id)
    for (const a of acts || []) {
      await admin.from('cierres_reportados').delete().eq('activo_id', a.id)
      await admin.from('matches').delete().eq('activo_id', a.id)
    }
    await admin.from('perfiles_intencion').delete().eq('broker_id', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('activos').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  const { data: restos } = await admin.from('activos').select('id').like('nombre', `%${sufijo}`)
  console.log(`\nLimpieza: ${usuariosCreados.length} cuentas temporales borradas; activos de prueba restantes: ${restos?.length ?? '?'}`)
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
