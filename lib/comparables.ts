// Comparables reales de venta o de renta (búsqueda web + extracción con Claude). SOLO servidor.
// Sale de app/api/agentes/mercado/route.ts (2026-11-10) para que también lo use el análisis del
// comprador (Documento Maestro V8, Parte 2): la venta da el precio contra mercado y la renta, el
// rendimiento por renta (§20.2).
//
// Búsquedas simples, sin varios `site:` juntos: con ellos el buscador no devuelve nada (probado el
// 10-nov-2026; la primera búsqueda del Agente de Mercado nunca trajo resultados por eso).
import Anthropic from '@anthropic-ai/sdk'
import { callClaudeJson } from '@smt/shared-realestate'
import { MODELO_EXTRACCION } from '@/lib/modelos'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ResultadoSerper { link: string; title: string; snippet?: string }

export type Operacion = 'venta' | 'renta'

/** En renta, precioTotal es la renta MENSUAL y precioM2 la renta mensual por m². */
export interface Comparable {
  nombre: string
  direccion: string | null
  precioM2: number | null
  precioTotal: number | null
  superficieM2: number | null
  tipologia: string | null
  url: string
}

export function palabraClaveTipo(tipo: string): string {
  // Antes todo lo que no era terreno ni "depto" buscaba "casas": una bodega se comparaba contra
  // casas (y "Departamento" no contiene "depto").
  const t = tipo.toLowerCase()
  return t.includes('terreno') ? 'terrenos' : t.includes('depa') || t.includes('depto') ? 'departamentos'
    : t.includes('bodega') ? 'bodegas' : t.includes('local') ? 'locales comerciales' : t.includes('oficina') ? 'oficinas'
    : t.includes('edificio') || t.includes('torre') ? 'edificios' : 'casas'
}

export async function buscarComparables(
  a: { tipo: string; municipio: string; colonia: string | null; estado: string },
  operacion: Operacion = 'venta',
): Promise<{ comparables: Comparable[]; fuentesConsultadas: { url: string; titulo: string }[] }> {
  const serperKey = process.env.SERPER_API_KEY?.trim()
  const fuentesConsultadas: { url: string; titulo: string }[] = []
  if (!serperKey) return { comparables: [], fuentesConsultadas }

  const palabraClave = palabraClaveTipo(a.tipo)
  const en = operacion === 'venta' ? 'en venta' : 'en renta'
  const lugar = [a.colonia, a.municipio, a.estado].filter(Boolean).join(' ')
  const queries = [`${palabraClave} ${en} ${lugar} precio m2`, `${palabraClave} ${en} ${a.municipio} ${a.estado} precio`]
  const snippets: string[] = []
  for (const q of queries) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, gl: 'mx', hl: 'es', num: 8 }),
      })
      if (!res.ok) continue
      const json = await res.json()
      ;(json.organic ?? []).forEach((r: ResultadoSerper) => {
        if (fuentesConsultadas.some((f) => f.url === r.link)) return
        snippets.push(`URL: ${r.link}\nTÍTULO: ${r.title}\nSNIPPET: ${r.snippet ?? ''}`)
        fuentesConsultadas.push({ url: r.link, titulo: r.title })
      })
    } catch { /* una búsqueda fallida no tumba el resto */ }
  }
  if (snippets.length === 0) return { comparables: [], fuentesConsultadas }

  const prompt = operacion === 'venta'
    ? `Analiza estos resultados de búsqueda de Google sobre ${palabraClave} EN VENTA (reventa, no preventa) en ${lugar}.
Extrae propiedades YA CONSTRUIDAS con precio identificable -- NO terrenos en preventa de desarrollador, NO rentas.

RESULTADOS:
${snippets.join('\n---\n')}

Para cada propiedad extrae: nombre (o descripción corta), direccion o colonia aproximada, precioM2 (número, null si no se puede calcular), precioTotal (número, null si no aparece), superficieM2 (número, null si no aparece), tipologia (ej. "3 rec · 180 m²", null si no se puede determinar), url.
Reglas: solo VENTA (no renta), solo si hay precio total O precio/m², máximo 8 comparables.
Retorna ÚNICAMENTE un array JSON válido, sin markdown.`
    : `Analiza estos resultados de búsqueda de Google sobre ${palabraClave} EN RENTA en ${lugar}.
Extrae propiedades en RENTA con renta mensual identificable -- NO ventas.

RESULTADOS:
${snippets.join('\n---\n')}

Para cada propiedad extrae: nombre (o descripción corta), direccion o colonia aproximada, precioM2 (renta MENSUAL por m² en pesos, número, null si no se puede calcular), precioTotal (renta MENSUAL total en pesos, número, null si no aparece; si viene en dólares, null), superficieM2 (número, null si no aparece), tipologia (null si no se puede determinar), url.
Reglas: solo RENTA mensual (no venta, no renta por noche), solo si hay renta total O renta/m², máximo 8 comparables.
Retorna ÚNICAMENTE un array JSON válido, sin markdown.`

  try {
    const comparables = await callClaudeJson<Comparable[]>(client, {
      model: MODELO_EXTRACCION,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, /\[[\s\S]*\]/)
    return { comparables: Array.isArray(comparables) ? comparables : [], fuentesConsultadas }
  } catch {
    return { comparables: [], fuentesConsultadas }
  }
}
