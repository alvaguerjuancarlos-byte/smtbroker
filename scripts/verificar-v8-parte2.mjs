// Prueba de punta a punta de la V8 Parte 2 (análisis del comprador, Documento Maestro §20) contra la
// base real, en el MUNDO DEMO, con cuentas y propiedades temporales que se borran al final. Necesita
// las migraciones 20261110000000 y 20261111000000 aplicadas y la app en el puerto 3011.
// Uso: node --env-file=.env.local scripts/verificar-v8-parte2.mjs <carpeta-para-capturas>
// Hace búsquedas reales de comparables (Serper + Claude): cuesta unos centavos por corrida.
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const PASS = 'PruebaV8-' + ts
const correoComprador = `comprador-v8b-${ts}@demo.smtbroker.mx`
const correoBroker = `broker-v8b-${ts}@demo.smtbroker.mx`
const limpiar = { usuarios: [], activos: [] }
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function sesion(email) {
  const cli = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await cli.auth.signInWithPassword({ email, password: PASS })
  if (error) throw error
  return { cli, tk: data.session.access_token }
}
const api = async (tk, ruta, metodo = 'GET', cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }

  // Broker demo con una bodega que cumple (Apodaca, 1,100 m², $7.5M) y cinco propiedades de apoyo.
  const { data: bu, error: eb } = await admin.auth.admin.createUser({ email: correoBroker, password: PASS, email_confirm: true })
  if (eb) throw eb
  const brokerId = bu.user.id
  limpiar.usuarios.push(brokerId)
  await admin.from('usuarios').upsert({ id: brokerId, nombre: 'Broker Prueba V8b', rol: 'broker', es_demo: true })
  const nueva = async (campos, deBroker = true) => {
    const base = deBroker
      ? { cargado_por: 'broker', broker_id: brokerId, representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(), propietario_nombre: 'Propietario Prueba' }
      : { cargado_por: 'propietario' }
    const { data, error } = await admin.from('activos').insert({ usuario_id: brokerId, estado: 'Nuevo León', status: 'ingresado', ...base, ...campos }).select('id').single()
    if (error) throw error
    limpiar.activos.push(data.id)
    return data.id
  }
  const bodega = await nueva({ nombre: 'Bodega Prueba V8b Apodaca', tipo: 'Bodega', municipio: 'Apodaca', superficie: 1100, precio_total: 7_500_000 })
  const apoyo = []
  for (let i = 0; i < 5; i++) apoyo.push(await nueva({ nombre: `Bodega Apoyo V8b ${i + 1}`, tipo: 'Bodega', municipio: 'Apodaca', superficie: 1000, precio_total: 7_000_000 }, false))

  // 1. Comprador registrado con su ficha (para invertir: dispara el rendimiento por renta).
  let r = await fetch(BASE + '/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quiere: 'comprar', nombre: 'Patricia Prueba B', email: correoComprador, password: PASS, telefono: '8112345678',
      necesidad: { tipo: 'bodega', municipio: 'Apodaca', presupuesto_min: 6e6, presupuesto_max: 8e6, forma_pago: 'contado', plazo: 'ya', proposito: 'invertir', caracteristicas: { m2_min: 1000, andenes: 2 } },
    }),
  })
  ok(r.ok, `comprador registrado (${r.status})`)
  const { data: cu } = await admin.from('usuarios').select('id').eq('nombre', 'Patricia Prueba B').eq('es_demo', true)
  const compradorId = cu[0].id
  limpiar.usuarios.push(compradorId)
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', compradorId)
  const necesidadId = nec[0].id
  const comprador = await sesion(correoComprador)
  const broker = await sesion(correoBroker)

  // 2. El broker propone; el precio contra mercado se calcula al proponer (§20.5 regla 4).
  r = await api(broker.tk, '/api/propuestas', 'POST', { necesidadId, activoId: bodega, aceptoTerminos: true })
  ok(r.status === 200, `propuesta enviada (${r.status} ${r.j.error ?? ''})`)
  let pm = null
  for (let i = 0; i < 40 && !pm; i++) {
    await espera(2000)
    const { data } = await admin.from('propuestas').select('precio_mercado').eq('activo_id', bodega).maybeSingle()
    pm = data?.precio_mercado
  }
  ok(!!pm, `precio contra mercado calculado al proponer (${pm ? `${pm.precio.comparablesUsados} comparables, ${pm.semaforo.estado ?? 'sin dato'}` : 'no llegó'})`)
  const panel = await api(broker.tk, '/api/necesidades')
  const dp = panel.j.necesidades.find((n) => n.id === necesidadId)?.detallePropuestas?.[0]
  ok(dp && 'precioMercado' in dp && dp.precioMercado !== undefined, `el broker ve el precio contra mercado de su propuesta (${dp?.precioMercado?.texto?.slice(0, 60) ?? 'null'})`)

  // 3. Comprador: "Me interesa" desde su bandeja → análisis.
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 420, height: 900 })
  await p.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await p.type('input[type="email"]', correoComprador); await p.type('input[type="password"]', PASS)
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.keyboard.press('Enter')])
  await p.goto(BASE + '/inicio', { waitUntil: 'networkidle2' })
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Me interesa'), { timeout: 30000 })
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Me interesa').click())
  await p.waitForFunction(() => location.pathname === '/analisis', { timeout: 120000 })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('precio contra mercado'), { timeout: 30000 })
  await espera(800)
  await p.screenshot({ path: `${out}/p2-1-analisis.png`, fullPage: true })
  const t = (await p.evaluate(() => document.body.innerText)).toLowerCase()
  ok(t.includes('plusvalía · proyección') && t.includes('en 5 años'), 'muestra la plusvalía a 3 y 5 años como proyección')
  ok(t.includes('¿cumple lo que buscas? · 4 de 4') && t.includes('andenes de carga'), 'cumplimiento: 4 de 4 verificables y los andenes por confirmar')
  ok(t.includes('costo total de compra'), 'muestra el costo total de compra')
  ok(t.includes('si la rentas'), 'muestra el rendimiento por renta (compra para invertir)')
  ok(t.includes('no revisada legalmente'), 'sin certificar: "no revisada legalmente"')

  const { data: an } = await admin.from('analisis').select('id, por_tipo, resultado').eq('usuario_id', compradorId)
  ok(an.length === 1 && an[0].por_tipo && an[0].resultado.porTipo?.renta, 'análisis guardado con el análisis por tipo y la renta')
  const analisisId = an[0].id

  // 4. Privacidad: ni el broker de la propiedad ni otro usuario leen el análisis (RLS).
  const { data: vistoBroker } = await broker.cli.from('analisis').select('id')
  ok((vistoBroker ?? []).length === 0, 'el broker no puede leer el análisis del comprador')
  const { data: vistoComprador } = await comprador.cli.from('analisis').select('id')
  ok((vistoComprador ?? []).length === 1, 'el comprador sí lo lee')
  const { data: avisos } = await admin.from('propuestas').select('id').eq('activo_id', bodega)
  ok(avisos.length === 1, 'marcar "Me interesa" no crea nada visible para el broker')

  // 5. Reglas: propiedad ajena, pedir certificación, tope de 5 a la vez y tope mensual por tipo.
  r = await api(comprador.tk, '/api/analisis', 'POST', { activoId: '9eaa5046-8416-44fd-9fee-b192da73ce19' })
  ok(r.status === 403, `una propiedad de broker que no le propusieron se rechaza (${r.status})`)
  r = await api(comprador.tk, `/api/analisis/${analisisId}`, 'POST', { accion: 'pedir_certificacion' })
  ok(r.status === 200, 'pedir que se certifique')
  r = await api(comprador.tk, `/api/analisis/${analisisId}`, 'POST', { accion: 'pedir_certificacion' })
  ok(r.j.yaPedida === true, 'la segunda vez no vuelve a avisar')

  const falso = (activoId) => ({ usuario_id: compradorId, activo_id: activoId, por_tipo: true, resultado: { activo: { id: activoId } } })
  await admin.from('analisis').insert(apoyo.slice(0, 4).map(falso))
  r = await api(comprador.tk, '/api/analisis', 'POST', { activoId: apoyo[4] })
  ok(r.status === 409, `la sexta propiedad del comparativo se rechaza (${r.j.error})`)
  r = await api(comprador.tk, `/api/analisis/${analisisId}`, 'PATCH', { descartar: true })
  ok(r.status === 200, 'quitar del comparativo')
  // Este mes ya hay 5 propiedades con análisis por tipo (la bodega y 4 de apoyo): la siguiente va sin él.
  const { data: n6 } = await admin.from('activos').insert({ usuario_id: brokerId, cargado_por: 'propietario', estado: 'Nuevo León', status: 'ingresado', nombre: 'Bodega Apoyo V8b 6', tipo: 'Bodega', municipio: 'Apodaca', superficie: 1000, precio_total: 7_000_000 }).select('id').single()
  limpiar.activos.push(n6.id)
  await admin.from('analisis').update({ descartado: true }).eq('usuario_id', compradorId).eq('activo_id', apoyo[0])
  r = await api(comprador.tk, '/api/analisis', 'POST', { activoId: n6.id })
  const { data: a6 } = await admin.from('analisis').select('por_tipo, resultado').eq('usuario_id', compradorId).eq('activo_id', n6.id).single()
  ok(r.status === 200 && a6.por_tipo === false && !!a6.resultado.topeMensual, 'pasado el tope de 5 al mes, el análisis es el básico (sin análisis por tipo)')

  const g = await api(comprador.tk, '/api/necesidades')
  ok(Array.isArray(g.j.analizados), `la bandeja sabe qué ya analizó (${g.j.analizados?.length})`)
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
  if (b) for (const [i, pg] of (await b.pages()).entries()) {
    await pg.screenshot({ path: `${out}/p2-error-${i}.png`, fullPage: true }).catch(() => {})
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
