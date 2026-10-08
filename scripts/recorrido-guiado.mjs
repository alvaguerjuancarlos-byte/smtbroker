// Recorrido guiado en el MUNDO DEMO (2026-10-07): cuenta la historia de SMTBROKER con pantallas
// reales para el storyboard del video v6 y para validar la plataforma. Actores: Ricardo
// (propietario), Diego (broker, Pionero), Patricia (compradora), un visitante sin sesión y
// Operación (demo). El mundo demo no manda correos ni se cruza con datos reales (lib/mundo.ts).
//
// Hace dos llamadas reales a la IA (ficha de venta y dictamen legal). Toma "foto" de todo lo que
// toca y lo RESTAURA al final, aunque algo falle.
//
// Uso: BASE_URL=https://smtbroker.vercel.app node --env-file=.env.local scripts/recorrido-guiado.mjs <carpeta-salida>

import puppeteer from 'puppeteer'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const OUT = process.argv[2] ?? 'scripts/capturas-recorrido'
mkdirSync(OUT, { recursive: true })
const PASS = readFileSync('scripts/seed-demo.mjs', 'utf8').match(/PASSWORD_DEMO = '([^']+)'/)[1]
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const INICIO = new Date().toISOString()
const escenas = []
const errores = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CUENTAS = {
  ricardo: 'ricardo.villarreal@demo.smtbroker.mx',
  diego: 'diego.salinas@demo.smtbroker.mx',
  patricia: 'patricia.longoria@demo.smtbroker.mx',
  operacion: 'operacion@demo.smtbroker.mx',
}

// ── Datos que se tocan (para restaurar) ─────────────────────────────────────────────────────
const uid = async (email) => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
  return data.users.find((u) => u.email === email).id
}
const ids = {}
for (const [k, e] of Object.entries(CUENTAS)) ids[k] = await uid(e)
const { data: terreno } = await admin.from('activos').select('*').eq('usuario_id', ids.ricardo).eq('nombre', 'Terreno Valle Poniente').single()
const { data: diegoAntes } = await admin.from('usuarios').select('pionero').eq('id', ids.diego).single()
const { data: cierresDiego } = await admin.from('cierres_reportados').select('id, estado, verificado_at').eq('broker_id', ids.diego)
const CAMPOS = ['broker_id', 'folio_real', 'escritura_publica', 'clave_catastral', 'gravamenes_conocidos', 'uso_suelo_declarado', 'estado_documentacion_legal', 'publicada_at', 'status']
const foto = { terreno: Object.fromEntries(CAMPOS.map((c) => [c, terreno[c]])), pionero: diegoAntes.pionero, cierres: cierresDiego }
writeFileSync(join(OUT, 'foto.json'), JSON.stringify(foto, null, 2))

async function restaurar() {
  const id = terreno.id
  await admin.from('oportunidades').delete().eq('activo_id', id)
  await admin.from('certificaciones').delete().eq('activo_id', id)
  await admin.from('leads').delete().eq('activo_id', id)
  await admin.from('visitas_publicas').delete().eq('activo_id', id)
  await admin.from('diagnosticos').delete().eq('activo_id', id).gte('created_at', INICIO)
  await admin.from('matches').delete().gte('created_at', INICIO).in('solicitado_por', Object.values(ids))
  await admin.from('activos').update(foto.terreno).eq('id', id)
  await admin.from('usuarios').update({ pionero: foto.pionero }).eq('id', ids.diego)
  for (const c of foto.cierres) await admin.from('cierres_reportados').update({ estado: c.estado, verificado_at: c.verificado_at }).eq('id', c.id)
  console.log('Restaurado: Terreno Valle Poniente, Diego (Pionero y cierres), oportunidades, certificación, leads, visitas, matches y diagnósticos nuevos.')
}

