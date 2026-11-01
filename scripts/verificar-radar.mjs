// Verifica contra la base REAL el Radar de mercado, fase 1 (Documento Maestro V7.1 §18; migración
// 20261101000100_radar_mercado.sql; app/api/radar, app/api/radar/[id], app/api/operacion/radar).
//
// Escenario (mundo real): dos compradores por su cuenta (C1, C2), un comprador con broker (CB),
// un broker (B), un propietario (P) y Operación (OP). Crea todo y lo borra al final.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-radar.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
const anuncios = new Set()
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }

async function cuenta(rol, nombre, extra = {}) {
  const email = `radar-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(`crear ${rol}: ${error.message}`)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${nombre} ${sufijo}`, rol, ...extra })
  const cli = anon()
  const { data: s, error: e3 } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (e3) throw new Error(`login ${rol}: ${e3.message}`)
  return { id: data.user.id, email, cli, token: s.session.access_token }
}
const api = (u, ruta, body, method = 'POST') => fetch(`${BASE}${ruta}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
const perfil = async (u, extra = {}) => {
  await admin.from('perfiles_intencion').insert({
    usuario_id: u.id, presupuesto: '$5M – $15M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Casa', fuente_captura: 'registro_directo', ...extra,
  })
  return (await admin.from('perfiles_intencion').select('id').eq('usuario_id', u.id).single()).data.id
}

async function main() {
  const { error: eTabla } = await admin.from('radar_anuncios').select('id').limit(1)
  if (eTabla) throw new Error(`falta la migración 20261101000100 (${eTabla.message})`)

  const C1 = await cuenta('inversionista', 'Compradora Uno')
  const C2 = await cuenta('inversionista', 'Comprador Dos')
  const CB = await cuenta('inversionista', 'Comprador con broker')
  const B = await cuenta('broker', 'Broker')
  const P = await cuenta('propietario', 'Propietario')
  const OP = await cuenta('broker_maestro', 'Operacion')
  const perfil1 = await perfil(C1)
  const perfil2 = await perfil(C2)
  const perfilB = await perfil(CB, { representado_por: B.id })

  const liga = `https://www.inmuebles24.com/propiedades/casa-prueba-${sufijo}.html`

  // ── Fuente 1: el comprador pega una liga ────────────────────────────────────────────────
  check('una liga inválida → 400', (await api(C1, '/api/radar', { url: 'casa bonita en del valle' })).status === 400)
  const p1 = await api(C1, '/api/radar', { url: `${liga}?utm_source=fb&fbclid=abc#fotos`, nota: 'Me gustó el jardín' })
  check('el comprador pega la liga de un anuncio', p1.status === 200, JSON.stringify(p1.json))
  const { data: an } = await admin.from('radar_anuncios').select('id, url, fuente, invitacion_estado').eq('url', liga)
  an?.forEach((a) => anuncios.add(a.id))
  check('se guarda la liga limpia (sin rastreo) y su fuente', an?.length === 1 && an[0].fuente === 'inmuebles24.com', JSON.stringify(an))
  check('queda por invitar', an?.[0]?.invitacion_estado === 'pendiente')
  await api(C2, '/api/radar', { url: `${liga}?utm_campaign=otra` })
  const { count: nAn } = await admin.from('radar_anuncios').select('id', { count: 'exact', head: true }).eq('url', liga)
  const { count: nOp } = await admin.from('radar_opciones').select('id', { count: 'exact', head: true }).eq('anuncio_id', an[0].id)
  check('otro comprador con la misma liga se suma al mismo anuncio', nAn === 1 && nOp === 2, `anuncios=${nAn} opciones=${nOp}`)

  const g1 = await api(C1, '/api/radar', null, 'GET')
  const o1 = (g1.json.opciones || []).find((o) => o.url === liga)
  check('el comprador ve su opción como "Invitación en camino"', o1?.estado === 'Invitación en camino' && o1.interesado && o1.nota === 'Me gustó el jardín', JSON.stringify(o1))
  check('…sin datos del anunciante', !JSON.stringify(g1.json).includes('anunciante'))
  const gB = await api(CB, '/api/radar', null, 'GET')
  check('el comprador con broker no tiene Radar (su broker busca)', gB.status === 409 && gB.json.conBroker === true)
  check('un broker no tiene Radar de comprador', (await api(B, '/api/radar', null, 'GET')).status === 403)

  // ── Operación ────────────────────────────────────────────────────────────────────────────
  check('quien no es Operación no ve la consola del Radar', (await api(P, '/api/operacion/radar', null, 'GET')).status === 403)
  const og = await api(OP, '/api/operacion/radar', null, 'GET')
  const oa = (og.json.anuncios || []).find((a) => a.id === an[0].id)
  check('Operación ve el anuncio con 2 compradores interesados', oa?.interesados === 2 && oa.compradores.length === 2, JSON.stringify(oa).slice(0, 200))
  check('…y el mensaje de invitación listo, sin la palabra "gratis"', /2 compradores están interesados/.test(oa?.mensaje ?? '') && !/gratis/i.test(oa?.mensaje ?? ''))
  const lista = (og.json.compradores || []).map((c) => c.perfilId)
  check('para agregar opciones solo lista compradores por su cuenta', lista.includes(perfil1) && lista.includes(perfil2) && !lista.includes(perfilB))

  // ── Fuente 2: Operación agrega una opción que encontró ──────────────────────────────────
  const liga2 = `https://casas.mitula.mx/anuncio-${sufijo}`
  const a2 = await api(OP, '/api/operacion/radar', { perfilId: perfil1, url: liga2, titulo: 'Casa en Valle Oriente', precio: '8900000', tipo: 'Casa', municipio: 'San Pedro Garza García' })
  check('Operación agrega una opción al Radar de C1', a2.status === 200, JSON.stringify(a2.json))
  if (a2.json.anuncioId) anuncios.add(a2.json.anuncioId)
  check('no se le agregan opciones al cliente de un broker', (await api(OP, '/api/operacion/radar', { perfilId: perfilB, url: liga2 })).status === 409)
  const g2 = await api(C1, '/api/radar', null, 'GET')
  const o2 = (g2.json.opciones || []).find((o) => o.url === liga2)
  check('C1 la ve sugerida, "No certificada" y sin pedir aún', o2?.origen === 'operacion' && o2.estado === 'No certificada' && !o2.interesado && o2.precio === 8900000, JSON.stringify(o2))
  check('otro comprador no puede marcar la opción de C1', (await api(C2, `/api/radar/${o2?.id}`)).status === 404)
  check('C1 dice "Me interesa"', (await api(C1, `/api/radar/${o2?.id}`)).status === 200)
  const { data: an2 } = await admin.from('radar_anuncios').select('invitacion_estado').eq('id', a2.json.anuncioId).single()
  check('…y el anuncio queda por invitar', an2?.invitacion_estado === 'pendiente')

  // ── Invitación ───────────────────────────────────────────────────────────────────────────
  check('quien no es Operación no actualiza la invitación', (await api(C1, '/api/operacion/radar', { anuncioId: an[0].id, invitacion_estado: 'enviada' }, 'PATCH')).status === 403)
  const e1 = await api(OP, '/api/operacion/radar', { anuncioId: an[0].id, anunciante_contacto: '81 1234 5678', invitacion_canal: 'whatsapp', invitacion_estado: 'enviada' }, 'PATCH')
  const { data: env } = await admin.from('radar_anuncios').select('anunciante_contacto, invitacion_canal, invitacion_enviada_at').eq('id', an[0].id).single()
  check('Operación registra la invitación enviada con su canal y contacto', e1.status === 200 && env.anunciante_contacto === '81 1234 5678' && env.invitacion_canal === 'whatsapp' && !!env.invitacion_enviada_at, JSON.stringify(env))
  check('el comprador ve "Invitación enviada al anunciante"', (await api(C2, '/api/radar', null, 'GET')).json.opciones?.[0]?.estado === 'Invitación enviada al anunciante')
  const { data: rlsC } = await C1.cli.from('radar_anuncios').select('id').eq('id', an[0].id)
  check('un comprador no lee la tabla del Radar directo (RLS)', (rlsC || []).length === 0)
  const { data: rlsOP } = await OP.cli.from('radar_anuncios').select('anunciante_contacto').eq('id', an[0].id)
  check('Operación sí (RLS)', rlsOP?.[0]?.anunciante_contacto === '81 1234 5678')

  const { data: act } = await admin.from('activos').insert({
    usuario_id: P.id, nombre: `Casa del anunciante ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León', status: 'valoracion',
  }).select('id').single()
  const e2 = await api(OP, '/api/operacion/radar', { anuncioId: an[0].id, invitacion_estado: 'aceptada', activo_id: act.id }, 'PATCH')
  const { data: acep } = await admin.from('radar_anuncios').select('anunciante_contacto, invitacion_estado, activo_id').eq('id', an[0].id).single()
  check('al aceptar se liga la propiedad y se BORRA el contacto del anunciante', e2.status === 200 && acep.invitacion_estado === 'aceptada' && acep.activo_id === act.id && acep.anunciante_contacto === null, JSON.stringify(acep))
  check('el comprador ve "Aceptó: se está certificando"', (await api(C1, '/api/radar', null, 'GET')).json.opciones?.find((o) => o.url === liga)?.estado === 'Aceptó: se está certificando')
  await admin.from('certificaciones').insert({ activo_id: act.id, solicitado_por: P.id, estado: 'certificada' })
  const fin = (await api(C1, '/api/radar', null, 'GET')).json.opciones?.find((o) => o.url === liga)
  check('ya certificada, el comprador lo ve así', fin?.certificada === true && fin.estado === 'Ya certificada: aparece en tus coincidencias', JSON.stringify(fin))

  // ── Límite ───────────────────────────────────────────────────────────────────────────────
  for (let i = 0; i < 9; i++) {
    const r = await api(C1, '/api/radar', { url: `https://ejemplo.mx/anuncio-${sufijo}-${i}` })
    if (r.status !== 200) break
  }
  const { data: extra } = await admin.from('radar_anuncios').select('id').like('url', `https://ejemplo.mx/anuncio-${sufijo}-%`)
  extra?.forEach((a) => anuncios.add(a.id))
  check('límite: la liga 11 del día → 429', (await api(C1, '/api/radar', { url: `https://ejemplo.mx/una-mas-${sufijo}` })).status === 429)
}

async function limpiar() {
  if (anuncios.size) await admin.from('radar_anuncios').delete().in('id', [...anuncios]) // opciones en cascada
  await admin.from('radar_anuncios').delete().like('url', `%${sufijo}%`)
  for (const id of creados) {
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('activos').delete().eq('usuario_id', id) // certificaciones en cascada
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`\nLimpieza: ${creados.length} cuentas temporales y ${anuncios.size} anuncios borrados.`)
}

main()
  .catch((e) => { fallas++; console.error('ERROR', e.message) })
  .finally(async () => {
    await limpiar()
    console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
    process.exit(fallas ? 1 : 0)
  })
