// Lectura de UN anuncio de portal a petición del comprador: red y modelo (SOLO servidor). La lógica
// de verificación está en lib/lecturaAnuncio.ts.
//
// La página se lee con Jina Reader (r.jina.ai: una página, en texto, sin cuenta). Si el portal pone
// verificación anti-robots, se respeta: queda 'bloqueado' y el comprador captura precio y m².
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callClaudeJson } from '@smt/shared-realestate'
import { MODELO_EXTRACCION } from '@/lib/modelos'
import { detectarBloqueo, verificarExtraccion, type ExtraccionModelo, type ResultadoLectura } from '@/lib/lecturaAnuncio'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function leerPagina(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(45000), headers: { 'X-Return-Format': 'markdown' } })
    return await r.text()
  } catch {
    return null
  }
}

export async function leerAnuncio(url: string): Promise<ResultadoLectura> {
  const texto = await leerPagina(url)
  if (texto == null) return { lectura: 'fallo', motivo: 'No se pudo abrir la página.' }
  if (detectarBloqueo(texto)) return { lectura: 'bloqueado', motivo: 'El portal no deja leer el anuncio (verificación anti-robots).' }
  const pagina = texto.slice(0, 14000)
  const prompt = `Esta es la página de un anuncio inmobiliario (texto de la página).

PÁGINA:
${pagina}

Responde SOLO un objeto JSON:
{
  "esListado": true si la página muestra MUCHAS propiedades (resultados de búsqueda) y no un anuncio individual,
  "esVenta": false si la propiedad está en RENTA y no en venta,
  "titulo": título corto del anuncio,
  "precio": precio TOTAL de venta como número (null si no aparece; NO uses precio por m², ni pagos mensuales, ni "desde"),
  "moneda": "MXN" o "USD",
  "citaPrecio": el texto EXACTO de la página donde aparece ese precio (cópialo tal cual),
  "superficieM2": superficie principal en m² como número (construcción; si es terreno, la del terreno),
  "citaSuperficie": el texto EXACTO de la página donde aparece esa superficie,
  "tipo": "Casa" | "Departamento" | "Terreno" | "Bodega" | "Oficina" | "Local comercial" | "Edificio",
  "municipio": municipio o ciudad, "colonia": colonia o zona,
  "recamaras": número o null, "banos": número o null
}
Reglas: no inventes datos; si algo no está en la página, null. NO incluyas nombre, teléfono ni correo del anunciante.`
  try {
    const e = await callClaudeJson<ExtraccionModelo>(client, { model: MODELO_EXTRACCION, max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    return verificarExtraccion(texto, e)
  } catch {
    return { lectura: 'fallo', motivo: 'No se pudo interpretar la página.' }
  }
}

interface AnuncioGuardado { id: string; url: string; titulo: string | null; lectura: string | null; lectura_at: string | null }

/**
 * Lee el anuncio si no se ha leído (o si la última lectura falló hace más de un día) y guarda lo
 * leído en radar_anuncios. Las lecturas 'bloqueado' y 'listado' no se repiten: el portal no cambia.
 */
export async function leerYGuardar(admin: SupabaseClient, anuncioId: string): Promise<ResultadoLectura | null> {
  const { data } = await admin.from('radar_anuncios').select('id, url, titulo, lectura, lectura_at').eq('id', anuncioId).maybeSingle()
  const a = data as AnuncioGuardado | null
  if (!a) return null
  const reciente = a.lectura_at && Date.now() - new Date(a.lectura_at).getTime() < 86400_000
  if (a.lectura && a.lectura !== 'fallo') return null
  if (a.lectura === 'fallo' && reciente) return null
  const r = await leerAnuncio(a.url)
  const ahora = new Date().toISOString()
  if (r.lectura === 'leido') {
    const d = r.datos
    await admin.from('radar_anuncios').update({
      lectura: 'leido', lectura_at: ahora, actualizado_at: ahora,
      ...(d.titulo && !a.titulo ? { titulo: d.titulo } : {}),
      ...(d.precio ? { precio: d.precio } : {}), ...(d.superficie ? { superficie: d.superficie } : {}),
      ...(d.tipo ? { tipo: d.tipo } : {}), ...(d.municipio ? { municipio: d.municipio } : {}), ...(d.colonia ? { colonia: d.colonia } : {}),
      datos: { recamaras: d.recamaras, banos: d.banos, descartados: r.descartados },
    }).eq('id', a.id)
  } else {
    await admin.from('radar_anuncios').update({ lectura: r.lectura, lectura_at: ahora, datos: { motivo: r.motivo } }).eq('id', a.id)
  }
  return r
}