// ── Navegador ───────────────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ defaultViewport: { width: 1280, height: 800 } })
async function sesion(cuenta) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(`${cuenta}: ${e.message}`))
  if (cuenta !== 'visitante') {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
    await page.type('input[type="email"]', CUENTAS[cuenta])
    await page.type('input[type="password"]', PASS)
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  }
  return page
}
const esperar = (page, t, timeout = 30000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout }, t).then(() => true, () => false)
async function clic(page, texto, dentroDe) {
  const ok = await page.evaluate((t, d) => {
    const esBoton = (x) => x.innerText.trim() === t || x.innerText.trim().startsWith(t)
    // El contenedor más chico que tiene el texto `d` Y un botón con la etiqueta.
    const raiz = d ? [...document.querySelectorAll('div')]
      .filter((x) => x.innerText.includes(d) && [...x.querySelectorAll('button, a')].some(esBoton))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0] : document
    const b = [...(raiz ?? document).querySelectorAll('button, a')].find(esBoton)
    if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true }
    return false
  }, texto, dentroDe)
  if (!ok) throw new Error(`no encontré el botón «${texto}»${dentroDe ? ` en «${dentroDe}»` : ''}`)
  await sleep(1200)
}
// Captura la pantalla con el texto `ancla` arriba (o el inicio de la página).
async function escena(page, n, actor, ancla) {
  if (ancla) {
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll('h1,h2,h3,h4,p,span,button')].find((x) => x.innerText.trim().toLowerCase().startsWith(t.toLowerCase()))
      if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -110) }
    }, ancla)
  } else await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(700)
  const archivo = `${String(escenas.length + 1).padStart(2, '0')}-${n}.jpg`
  await page.screenshot({ path: join(OUT, archivo), type: 'jpeg', quality: 74 })
  escenas.push({ archivo, actor })
  console.log(`  ✓ ${archivo}`)
}

