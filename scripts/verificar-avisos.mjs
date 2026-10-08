// Verifica el paso 2 del plan V6.3: avisos por correo (lib/avisos.ts) en los cinco eventos, SIN
// mandar correos reales. Levanta un receptor local que imita la API de Resend y captura cada envío.
//
// El servidor de Next debe arrancarse apuntando al receptor:
//   RESEND_API_KEY=prueba RESEND_API_URL=http://localhost:4010/emails OPERACION_EMAIL=operacion@prueba.smtbroker.mx \
//     npx next start -p 3001
// y luego:
//   BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-avisos.mjs
//
// Crea cuentas, activos y datos temporales (mundo real y uno demo) y los borra al final.

import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const OPERACION = 'operacion@prueba.smtbroker.mx'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Receptor que imita a Resend ──────────────────────────────────────────────────────────────
const correos = []
const receptor = http.createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (c) => { cuerpo += c })
  req.on('end', () => {
    try { correos.push({ auth: req.headers.authorization, ...JSON.parse(cuerpo) }) } catch { /* ignorar */ }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"prueba"}')
  })
})
await new Promise((r) => receptor.listen(4010, r))
const nuevos = async (desde) => { await pausa(2500); return correos.slice(desde) }

async function cuenta(rol, extra = {}) {
  const email = `avisos-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol, ...extra })
  const cli = anon()
  const { data: s } = await cli.auth.signInWithPassword({ email, password: PASS })
  return { id: data.user.id, email, cli, token: s.session.access_token }
}
const api = (u, ruta, body) => fetch(`${BASE}${ruta}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + u.token } : {}) },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
const casaBroker = (b, n) => ({
  usuario_id: b.id, broker_id: b.id, cargado_por: 'broker', propietario_nombre: 'Prop', representacion_tipo: 'exclusiva',
  representacion_declarada_at: new Date().toISOString(), nombre: `${n} ${sufijo}`, tipo: 'Casa',
  municipio: 'San Pedro Garza García', estado: 'Nuevo León', status: 'valoracion', precio_total: 9_000_000,
})

