// Prueba de punta a punta de la V8 Parte 3 (conexión, Documento Maestro §21) contra la base real,
// en el MUNDO DEMO, con cuentas y propiedades temporales que se borran al final. Necesita las
// migraciones 20261110000000, 20261111000000 y 20261112000000 y la app en el puerto 3011.
// Uso: node --env-file=.env.local scripts/verificar-v8-parte3.mjs <carpeta-para-capturas>
// Dos caminos: propuesta de broker (validación automática) y particular (validación de Operación).
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaV8-' + ts
const correo = (q) => `${q}-v8c-${ts}@demo.smtbroker.mx`
const limpiar = { usuarios: [], activos: [] }
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function cuenta(q, nombre, rol) {
  const { data, error } = await admin.auth.admin.createUser({ email: correo(q), password: PASS, email_confirm: true })
  if (error) throw error
  limpiar.usuarios.push(data.user.id)
  await admin.from('usuarios').upsert({ id: data.user.id, nombre, rol, es_demo: true })
  return data.user.id
}
async function sesion(q) {
  const cli = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await cli.auth.signInWithPassword({ email: correo(q), password: PASS })
  if (error) throw error
  return { cli, tk: data.session.access_token }
}
const api = async (tk, ruta, metodo = 'GET', cuerpo, headers = {}) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { ...(tk ? { Authorization: 'Bearer ' + tk } : {}), 'Content-Type': 'application/json', ...headers }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
const accion = (tk, id, cuerpo) => api(tk, `/api/conexiones/${id}`, 'POST', cuerpo)

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }

  const brokerId = await cuenta('broker', 'Broker Prueba V8c', 'broker')
  const duenoId = await cuenta('dueno', 'Dueño Prueba V8c', 'propietario')
  await cuenta('operacion', 'Operación Prueba V8c', 'broker_maestro')
  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({ estado: 'Nuevo León', status: 'ingresado', ...campos }).select('id').single()
    if (error) throw error
    limpiar.activos.push(data.id)
    return data.id
  }
  const bodega = await nueva({ usuario_id: brokerId, broker_id: brokerId, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba', nombre: 'Bodega Prueba V8c Apodaca', tipo: 'Bodega', municipio: 'Apodaca', superficie: 1100, precio_total: 7_500_000 })
  const particular = await nueva({ usuario_id: duenoId, cargado_por: 'propietario', nombre: 'Bodega Particular V8c Apodaca', tipo: 'Bodega', municipio: 'Apodaca', superficie: 1050, precio_total: 7_200_000 })

  // Comprador con su ficha
  let r = await fetch(BASE + '/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiere: 'comprar', nombre: 'Patricia Prueba C', email: correo('comprador'), password: PASS, telefono: '8112345678',
      necesidad: { tipo: 'bodega', municipio: 'Apodaca', presupuesto_min: 6e6, presupuesto_max: 8e6, forma_pago: 'contado', plazo: 'ya', proposito: 'invertir', caracteristicas: { m2_min: 1000 } } }),
  })
  ok(r.ok, 'comprador registrado')
  const { data: cu } = await admin.from('usuarios').select('id').eq('nombre', 'Patricia Prueba C').eq('es_demo', true)
  limpiar.usuarios.push(cu[0].id)
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', cu[0].id)
  const [comprador, broker, dueno, oper] = [await sesion('comprador'), await sesion('broker'), await sesion('dueno'), await sesion('operacion')]

  // ── Camino 1: propuesta de broker → validación automática ─────────────────────────────────
  r = await api(broker.tk, '/api/propuestas', 'POST', { necesidadId: nec[0].id, activoId: bodega, aceptoTerminos: true })
  ok(r.status === 200, 'el broker propone la bodega')
  for (let i = 0; i < 40; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('activo_id', bodega).maybeSingle(); if (data?.precio_mercado) break; await espera(2000) }

  r = await api(comprador.tk, '/api/conexiones', 'POST', { activoId: bodega })
  ok(r.status === 409, `sin análisis no se puede pedir verla (${r.j.error})`)
  r = await api(comprador.tk, '/api/analisis', 'POST', { activoId: bodega })
  ok(r.status === 200, 'el comprador la analiza (Me interesa)')
  r = await api(comprador.tk, '/api/conexiones', 'POST', { activoId: bodega })
  ok(r.status === 200 && r.j.estado === 'activa', `"Quiero verla": validación automática (${r.j.estado})`)
  const c1 = r.j.id
  r = await api(comprador.tk, '/api/conexiones', 'POST', { activoId: bodega })
  ok(r.j.id === c1 && r.j.nueva === false, 'pedirla de nuevo abre la misma conexión')
  const { data: fila1 } = await admin.from('conexiones').select('aporte, contraparte_id, origen').eq('id', c1).single()
  ok(fila1.origen === 'propuesta' && fila1.contraparte_id === brokerId && fila1.aporte.propuesta?.terminos_aceptados_at && fila1.aporte.analisis?.id, 'registro de quién aportó qué: necesidad, propuesta con términos y análisis')

  let d = await api(broker.tk, `/api/conexiones/${c1}`)
  ok(d.j.partes?.comprador === 'Patricia Prueba C' && d.j.rol === 'contraparte', 'el broker ya ve el nombre del comprador')
  ok(d.j.telefonos === null, 'sin visita confirmada no hay teléfonos')
  ok(d.j.referencia === null, 'el broker no recibe el análisis del comprador')
  const { data: rlsBroker } = await broker.cli.from('conexiones').select('id')
  const { data: rlsOtro } = await dueno.cli.from('conexiones').select('id').eq('id', c1)
  ok(rlsBroker.length === 1 && rlsOtro.length === 0, 'RLS: las partes leen la conexión y un tercero no')

  ok((await accion(comprador.tk, c1, { accion: 'mensaje', texto: 'Hola, me interesa la bodega. ¿Tiene andenes?' })).status === 200, 'mensaje del comprador')
  ok((await accion(broker.tk, c1, { accion: 'mensaje', texto: 'Sí, dos andenes. ¿Cuándo le gustaría verla?' })).status === 200, 'respuesta del broker')
  const { data: rlsMens } = await broker.cli.from('mensajes').select('id').eq('conexion_id', c1)
  ok(rlsMens.length === 2, 'RLS: el broker lee la conversación')

  const manana = new Date(Date.now() + 26 * 3600_000), pasado = new Date(Date.now() + 50 * 3600_000)
  r = await accion(comprador.tk, c1, { accion: 'proponer_horarios', horarios: [new Date(Date.now() - 3600_000).toISOString()] })
  ok(r.status === 400, `un horario pasado se rechaza (${r.j.error})`)
  ok((await accion(comprador.tk, c1, { accion: 'proponer_horarios', horarios: [manana.toISOString(), pasado.toISOString()] })).status === 200, 'el comprador propone 2 horarios')
  ok((await accion(comprador.tk, c1, { accion: 'confirmar_visita', horario: manana.toISOString() })).status === 403, 'el comprador no puede confirmar su propia propuesta')
  ok((await accion(broker.tk, c1, { accion: 'confirmar_visita', horario: new Date(Date.now() + 99 * 3600_000).toISOString() })).status === 400, 'confirmar un horario no propuesto se rechaza')
  ok((await accion(broker.tk, c1, { accion: 'confirmar_visita', horario: manana.toISOString() })).status === 200, 'el broker confirma la visita')
  d = await api(comprador.tk, `/api/conexiones/${c1}`)
  ok(d.j.telefonos?.contraparte !== undefined && d.j.fase === 'visita_confirmada', `con la visita confirmada aparecen los teléfonos (${JSON.stringify(d.j.telefonos)})`)
  ok(!!d.j.referencia, 'el comprador recibe la referencia de su análisis para ofertar')

  // El cron: sin autorización se rechaza; con el user-agent del cron de Vercel, manda el recordatorio.
  ok((await api(null, '/api/cron/conexiones')).status === 401, 'el cron rechaza llamadas sin autorización')
  r = await api(null, '/api/cron/conexiones', 'GET', undefined, { 'user-agent': 'vercel-cron/1.0' })
  const { data: rec } = await admin.from('conexiones').select('recordatorio_enviado_at').eq('id', c1).single()
  ok(r.status === 200 && !!rec.recordatorio_enviado_at, `el cron marca el recordatorio de la visita de mañana (${r.j.recordatorios} enviados)`)

  ok((await accion(comprador.tk, c1, { accion: 'resultado_visita', resultado: 'quiero_ofertar' })).status === 409, '"¿cómo te fue?" antes de la visita se rechaza')
  await admin.from('conexiones').update({ visita_at: new Date(Date.now() - 20 * 3600_000).toISOString() }).eq('id', c1)
  ok((await accion(comprador.tk, c1, { accion: 'resultado_visita', resultado: 'quiero_ofertar' })).status === 200, '"¿cómo te fue?": quiero ofertar')
  ok((await accion(comprador.tk, c1, { accion: 'oferta', monto: '', formaPago: 'contado' })).status === 400, 'oferta sin monto se rechaza')
  ok((await accion(comprador.tk, c1, { accion: 'oferta', monto: '7,100,000', formaPago: 'contado' })).status === 200, 'intención de oferta enviada')
  ok((await accion(comprador.tk, c1, { accion: 'reportar_cierre', precio: 7_200_000, fecha: '2026-11-10' })).status === 403, 'el comprador no reporta el cierre')
  ok((await accion(comprador.tk, c1, { accion: 'calificar', atencion: 5, rapidez: 5, honestidad: 5 })).status === 409, 'no se califica antes del cierre')

  // Capturas de la conversación (comprador) antes del cierre.
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 420, height: 900 })
  await p.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await p.type('input[type="email"]', correo('comprador')); await p.type('input[type="password"]', PASS)
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.keyboard.press('Enter')])
  await p.goto(`${BASE}/conexion/${c1}`, { waitUntil: 'networkidle2' })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('conversación'), { timeout: 30000 })
  await espera(600)
  await p.screenshot({ path: `${out}/p3-1-conexion-comprador.png`, fullPage: true })
  const ctx = await b.createBrowserContext()
  const pb = await ctx.newPage(); await pb.setViewport({ width: 1280, height: 900 })
  await pb.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await pb.type('input[type="email"]', correo('broker')); await pb.type('input[type="password"]', PASS)
  await Promise.all([pb.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), pb.keyboard.press('Enter')])
  await pb.goto(`${BASE}/portal-broker?pestana=conexiones`, { waitUntil: 'networkidle2' })
  await pb.waitForFunction(() => document.body.innerText.includes('Bodega Prueba V8c Apodaca'), { timeout: 30000 })
  await pb.screenshot({ path: `${out}/p3-2-broker-conexiones.png` })

  ok((await accion(broker.tk, c1, { accion: 'reportar_cierre', precio: 7_200_000, fecha: '2026-11-10' })).status === 200, 'el broker reporta el cierre')
  const { data: cierre } = await admin.from('cierres_reportados').select('conexion_id, origen_comprador, estado').eq('activo_id', bodega).single()
  ok(cierre?.conexion_id === c1 && cierre.origen_comprador === 'comprador_directo' && cierre.estado === 'pendiente', 'el cierre entra a cierres_reportados ligado a la conexión')
  ok((await accion(comprador.tk, c1, { accion: 'confirmar_cierre' })).status === 200, 'el comprador confirma: doble confirmación')
  ok((await accion(comprador.tk, c1, { accion: 'calificar', atencion: 5, rapidez: 4, honestidad: 5, comentario: 'Muy claro' })).status === 200, 'el comprador califica al broker')
  ok((await accion(comprador.tk, c1, { accion: 'calificar', atencion: 5, rapidez: 4, honestidad: 5 })).status === 409, 'no califica dos veces')
  d = await api(comprador.tk, `/api/conexiones/${c1}`)
  ok(d.j.fase === 'cerrada' && d.j.calificacion?.rapidez === 4, 'conexión cerrada y calificada')
  ok((await accion(comprador.tk, c1, { accion: 'mensaje', texto: 'gracias' })).status === 409, 'cerrada ya no recibe mensajes')

  // ── Camino 2: particular → validación de Operación ────────────────────────────────────────
  r = await api(comprador.tk, '/api/analisis', 'POST', { activoId: particular })
  ok(r.status === 200, 'el comprador analiza la bodega del particular')
  r = await api(comprador.tk, '/api/conexiones', 'POST', { activoId: particular })
  ok(r.status === 200 && r.j.estado === 'por_validar', `de un particular la conexión espera a Operación (${r.j.estado})`)
  const c2 = r.j.id
  ok((await accion(comprador.tk, c2, { accion: 'mensaje', texto: 'hola' })).status === 409, 'sin validar no se puede escribir')
  ok((await accion(comprador.tk, c2, { accion: 'validar' })).status === 403, 'el comprador no puede validarla')
  const lo = await api(oper.tk, '/api/conexiones?vista=operacion')
  ok(lo.j.conexiones?.some((x) => x.id === c2), 'Operación la ve por validar')
  ok((await accion(oper.tk, c2, { accion: 'validar' })).status === 200, 'Operación la valida')
  const ld = await api(dueno.tk, '/api/conexiones')
  ok(ld.j.conexiones?.some((x) => x.id === c2 && x.rol === 'contraparte' && x.otraParte === 'Patricia Prueba C'), 'el dueño la ve con el nombre del comprador')
  await admin.from('conexiones').update({ created_at: new Date(Date.now() - 31 * 86400_000).toISOString() }).eq('id', c2)
  r = await api(null, '/api/cron/conexiones', 'GET', undefined, { 'user-agent': 'vercel-cron/1.0' })
  const { data: seg } = await admin.from('conexiones').select('seguimientos_enviados').eq('id', c2).single()
  ok(seg.seguimientos_enviados === 1, 'a los 30 días el cron pregunta "¿ya compraste?"')
  ok((await accion(comprador.tk, c2, { accion: 'compre', respuesta: 'si_esta' })).status === 200, 'el comprador dice que ya compró')
  const lo2 = await api(oper.tk, '/api/conexiones?vista=operacion')
  ok(lo2.j.conexiones?.find((x) => x.id === c2)?.alerta?.includes('nadie reportó'), 'Operación recibe la alerta: compró y nadie reportó el cierre')
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
  if (b) for (const [i, pg] of (await b.pages()).entries()) {
    await pg.screenshot({ path: `${out}/p3-error-${i}.png`, fullPage: true }).catch(() => {})
    console.log(`pagina ${i}:`, pg.url(), (await pg.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 400))
  }
} finally {
  if (b) await b.close()
  for (const id of limpiar.usuarios) await admin.from('analisis').delete().eq('usuario_id', id)
  if (limpiar.activos.length) await admin.from('activos').delete().in('id', limpiar.activos)
  for (const id of limpiar.usuarios) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', id)
    for (const x of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', x.id)
    await admin.from('necesidades').delete().eq('usuario_id', id)
    await admin.from('perfiles_intencion').delete().eq('usuario_id', id)
    await admin.from('contactos_cliente').delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`limpieza: ${limpiar.usuarios.length} cuentas y ${limpiar.activos.length} propiedades temporales borradas`)
}
