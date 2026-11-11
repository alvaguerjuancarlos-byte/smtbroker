// Prueba de punta a punta de la lectura de anuncios de portal (opción 2, 10-nov-2026) contra la base
// real, en el MUNDO DEMO, con cuentas temporales que se borran al final. Necesita la migración
// 20261113000000 y la app en el puerto 3011. Lee páginas reales (Spot2, Inmuebles24, Vivanuncios).
// Uso: node --env-file=.env.local scripts/verificar-lectura-anuncios.mjs <carpeta-para-capturas>
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'
const out = process.argv[2]
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ts = Date.now()
const INICIO = new Date().toISOString()
const PASS = 'PruebaLect-' + ts
const correo = (q) => `${q}-lect-${ts}@demo.smtbroker.mx`
const limpiar = []
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const LIGAS = {
  spot2: 'https://spot2.mx/spots/bodega-industrial-en-venta-alberta-escamilla-apodaca/167709',
  inmuebles24: 'https://www.inmuebles24.com/propiedades/clasificado/veclbcin-bodega-en-venta-en-apodaca-n.-l-151188497.html',
  listado: 'https://www.vivanuncios.com.mx/s-venta-bodegas/apodaca/v1c33l14832p1',
}

async function registrar(q, nombre) {
  const r = await fetch(BASE + '/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiere: 'comprar', nombre, email: correo(q), password: PASS, telefono: '8112345678',
      necesidad: { tipo: 'bodega', municipio: 'Apodaca', presupuesto_min: 10e6, presupuesto_max: 30e6, proposito: 'invertir', caracteristicas: { m2_min: 800 }, busqueda_directa: false } }),
  })
  const { data } = await admin.from('usuarios').select('id').eq('nombre', nombre).eq('es_demo', true)
  limpiar.push(data[0].id)
  const cli = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: s } = await cli.auth.signInWithPassword({ email: correo(q), password: PASS })
  return { ok: r.ok, id: data[0].id, tk: s.session.access_token }
}
const api = async (tk, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}