async function main() {
  const P = await cuenta('propietario')
  const B = await cuenta('broker', { pionero: true })
  const D = await cuenta('broker', { es_demo: true })

  const { data: casaB } = await admin.from('activos').insert(casaBroker(B, 'Casa del broker')).select('id').single()
  const { data: casaD } = await admin.from('activos').insert(casaBroker(D, 'Casa demo')).select('id').single()
  const { data: casaP } = await admin.from('activos').insert({
    usuario_id: P.id, nombre: `Casa propietario ${sufijo}`, tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León',
    status: 'ingresado', precio_total: 12_000_000, folio_real: 'FR-1', escritura_publica: 'si', clave_catastral: '01-1',
    gravamenes_conocidos: 'ninguno', uso_suelo_declarado: 'habitacional',
  }).select('id').single()

  // 1. Certificación solicitada → Operación
  let i = correos.length
  check('certificación solicitada', (await api(P, '/api/certificaciones', { activoId: casaP.id })).status === 200)
  let c = await nuevos(i)
  check('→ aviso a Operación', c.length === 1 && c[0].to[0] === OPERACION && c[0].subject.startsWith('Certificación solicitada'), c.map((x) => x.subject).join(' | '))
  check('→ remitente y llave correctos', c[0]?.from?.includes('notificaciones@mail.mindbridge.com.mx') && c[0]?.auth === 'Bearer prueba')

  // 1b. Operación certifica → quien la pidió (dictamen sembrado: aquí no se prueba el agente)
  const OP = await cuenta('broker_maestro')
  const { data: dic } = await admin.from('diagnosticos').insert({ activo_id: casaP.id, agente: 'legal', modelo: 'prueba', resultado: { verdictTitle: 'Prueba' } }).select('id').single()
  const { data: certP } = await admin.from('certificaciones').select('id').eq('activo_id', casaP.id).eq('estado', 'en_revision').single()
  i = correos.length
  check('Operación certifica', (await api(OP, '/api/operacion/certificacion', { certificacionId: certP.id, estado: 'certificada', dictamenId: dic.id })).status === 200)
  c = await nuevos(i)
  check('→ aviso «Certificada» a quien la pidió', c.length === 1 && c[0].to[0] === P.email && c[0].subject.startsWith('Certificada'), c.map((x) => `${x.to} ${x.subject}`).join(' | '))

  // 2. Oportunidad → broker elegido
  i = correos.length
  check('oportunidad ofrecida', (await api(P, '/api/oportunidades', { activoId: casaP.id, brokerId: B.id })).status === 200)
  c = await nuevos(i)
  check('→ aviso al broker elegido', c.length === 1 && c[0].to[0] === B.email && c[0].subject.startsWith('Nueva oportunidad'), c.map((x) => `${x.to} ${x.subject}`).join(' | '))

  // 3. Solicitud de conexión (match) → Operación
  await admin.from('perfiles_intencion').insert({
    usuario_id: null, broker_id: B.id, alias_cliente: `Cliente ${sufijo}`, presupuesto: '$5M – $15M', zona: 'San Pedro',
    tipo_activo_interes: 'Casa', consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
  })
  const { data: perfil } = await admin.from('perfiles_intencion').select('id').eq('broker_id', B.id).single()
  i = correos.length
  const m = await api(B, '/api/matches', { activoId: casaB.id, perfilId: perfil.id })
  check('solicitud de conexión', m.status === 200, JSON.stringify(m.json))
  c = await nuevos(i)
  check('→ aviso a Operación', c.length === 1 && c[0].to[0] === OPERACION && c[0].subject.startsWith('Nueva solicitud de conexión'))

  // 4. Cierre reportado (ahora por el servidor) → Operación
  const ajeno = await api(P, '/api/cierres', { activoId: casaB.id, precio: 9_000_000, fecha: '2026-10-01', origen: 'mi_cliente' })
  check('un no-broker no puede reportar cierres', ajeno.status === 403)
  i = correos.length
  const cie = await api(B, '/api/cierres', { activoId: casaB.id, precio: 8_900_000, fecha: '2026-10-01', origen: 'mi_cliente' })
  check('el broker reporta un cierre', cie.status === 200, cie.json.error)
  c = await nuevos(i)
  check('→ aviso a Operación', c.length === 1 && c[0].to[0] === OPERACION && c[0].subject.startsWith('Cierre por verificar'))
  const { data: rep } = await admin.from('cierres_reportados').select('estado').eq('activo_id', casaB.id).single()
  const { data: est } = await admin.from('activos').select('status').eq('id', casaB.id).single()
  check('el cierre queda pendiente y el activo cerrado', rep?.estado === 'pendiente' && est?.status === 'cerrado')

  // 5. Leads → quien representa la propiedad (+ Operación si es Serio)
  await admin.from('activos').update({ publicada_at: new Date().toISOString() }).eq('id', casaP.id)
  const lead = (extra) => api(null, '/api/leads', {
    activoId: casaP.id, nombre: 'Interesado', contacto: '8112345678', presupuesto: '$10M – $20M',
    plazo: 'menos_3m', formaPago: 'contado', aceptaAviso: true, ...extra,
  })
  i = correos.length
  check('lead Serio', (await lead({})).status === 200)
  c = await nuevos(i)
  const destinos = c.map((x) => x.to[0]).sort()
  check('→ aviso al propietario (aún sin broker) y a Operación', destinos.length === 2 && destinos.includes(P.email) && destinos.includes(OPERACION), destinos.join(','))
  check('→ el correo no incluye el contacto del interesado', c.every((x) => !x.html.includes('8112345678') && !x.text.includes('8112345678')))
  i = correos.length
  check('lead Curioso', (await lead({ presupuesto: 'Menos de $5M', plazo: 'sin_definir', formaPago: 'no_se' })).status === 200)
  c = await nuevos(i)
  check('→ solo al propietario (no a Operación)', c.length === 1 && c[0].to[0] === P.email, c.map((x) => x.to[0]).join(','))

  // 6. Solicitud de registro desde /bienvenida → Operación
  const correoSolicitud = `solicitud-${sufijo}@prueba.smtbroker.mx`
  const solicitud = (extra = {}) => api(null, '/api/solicitudes', {
    nombre: 'Broker Interesado', email: correoSolicitud, telefono: '8112345678', rol: 'broker',
    empresa: 'Inmobiliaria Prueba', datos: { experiencia: '5 años', zona: 'San Pedro' }, ...extra,
  })
  i = correos.length
  check('solicitud de registro', (await solicitud()).status === 200)
  c = await nuevos(i)
  check('→ aviso a Operación', c.length === 1 && c[0].to[0] === OPERACION && c[0].subject.startsWith('Nueva solicitud de registro'), c.map((x) => x.subject).join(' | '))
  const { data: guardada } = await admin.from('solicitudes').select('status, rol').eq('email', correoSolicitud)
  check('→ la solicitud queda pendiente', guardada?.length === 1 && guardada[0].status === 'pendiente' && guardada[0].rol === 'broker')
  i = correos.length
  check('campo trampa: OK sin guardar', (await solicitud({ sitio_web: 'http://spam.example' })).status === 200)
  c = await nuevos(i)
  const { data: tras } = await admin.from('solicitudes').select('id').eq('email', correoSolicitud)
  check('→ sin guardar ni avisar', tras?.length === 1 && c.length === 0)
  check('rol inválido → 400', (await solicitud({ rol: 'broker_maestro' })).status === 400)
  await solicitud(); await solicitud()
  check('4.ª solicitud del mismo correo en una hora → 429', (await solicitud()).status === 429)

  // 7. Mundo demo: nunca envía
  i = correos.length
  check('cierre de un broker demo', (await api(D, '/api/cierres', { activoId: casaD.id, precio: 9_000_000, fecha: '2026-10-01', origen: 'mi_cliente' })).status === 200)
  c = await nuevos(i)
  check('→ el mundo demo no manda correos', c.length === 0, `${c.length} correos`)
}

async function limpiar() {
  await admin.from('solicitudes').delete().like('email', `%-${sufijo}@prueba.smtbroker.mx`)
  for (const id of creados) {
    await admin.from('perfiles_intencion').delete().eq('broker_id', id)
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
    receptor.close()
    console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
    process.exit(fallas ? 1 : 0)
  })
