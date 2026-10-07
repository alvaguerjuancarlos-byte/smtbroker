// Verifica contra la base REAL el paso 6 del plan V6.3: ficha de venta, página pública, visitas,
// «Me interesa» con calificación, y fotos (migración 20261008000500_ficha_publica_leads.sql).
// Hace una llamada real al Agente de Mercado y otra al de Ficha. Crea y borra sus datos.
//
// Uso: BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/verificar-ficha-leads.mjs

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const sufijo = randomUUID().slice(0, 8)
const PASS = randomUUID() + 'Aa1!'
const creados = []
let activoId = null
let fallas = 0
const check = (n, ok, d = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? `  (${d})` : ''}`) }

async function cuenta(rol) {
  const email = `ficha-${rol}-${randomUUID().slice(0, 6)}-${sufijo}@prueba.smtbroker.mx`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
  if (error) throw new Error(error.message)
  creados.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre: `${rol} ${sufijo}`, rol })
  const cli = anon()
  const { data: s } = await cli.auth.signInWithPassword({ email, password: PASS })
  return { id: data.user.id, cli, token: s.session.access_token }
}
const api = (u, ruta, body) => fetch(`${BASE}${ruta}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + u.token } : {}) },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
const pagina = (id) => fetch(`${BASE}/p/${id}`).then(async (r) => ({ status: r.status, html: await r.text() }))
const lead = (extra = {}) => api(null, '/api/leads', {
  activoId, nombre: 'Interesado Prueba', contacto: 'interesado@ejemplo.mx', presupuesto: '$10M – $20M',
  plazo: 'menos_3m', formaPago: 'contado', aceptaAviso: true, ...extra,
})
// PNG de 1×1 px.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function main() {
  for (const t of ['leads', 'visitas_publicas']) {
    const { error } = await admin.from(t).select('id').limit(1)
    if (error) throw new Error(`falta la tabla ${t} -- aplica primero la migración 20261008000500 (${error.message})`)
  }
  const P = await cuenta('propietario')
  const X = await cuenta('propietario')

  await P.cli.from('activos').insert({
    usuario_id: P.id, nombre: `Casa ficha ${sufijo}`, tipo: 'Casa', colonia: 'Valle Oriente', municipio: 'San Pedro Garza García',
    estado: 'Nuevo León', direccion: 'Calle Secreta 123', status: 'ingresado', precio_total: 12_000_000, superficie: 350,
    folio_real: 'FOLIO-SECRETO-99', propietario_nombre: null,
  })
  activoId = (await admin.from('activos').select('id').eq('usuario_id', P.id).single()).data.id

  // ── Ficha de venta ───────────────────────────────────────────────────────────────────────
  check('ficha sin diagnóstico de mercado → 409', (await api(P, '/api/agentes/ficha', { activoId })).status === 409)
  console.log('      (corriendo Agente de Mercado y de Ficha reales…)')
  const merc = await api(P, '/api/agentes/mercado', { activoId })
  check('diagnóstico de mercado', merc.status === 200, merc.json.error)
  const f1 = await api(P, '/api/agentes/ficha', { activoId })
  check('genera la ficha de venta', f1.status === 200 && !!f1.json.titular && Array.isArray(f1.json.puntosFuertes), f1.json.titular ?? f1.json.error)
  const f2 = await api(P, '/api/agentes/ficha', { activoId })
  check('la segunda vez devuelve la guardada', f2.json._guardado?.id === f1.json._guardado?.id && f2.json._guardado?.nuevo === false)
  check('otro usuario no obtiene la ficha', (await api(X, '/api/agentes/ficha', { activoId })).status === 404)

  // ── Página pública ───────────────────────────────────────────────────────────────────────
  check('sin publicar: /p no existe', (await pagina(activoId)).status === 404)
  check('sin publicar: no cuenta visitas', (await api(null, '/api/publico/visita', { activoId })).status === 404)
  check('sin publicar: no recibe leads', (await lead()).status === 404)

  const { error: ePub } = await P.cli.from('activos').update({ publicada_at: new Date().toISOString() }).eq('id', activoId)
  check('el dueño publica la página', !ePub, ePub?.message)
  const pg = await pagina(activoId)
  check('publicada: /p responde 200', pg.status === 200)
  check('muestra el titular de la ficha', pg.html.includes(f1.json.titular.replace(/&/g, '&amp;').slice(0, 20)) || pg.html.includes(f1.json.titular.slice(0, 20)))
  check('NO muestra folio real ni dirección', !pg.html.includes('FOLIO-SECRETO-99') && !pg.html.includes('Calle Secreta'))
  check('incluye el botón «Me interesa»', pg.html.includes('Me interesa'))

  check('registra una visita', (await api(null, '/api/publico/visita', { activoId })).status === 200)
  const { data: vP } = await P.cli.from('visitas_publicas').select('id').eq('activo_id', activoId)
  check('el dueño ve sus visitas', vP?.length === 1)
  const { data: vX } = await X.cli.from('visitas_publicas').select('id').eq('activo_id', activoId)
  check('otro usuario no las ve', (vX || []).length === 0)

  // ── «Me interesa» ────────────────────────────────────────────────────────────────────────
  check('sin aceptar el aviso → 400', (await lead({ aceptaAviso: false })).status === 400)
  check('contacto inválido → 400', (await lead({ contacto: 'hola' })).status === 400)
  const trampa = await lead({ sitio_web: 'http://spam.example' })
  check('campo trampa: responde OK pero no guarda', trampa.status === 200)
  const l1 = await lead()
  check('lead válido', l1.status === 200, l1.json.error)
  const l2 = await lead({ nombre: 'Curioso Prueba', presupuesto: 'Menos de $5M', plazo: 'sin_definir', formaPago: 'no_se' })
  check('segundo lead', l2.status === 200)
  const { data: lsP } = await P.cli.from('leads').select('nombre, categoria, razones').eq('activo_id', activoId)
  check('el dueño ve 2 leads (el de la trampa no se guardó)', lsP?.length === 2, `filas=${lsP?.length}`)
  check('calificación: Serio', lsP?.find((x) => x.nombre === 'Interesado Prueba')?.categoria === 'serio')
  check('calificación: Curioso', lsP?.find((x) => x.nombre === 'Curioso Prueba')?.categoria === 'curioso')
  check('cada lead trae sus razones', (lsP || []).every((x) => Array.isArray(x.razones) && x.razones.length >= 3))
  const { data: lsX } = await X.cli.from('leads').select('id').eq('activo_id', activoId)
  check('otro usuario no ve los leads', (lsX || []).length === 0)
  const { error: eAnon } = await anon().from('leads').insert({ activo_id: activoId, nombre: 'x', contacto: 'x', plazo: 'menos_3m', forma_pago: 'contado', categoria: 'serio', consentimiento_at: new Date().toISOString() })
  check('nadie inserta leads saltándose el servidor', !!eAnon, eAnon?.message)

  for (let i = 0; i < 3; i++) await lead({ nombre: `Repetido ${i}` })
  const exceso = await lead({ nombre: 'Uno de más' })
  check('límite: el 6.º envío en una hora → 429', exceso.status === 429, `status ${exceso.status}`)

  // ── Fotos ────────────────────────────────────────────────────────────────────────────────
  const ruta = `${activoId}/prueba-${sufijo}.png`
  const { error: eFoto } = await P.cli.storage.from('fotos-activos').upload(ruta, PNG, { contentType: 'image/png' })
  check('el dueño sube una foto', !eFoto, eFoto?.message)
  const { error: eFotoX } = await X.cli.storage.from('fotos-activos').upload(`${activoId}/intruso-${sufijo}.png`, PNG, { contentType: 'image/png' })
  check('otro usuario NO puede subir fotos a esta propiedad', !!eFotoX, eFotoX?.message)
  const publica = admin.storage.from('fotos-activos').getPublicUrl(ruta).data.publicUrl
  check('la foto se ve por su URL pública', (await fetch(publica)).status === 200)
  check('la página pública muestra la foto', (await pagina(activoId)).html.includes(`prueba-${sufijo}.png`))

  await P.cli.from('activos').update({ publicada_at: null }).eq('id', activoId)
  check('al despublicar, /p deja de existir', (await pagina(activoId)).status === 404)
}

async function limpiar() {
  if (activoId) {
    const { data } = await admin.storage.from('fotos-activos').list(activoId)
    if (data?.length) await admin.storage.from('fotos-activos').remove(data.map((f) => `${activoId}/${f.name}`))
  }
  for (const id of creados) {
    await admin.from('activos').delete().eq('usuario_id', id) // leads, visitas y diagnósticos caen en cascada
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
