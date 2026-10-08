// Verifica contra la base REAL el paso 4 del plan V6.3: diagnóstico en dos niveles y certificación
// legal (migración 20261008000200_certificaciones.sql, app/api/diagnostico-rapido,
// app/api/certificaciones, app/api/agentes/legal restringido a Operación + certificación en revisión).
// Desde 2026-10-07 la certificación es GRATIS con límite de 3 al mes (migración 20261008000600):
// solicitud → en_revision → Operación corre el dictamen y cierra por app/api/operacion/certificacion.
//
// Hace UNA llamada real al Agente Legal y UNA al de Mercado (Claude + Serper) para comprobar los
// modelos nuevos (lib/modelos.ts). Crea cuentas y un activo temporales y los borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-certificacion.mjs

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

async function cuenta(rol, esDemo = false) {
  const email = `cert-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  usuariosCreados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol, es_demo: esDemo })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, cli, token: s.session.access_token }
}

const api = (u, ruta, body) => fetch(`${BASE}${ruta}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

async function main() {
  const { error } = await admin.from('certificaciones').select('id').limit(1)
  if (error) throw new Error(`falta la tabla certificaciones -- aplica primero la migración 20261008000200 (${error.message})`)

  const P = await cuenta('propietario')
  const X = await cuenta('broker')
  const OP = await cuenta('broker_maestro')
  const OPD = await cuenta('broker_maestro', true)

  // Casa en Valle Oriente (San Pedro), expediente vacío -- como queda un alta normal.
  const { error: eIns } = await P.cli.from('activos').insert({
    usuario_id: P.id, nombre: `Casa prueba cert ${sufijo}`, tipo: 'Casa', direccion: 'Av. Prueba 100',
    colonia: 'Valle Oriente', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
    superficie: 400, precio_total: 14_000_000, status: 'ingresado', lat: 25.6517, lng: -100.3586,
    gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'no_determinado',
  })
  check('propietario crea su activo', !eIns, eIns?.message)
  const { data: act } = await admin.from('activos').select('id').eq('usuario_id', P.id).single()
  const activoId = act.id

  // ── Diagnóstico rápido ───────────────────────────────────────────────────────────────────
  const r1 = await api(P, '/api/diagnostico-rapido', { activoId })
  check('rápido responde 200', r1.status === 200, JSON.stringify(r1.json).slice(0, 150))
  check('rápido: faltan 4 documentos con expediente vacío', r1.json.faltantes?.length === 4,
    (r1.json.faltantes || []).map((f) => f.campo).join(','))
  check('rápido: no listo para certificar', r1.json.listoParaCertificar === false)
  check('rápido: sin certificación', r1.json.certificacion === null)
  console.log(`      (uso de suelo GIS: ${r1.json.usoSuelo ? `${r1.json.usoSuelo.uso} — ${r1.json.usoSuelo.descripcion}` : 'sin dato'})`)
  check('rápido: un broker ajeno no lo ve', (await api(X, '/api/diagnostico-rapido', { activoId })).status === 404)

  // ── Dictamen legal: ya no corre fuera de una certificación en revisión ────────────────────────
  check('legal: el dueño no puede generar dictamen', (await api(P, '/api/agentes/legal', { activoId, regenerar: true })).status === 403)
  check('legal: sin dictamen guardado, tampoco corre al abrir', (await api(P, '/api/agentes/legal', { activoId })).status === 403)

  // ── Solicitud de certificación ───────────────────────────────────────────────────────────
  const c0 = await api(P, '/api/certificaciones', { activoId })
  check('certificación rechazada con expediente incompleto (422)', c0.status === 422 && c0.json.faltantes?.length === 4)

  const { error: eUpd } = await P.cli.from('activos').update({
    folio_real: 'FR-PRUEBA-1', escritura_publica: 'si', clave_catastral: '01-002-003',
    gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'habitacional', estado_documentacion_legal: 'completa',
  }).eq('id', activoId)
  check('propietario completa su expediente', !eUpd, eUpd?.message)
  const r2 = await api(P, '/api/diagnostico-rapido', { activoId })
  check('rápido: expediente completo → listo para certificar', r2.json.listoParaCertificar === true && r2.json.faltantes.length === 0)

  check('un broker ajeno no puede pedir la certificación', (await api(X, '/api/certificaciones', { activoId })).status === 404)
  const c1 = await api(P, '/api/certificaciones', { activoId })
  check('propietario solicita la certificación', c1.status === 200 && c1.json.certificacion?.estado === 'en_revision')
  const c2 = await api(P, '/api/certificaciones', { activoId })
  check('una segunda solicitud no duplica', c2.json.yaExistia === true && c2.json.certificacion?.id === c1.json.certificacion?.id)
  const certId = c1.json.certificacion.id

  const { error: eIns2 } = await P.cli.from('certificaciones').insert({ activo_id: activoId, solicitado_por: P.id, estado: 'certificada' })
  check('el dueño no puede insertar certificaciones directo (BD)', !!eIns2, eIns2?.message)
  await P.cli.from('certificaciones').update({ estado: 'certificada' }).eq('id', certId)
  const { data: tras } = await admin.from('certificaciones').select('estado').eq('id', certId).single()
  check('el dueño no puede autocertificarse (BD)', tras.estado === 'en_revision')

  // ── Operación ────────────────────────────────────────────────────────────────────────────
  check('Operación demo no ve un activo real', (await api(OPD, '/api/agentes/legal', { activoId, regenerar: true })).status === 404)
  check('el dueño no puede generar el dictamen, aun en revisión', (await api(P, '/api/agentes/legal', { activoId, regenerar: true })).status === 403)

  console.log('      (corriendo el Agente Legal real, ~1 min…)')
  const dict = await api(OP, '/api/agentes/legal', { activoId, regenerar: true })
  check('Operación genera el dictamen (modelo nuevo)', dict.status === 200 && !!dict.json.verdictTitle && !!dict.json._guardado?.id,
    dict.status === 200 ? `${dict.json.verdictBadge} · score ${dict.json.score}` : JSON.stringify(dict.json).slice(0, 200))
  const { data: guardado } = await admin.from('diagnosticos').select('modelo').eq('id', dict.json._guardado?.id ?? randomUUID()).maybeSingle()
  check('el dictamen guardado registra el modelo', guardado?.modelo === 'claude-opus-5-5', guardado?.modelo)

  check('el dueño no puede cerrar la certificación', (await api(P, '/api/operacion/certificacion', { certificacionId: certId, estado: 'certificada', dictamenId: dict.json._guardado?.id })).status === 403)
  check('certificar sin dictamen → 400', (await api(OP, '/api/operacion/certificacion', { certificacionId: certId, estado: 'certificada' })).status === 400)
  const cierre = await api(OP, '/api/operacion/certificacion', { certificacionId: certId, estado: 'certificada', dictamenId: dict.json._guardado?.id })
  check('Operación certifica', cierre.status === 200, cierre.json.error)
  check('no se puede cerrar dos veces', (await api(OP, '/api/operacion/certificacion', { certificacionId: certId, estado: 'rechazada' })).status === 409)
  const r3 = await api(P, '/api/diagnostico-rapido', { activoId })
  check('el dueño ve su propiedad certificada', r3.json.certificacion?.estado === 'certificada')
  const lect = await api(P, '/api/agentes/legal', { activoId })
  check('el dueño lee el dictamen guardado', lect.status === 200 && lect.json._guardado?.id === dict.json._guardado?.id)

  // ── Límite: 3 gratis al mes (Pioneros sin límite) ─────────────────────────────────────────
  // Ya pidió 1 este mes. Se siembran 2 más (otras propiedades suyas) y la 4.ª debe rechazarse.
  const completo = { folio_real: 'FR', escritura_publica: 'si', clave_catastral: 'CC', gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'habitacional' }
  const extra = []
  for (let k = 0; k < 3; k++) {
    const { data: a } = await admin.from('activos').insert({ usuario_id: P.id, nombre: `Extra ${k} ${sufijo}`, tipo: 'Casa', municipio: 'Monterrey', estado: 'Nuevo León', status: 'ingresado', ...completo }).select('id').single()
    extra.push(a.id)
  }
  check('2.ª certificación del mes', (await api(P, '/api/certificaciones', { activoId: extra[0] })).status === 200)
  check('3.ª certificación del mes', (await api(P, '/api/certificaciones', { activoId: extra[1] })).status === 200)
  const cuarta = await api(P, '/api/certificaciones', { activoId: extra[2] })
  check('4.ª del mes → límite (429)', cuarta.status === 429, cuarta.json.error)
  await admin.from('usuarios').update({ pionero: true }).eq('id', P.id)
  check('un Pionero no tiene límite', (await api(P, '/api/certificaciones', { activoId: extra[2] })).status === 200)

  // ── Agente de Mercado con los modelos nuevos ─────────────────────────────────────────────
  console.log('      (corriendo el Agente de Mercado real…)')
  const merc = await api(P, '/api/agentes/mercado', { activoId, regenerar: true })
  check('Agente de Mercado responde con el modelo nuevo', merc.status === 200 && typeof merc.json.interpretacion === 'string',
    merc.status === 200 ? `${merc.json.comparablesAnalizados} comparables` : JSON.stringify(merc.json).slice(0, 200))
}

async function limpiar() {
  for (const id of usuariosCreados) {
    await admin.from('activos').delete().eq('usuario_id', id) // certificaciones y diagnósticos caen en cascada
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