try {
  // Preparación del mundo demo: Diego es Pionero y su cierre vuelve a "por verificar" (empieza en Plata).
  await admin.from('usuarios').update({ pionero: true }).eq('id', ids.diego)
  for (const c of cierresDiego) await admin.from('cierres_reportados').update({ estado: 'pendiente', verificado_at: null }).eq('id', c.id)

  console.log('Apertura')
  const vis = await sesion('visitante')
  await vis.goto(`${BASE}/bienvenida`, { waitUntil: 'networkidle2' })
  await escena(vis, 'bienvenida', 'todos')

  console.log('Ricardo (propietario)')
  const ric = await sesion('ricardo')
  await ric.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' })
  await escena(ric, 'ricardo-mis-activos', 'propietario')
  await ric.goto(`${BASE}/activo/${terreno.id}`, { waitUntil: 'domcontentloaded' })
  await esperar(ric, 'Precio de salida recomendado', 120000)
  await esperar(ric, 'Para certificar te falta')
  await escena(ric, 'ricardo-diagnostico', 'propietario')
  await escena(ric, 'ricardo-expediente', 'propietario', 'Uso de suelo y expediente legal')
  await admin.from('activos').update({
    folio_real: 'FR-847231', escritura_publica: 'si', clave_catastral: '19-045-012', gravamenes_conocidos: 'ninguno',
    uso_suelo_declarado: 'habitacional', estado_documentacion_legal: 'completa',
  }).eq('id', terreno.id)
  await ric.reload({ waitUntil: 'domcontentloaded' })
  await esperar(ric, 'Expediente completo')
  await clic(ric, 'Solicitar certificación legal')
  await esperar(ric, 'Certificación en revisión')
  await escena(ric, 'ricardo-certificacion-en-revision', 'propietario', 'Uso de suelo y expediente legal')
  await esperar(ric, 'Diego Salinas')
  await escena(ric, 'ricardo-elige-broker', 'propietario', 'Elige un broker certificado')
  await clic(ric, 'Elegir', 'Diego Salinas')
  await esperar(ric, 'Esperando respuesta de')
  await escena(ric, 'ricardo-esperando', 'propietario', 'Elige un broker certificado')

  console.log('Diego (broker)')
  const die = await sesion('diego')
  await esperar(die, 'Oportunidades')
  await escena(die, 'diego-portal', 'broker')
  await clic(die, 'Mi desempeño')
  await esperar(die, 'Para subir a')
  await escena(die, 'diego-desempeno-plata', 'broker', 'Broker Certificado SMT')
  await clic(die, 'Oportunidades')
  await esperar(die, 'Terreno Valle Poniente')
  await escena(die, 'diego-oportunidad', 'broker')
  await clic(die, 'Aceptar y representar')
  await esperar(die, 'Aceptada')
  await clic(die, 'Mis clientes')
  await sleep(1000)
  await escena(die, 'diego-clientes', 'broker')
  await clic(die, 'Matches')
  await esperar(die, 'Coincid', 30000)
  await sleep(1500)
  await escena(die, 'diego-matches', 'broker')
  await die.goto(`${BASE}/activo/${terreno.id}/marketing`, { waitUntil: 'domcontentloaded' })
  await esperar(die, 'Generar ficha de venta')
  await clic(die, 'Generar ficha de venta')
  await esperar(die, 'Puntos fuertes', 180000)
  await escena(die, 'diego-ficha', 'broker', 'Ficha de venta')
  await clic(die, 'Publicar página')
  await esperar(die, 'Compartir por WhatsApp')
  await escena(die, 'diego-publicar', 'broker', 'Página pública')

  console.log('Visitante (comprador sin cuenta)')
  await vis.goto(`${BASE}/p/${terreno.id}`, { waitUntil: 'networkidle2' })
  await escena(vis, 'publica-pagina', 'visitante')
  const llenar = async (presupuesto, plazo, pago, nombre, contacto) => {
    await vis.goto(`${BASE}/p/${terreno.id}`, { waitUntil: 'networkidle2' })
    await clic(vis, 'Me interesa esta propiedad')
    await vis.type('input[placeholder="Tu nombre"]', nombre)
    await vis.type('input[placeholder^="Correo o WhatsApp"]', contacto)
    const s = await vis.$$('form select')
    await s[0].select(presupuesto); await s[1].select(plazo); await s[2].select(pago)
    await vis.click('form input[type="checkbox"]')
  }
  await llenar('$10M – $20M', 'menos_3m', 'contado', 'Laura Treviño', '8112345678')
  await escena(vis, 'publica-me-interesa', 'visitante', 'Me interesa')
  await clic(vis, 'Enviar')
  await esperar(vis, 'Recibimos tu interés')
  await llenar('Menos de $5M', 'sin_definir', 'no_se', 'Jorge Ruiz', 'jorge.ruiz@ejemplo.mx')
  await clic(vis, 'Enviar')
  await esperar(vis, 'Recibimos tu interés')

  await die.goto(`${BASE}/activo/${terreno.id}/leads`, { waitUntil: 'domcontentloaded' })
  await esperar(die, 'Laura Treviño')
  await escena(die, 'diego-leads', 'broker')

  console.log('Patricia (compradora)')
  const pat = await sesion('patricia')
  await esperar(pat, 'Coinciden con lo que buscas')
  await sleep(2500)
  await escena(pat, 'patricia-coincidencias', 'comprador', 'Coinciden con lo que buscas')
  await clic(pat, 'Me interesa')
  await esperar(pat, 'Solicitado')
  await escena(pat, 'patricia-solicitado', 'comprador', 'Coinciden con lo que buscas')

  console.log('Operación (demo)')
  const op = await sesion('operacion')
  await esperar(op, 'Matches por validar')
  await sleep(2000)
  await escena(op, 'operacion-validacion', 'operacion', 'Matches por validar')
  await clic(op, 'Poner en contacto')
  await clic(op, 'Correr dictamen')
  await esperar(op, 'Score legal', 240000)
  await escena(op, 'operacion-dictamen', 'operacion', 'Certificaciones legales')
  await clic(op, 'Certificar')
  await sleep(1500)
  await clic(op, 'Verificar', 'Reportó Diego')
  await sleep(1500)

  await ric.goto(`${BASE}/activo/${terreno.id}`, { waitUntil: 'domcontentloaded' })
  await esperar(ric, 'Inventario certificado')
  await sleep(3000)
  await escena(ric, 'ricardo-certificado', 'propietario')

  await die.goto(`${BASE}/portal-broker`, { waitUntil: 'networkidle2' })
  await esperar(die, 'Hola, Diego')
  await clic(die, 'Mi desempeño')
  await esperar(die, 'Nivel Oro')
  await escena(die, 'diego-desempeno-oro', 'broker', 'Broker Certificado SMT')

  writeFileSync(join(OUT, 'escenas.json'), JSON.stringify(escenas, null, 2))
  console.log(`\n${escenas.length} escenas en ${OUT}`)
} catch (e) {
  console.error('ERROR', e.message)
  errores.push(e.message)
} finally {
  await browser.close()
  await restaurar()
  console.log(errores.length ? `\nErrores: ${errores.join(' | ')}` : '\nSin errores de página')
}
