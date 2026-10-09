// Prepara los datos demo para el video v6 y los recorridos (2026-10-08, hallazgos del recorrido
// guiado). Solo toca el MUNDO DEMO:
//   - Terreno Valle Poniente (Ricardo): coordenadas reales dentro del distrito "Valle Poniente" del
//     GIS de San Pedro (uso H, habitacional unifamiliar; antes no tenía punto y el GIS no lo
//     ubicaba), colonia y un precio de lista creíble ($19.5 M: por debajo del mercado, sin parecer
//     error de captura como los $9.8 M anteriores).
//   - Fotos de la zona en Storage (cuadros de tomas aéreas de San Pedro de Pexels, uso libre).
//   - Vuelve a correr el Agente de Mercado con el precio nuevo (una llamada real a la IA).
//
// Uso: BASE_URL=https://smtbroker.vercel.app node --env-file=.env.local scripts/preparar-demo-video.mjs <carpeta-fotos>
//      (las fotos: *.jpg en esa carpeta, en el orden de su nombre; la primera es la portada)

import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const FOTOS = process.argv[2]
if (!process.env.DEMO_PASSWORD) throw new Error('Falta DEMO_PASSWORD en .env.local')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: terreno } = await admin.from('activos').select('id, es_demo').eq('nombre', 'Terreno Valle Poniente').single()
if (!terreno.es_demo) throw new Error('Terreno Valle Poniente no es del mundo demo: no se toca')

const { error } = await admin.from('activos').update({
  lat: 25.653, lng: -100.411, colonia: 'Valle Poniente', precio_total: 19_500_000,
}).eq('id', terreno.id)
if (error) throw new Error(error.message)
console.log('✓ Terreno: coordenadas (25.653, -100.411), colonia Valle Poniente, precio $19.5 M')

if (FOTOS) {
  const { data: previas } = await admin.storage.from('fotos-activos').list(terreno.id)
  if (previas?.length) await admin.storage.from('fotos-activos').remove(previas.map((f) => `${terreno.id}/${f.name}`))
  const archivos = readdirSync(FOTOS).filter((f) => f.toLowerCase().endsWith('.jpg')).sort()
  for (const [i, f] of archivos.entries()) {
    const { error: e } = await admin.storage.from('fotos-activos')
      .upload(`${terreno.id}/${String(i + 1).padStart(2, '0')}-zona.jpg`, readFileSync(join(FOTOS, f)), { contentType: 'image/jpeg', upsert: true })
    console.log(e ? `✗ ${f}: ${e.message}` : `✓ foto ${i + 1}: ${f}`)
  }
}

// Diagnóstico de mercado con el precio nuevo, como lo pediría Ricardo desde su pantalla.
const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: s, error: eLogin } = await cli.auth.signInWithPassword({ email: 'ricardo.villarreal@demo.smtbroker.mx', password: process.env.DEMO_PASSWORD })
if (eLogin) throw new Error(eLogin.message)
console.log('… corriendo el Agente de Mercado')
const r = await fetch(`${BASE}/api/agentes/mercado`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.session.access_token },
  body: JSON.stringify({ activoId: terreno.id, regenerar: true }),
}).then((x) => x.json())
console.log(r.error ? `✗ Mercado: ${r.error}` : `✓ Mercado: salida ${r.precioSalidaRecomendadoMXN} · ${r.comparablesAnalizados} comparables`)
console.log(r.interpretacion ?? '')