let b
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/empezar')).ok) break } catch {} await espera(2000) }
  const c = await registrar('comprador', 'Lectura Prueba')
  const otro = await registrar('otro', 'Lectura Otro')
  ok(c.ok && otro.ok, 'compradores registrados (sin búsqueda directa, para que el Radar solo tenga las ligas de la prueba)')

  // 1. Pega tres ligas: la plataforma las lee en segundo plano.
  for (const u of Object.values(LIGAS)) ok((await api(c.tk, '/api/radar', { url: u })).status === 200, `liga pegada: ${u.slice(8, 40)}`)
  const anuncios = {}
  for (const [k, u] of Object.entries(LIGAS)) {
    let a = null
    for (let i = 0; i < 45; i++) {
      const { data } = await admin.from('radar_anuncios').select('id, lectura, precio, superficie, colonia, datos').eq('url', u).eq('es_demo', true).maybeSingle()
      a = data; if (a?.lectura) break; await espera(2000)
    }
    anuncios[k] = a
  }
  ok(anuncios.spot2?.lectura === 'leido' && anuncios.spot2.precio > 1e6 && anuncios.spot2.superficie > 100, `Spot2 leído: ${anuncios.spot2?.precio} · ${anuncios.spot2?.superficie} m² · ${anuncios.spot2?.colonia}`)
  ok(anuncios.inmuebles24?.lectura === 'bloqueado', `Inmuebles24 bloqueado (no se evade): ${anuncios.inmuebles24?.lectura}`)
  ok(anuncios.listado?.lectura === 'listado', `página de resultados detectada: ${anuncios.listado?.lectura}`)
  const datos = JSON.stringify(anuncios)
  ok(!/telefono|whatsapp|correo|@/i.test(datos.replace(/"datos":\{[^}]*\}/g, (m) => m.replace(/descartados/, ''))), 'no se guardó nada del anunciante')

  // 2. La bandeja trae lo leído; leer de nuevo no repite la lectura.
  const g = await api(c.tk, '/api/necesidades')
  const op = (k) => g.j.bandeja.find((o) => o.anuncioId === anuncios[k].id)
  ok(op('spot2')?.precio === anuncios.spot2.precio && op('spot2')?.lectura === 'leido', 'la bandeja muestra precio y m² leídos')
  let r = await api(c.tk, `/api/radar/${op('spot2').opcionId}/datos`, { accion: 'leer' })
  ok(r.status === 200 && r.j.nueva === false, 'leer de nuevo no vuelve a abrir la página')

  // 3. Captura donde el portal bloqueó; nadie más puede capturar.
  r = await api(c.tk, `/api/radar/${op('inmuebles24').opcionId}/datos`, { accion: 'capturar', precio: '', superficie: '1100' })
  ok(r.status === 400, 'captura sin precio se rechaza')
  r = await api(otro.tk, `/api/radar/${op('inmuebles24').opcionId}/datos`, { accion: 'capturar', precio: '21000000', superficie: '1100' })
  ok(r.status === 404, 'otro comprador no puede capturar en un anuncio ajeno')
  r = await api(c.tk, `/api/radar/${op('inmuebles24').opcionId}/datos`, { accion: 'capturar', precio: '21,000,000', superficie: '1100' })
  const { data: cap } = await admin.from('radar_anuncios').select('lectura, precio, superficie').eq('id', anuncios.inmuebles24.id).single()
  ok(r.status === 200 && cap.lectura === 'capturado' && cap.precio === 21_000_000 && cap.superficie === 1100, 'el comprador escribe precio y m² del anuncio bloqueado')

  // 4. Análisis de anuncios.
  r = await api(c.tk, '/api/analisis', { anuncioId: anuncios.listado.id })
  ok(r.status === 409, `una página de resultados sin precio no se analiza (${r.j.error})`)
  r = await api(otro.tk, '/api/analisis', { anuncioId: anuncios.spot2.id })
  ok(r.status === 403, 'otro comprador no puede analizar un anuncio que no está en su bandeja')
  r = await api(c.tk, '/api/analisis', { anuncioId: anuncios.spot2.id })
  ok(r.status === 200, 'analiza el anuncio de Spot2')
  r = await api(c.tk, '/api/analisis', { anuncioId: anuncios.inmuebles24.id })
  ok(r.status === 200, 'analiza el anuncio de Inmuebles24 con los datos capturados')
  const { data: an } = await admin.from('analisis').select('id, activo_id, anuncio_id, por_tipo, resultado').eq('usuario_id', c.id)
  const a1 = an.find((x) => x.anuncio_id === anuncios.spot2.id)
  ok(a1 && a1.activo_id === null && a1.resultado.origen?.portal && a1.resultado.mercado?.semaforo && a1.resultado.plusvalia && a1.resultado.cumplimiento, `análisis completo del anuncio: ${a1?.resultado.mercado.semaforo.estado ?? 'sin dato'} · cumple ${a1?.resultado.cumplimiento?.cumple}/${a1?.resultado.cumplimiento?.verificables}`)
  const lista = await api(c.tk, '/api/analisis')
  ok(lista.j.analisis.length === 2 && lista.j.analisis.every((x) => x.anuncio_id), 'el comparativo trae los dos anuncios')
  ok((await api(c.tk, '/api/conexiones', { activoId: anuncios.spot2.id })).status === 404, '"Quiero verla" no aplica a un anuncio de portal')
  r = await api(c.tk, `/api/analisis/${a1.id}`, { accion: 'pedir_certificacion' })
  const { data: inv } = await admin.from('radar_anuncios').select('invitacion_estado').eq('id', anuncios.spot2.id).single()
  ok(r.status === 200 && inv.invitacion_estado === 'pendiente', 'pedir certificación pone la invitación al anunciante en la fila de Operación')
  const g2 = await api(c.tk, '/api/necesidades')
  ok(g2.j.analizados.includes(anuncios.spot2.id), 'la bandeja sabe que el anuncio ya se analizó')

  // 5. Capturas de pantalla: la bandeja y el análisis del anuncio.
  b = await puppeteer.launch({ headless: true })
  const p = await b.newPage(); await p.setViewport({ width: 420, height: 900 })
  await p.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await p.type('input[type="email"]', correo('comprador')); await p.type('input[type="password"]', PASS)
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.keyboard.press('Enter')])
  await p.goto(BASE + '/inicio', { waitUntil: 'networkidle2' })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('tu bandeja'), { timeout: 30000 })
  await p.evaluate(() => [...document.querySelectorAll('span')].find((x) => x.innerText.toLowerCase().startsWith('tu bandeja'))?.scrollIntoView())
  await espera(800)
  await p.screenshot({ path: `${out}/lect-1-bandeja.png`, fullPage: true })
  await p.goto(`${BASE}/analisis#${anuncios.spot2.id}`, { waitUntil: 'networkidle2' })
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('ver el anuncio original'), { timeout: 30000 })
  await espera(1000)
  await p.screenshot({ path: `${out}/lect-2-analisis.png`, fullPage: true })
} catch (e) {
  console.log('ERROR', e?.message ?? e)
  process.exitCode = 1
} finally {
  if (b) await b.close()
  for (const id of limpiar) {
    await admin.from('analisis').delete().eq('usuario_id', id)
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', id)
    for (const x of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', x.id)
    for (const t of ['necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(t).delete().eq('usuario_id', id)
    await admin.from('usuarios').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  await admin.from('radar_anuncios').delete().eq('es_demo', true).gte('created_at', INICIO)
  console.log(`limpieza: ${limpiar.length} cuentas y los anuncios de la prueba borrados`)
}
