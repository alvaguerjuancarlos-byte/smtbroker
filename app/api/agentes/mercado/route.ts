import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { callClaudeJson, serieSHFParaCiudad, calcularApreciacionSHF, resolverAbsorcionSNIIV } from '@smt/shared-realestate'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { filtroAccesoActivo } from '@/lib/accesoActivo'

// Agente de Mercado real para REVENTA -- distinto del "Agente Mercado" de smt-developer (que
// analiza oferta/demanda de un PROYECTO nuevo en preventa). Aquí la pregunta es "¿en qué rango
// se vende esta propiedad YA CONSTRUIDA, comparada contra reventas similares reales?", no
// absorción de un desarrollo todavía sin construir.
//
// Reemplaza el bloque "derivado del precio" de app/activo/[id]/page.tsx (precioMin/Max/Salida =
// precio_total * un multiplicador fijo, sin ningún dato de mercado real detrás). Dos fuentes
// reales de @smt/shared-realestate se inyectan como contexto duro (no se le pide al modelo que
// las calcule, ya vienen calculadas):
//   - Plusvalía: Índice SHF (Sociedad Hipotecaria Federal) -- cubre San Pedro vía ZM Monterrey.
//   - Absorción: SNIIV (SEDATU) -- NO cubre San Pedro/Monterrey/San Nicolás (vivienda premium sin
//     financiamiento formal no pasa por este sistema, ver resolverAbsorcionSNIIV) -- se declara
//     "sin dato" honesto en vez de fabricar un "4.5 meses" como hacía el bloque simulado viejo.
// Los comparables de venta sí se buscan en vivo (Serper + extracción LLM), mismo patrón que
// app/api/agentes/comparables-venta/route.ts de smt-developer, pero sin su persistencia (ese
// Supabase es de otro proyecto) ni su filtro geocodificado de 5km (fuera de alcance aquí).

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ResultadoSerper { link: string; title: string; snippet?: string }
function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

interface ComparableReventa {
  nombre: string
  direccion: string | null
  precioM2: number | null
  precioTotal: number | null
  superficieM2: number | null
  tipologia: string | null
  url: string
}

async function buscarComparablesReventa(tipo: string, municipio: string, colonia: string | null, estado: string): Promise<{ comparables: ComparableReventa[]; fuentesConsultadas: { url: string; titulo: string }[] }> {
  const serperKey = process.env.SERPER_API_KEY?.trim()
  const fuentesConsultadas: { url: string; titulo: string }[] = []
  if (!serperKey) return { comparables: [], fuentesConsultadas }

  const palabraClave = tipo.toLowerCase().includes('terreno') ? 'terrenos' : tipo.toLowerCase().includes('depto') ? 'departamentos' : 'casas'
  const lugar = [colonia, municipio, estado].filter(Boolean).join(' ')
  const queries = [
    `${palabraClave} en venta ${lugar} precio m2 site:inmuebles24.com OR site:lamudi.com.mx OR site:vivanuncios.com.mx`,
    `${palabraClave} en venta ${municipio} ${estado} precio`,
  ]
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
        snippets.push(`URL: ${r.link}\nTÍTULO: ${r.title}\nSNIPPET: ${r.snippet ?? ''}`)
        fuentesConsultadas.push({ url: r.link, titulo: r.title })
      })
    } catch { /* una búsqueda fallida no tumba el resto */ }
  }
  if (snippets.length === 0) return { comparables: [], fuentesConsultadas }

  const prompt = `Analiza estos resultados de búsqueda de Google sobre ${palabraClave} EN VENTA (reventa, no preventa) en ${lugar}.
Extrae propiedades YA CONSTRUIDAS con precio identificable -- NO terrenos en preventa de desarrollador, NO rentas.

RESULTADOS:
${snippets.join('\n---\n')}

Para cada propiedad extrae: nombre (o descripción corta), direccion o colonia aproximada, precioM2 (número, null si no se puede calcular), precioTotal (número, null si no aparece), superficieM2 (número, null si no aparece), tipologia (ej. "3 rec · 180 m²", null si no se puede determinar), url.
Reglas: solo VENTA (no renta), solo si hay precio total O precio/m², máximo 8 comparables.
Retorna ÚNICAMENTE un array JSON válido, sin markdown.`

  try {
    const comparables = await callClaudeJson<ComparableReventa[]>(client, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, /\[[\s\S]*\]/)
    return { comparables, fuentesConsultadas }
  } catch {
    return { comparables: [], fuentesConsultadas }
  }
}

export async function POST(req: NextRequest) {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: unknown) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token)
  if (callerError || !caller?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { activoId } = await req.json()
  if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

  const { data: activo, error: activoErr } = await supabaseAdmin
    .from('activos').select('*').eq('id', activoId).or(filtroAccesoActivo(caller.user.id)).single()
  if (activoErr || !activo) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

  // Datos reales, calculados (no pedidos al LLM) -- ver cabecera del archivo.
  const serieShf = serieSHFParaCiudad(activo.municipio)
  const plusvaliaShf = serieShf ? calcularApreciacionSHF(serieShf.serie).find(v => v.ventana === '3_anios') ?? null : null
  const absorcion = await resolverAbsorcionSNIIV(activo.municipio || '', activo.estado || '').catch(() => null)

  const { comparables, fuentesConsultadas } = await buscarComparablesReventa(activo.tipo, activo.municipio, activo.colonia, activo.estado)
  const grounded = comparables.length > 0

  const datosRealesBlock = `
DATO REAL -- Plusvalía 3 años (Índice SHF${serieShf ? `, serie ${serieShf.nombre}` : ''}):
${plusvaliaShf
    ? (plusvaliaShf.tasaAnualizada != null
        ? `${plusvaliaShf.tasaAnualizada}% anualizado, período ${plusvaliaShf.periodoInicio} a ${plusvaliaShf.periodoFin}.`
        : `Sin dato suficiente -- ${plusvaliaShf.motivo}`)
    : `Sin serie SHF para "${activo.municipio}" -- no inventes una tasa, repórtalo como sin dato.`}

DATO REAL -- Absorción (SNIIV/SEDATU, vivienda con financiamiento formal):
${absorcion?.disponible
    ? `${absorcion.diasVenta} días de venta promedio (${absorcion.municipio}, ${absorcion.anio}).`
    : `Sin dato -- ${absorcion?.motivo || 'servicio no disponible'}. IMPORTANTE: si el motivo es que San Pedro/zona premium no aparece en SNIIV, es esperado (vivienda sin financiamiento tradicional no pasa por este sistema) -- dilo así, no lo trates como un fallo.`}

COMPARABLES DE REVENTA ENCONTRADOS (búsqueda real, ${comparables.length} resultados):
${comparables.length > 0 ? comparables.map(c => `- ${c.nombre} | ${c.direccion || '?'} | $${c.precioM2 ?? '?'}/m² | ${c.tipologia || '?'} | ${c.url}`).join('\n') : 'Ninguno -- sin SERPER_API_KEY configurada o sin resultados.'}`

  const prompt = `Eres el Agente de Mercado de SMTBROKER -- analizas en qué rango se debería vender
una propiedad YA CONSTRUIDA (reventa), comparada contra reventas similares reales en la zona. No
analizas absorción de un desarrollo nuevo en preventa -- eso es un producto distinto.

ACTIVO A VALUAR:
- Tipo: ${activo.tipo}. Ubicación: ${activo.colonia || ''}, ${activo.municipio}, ${activo.estado}.
- Superficie: ${activo.superficie ?? 'no capturada'} m². Precio de lista del propietario: ${activo.precio_total ? '$' + Number(activo.precio_total).toLocaleString('es-MX') : 'no capturado'}.
${datosRealesBlock}

REGLAS:
- precioPromedioM2Zona, rangoMinMXN, rangoMaxMXN, precioSalidaRecomendadoMXN: básalos en los
  comparables reales de arriba si hay al menos 2; si hay menos de 2, repórtalos como null y dilo
  en "interpretacion", NO inventes un rango sin comparables reales que lo respalden.
- plusvalia3Anios y absorcion: copia LITERAL el dato real de arriba (texto y número), nunca lo
  recalcules ni lo completes si dice "sin dato".
- demandaLabel ("Alta"/"Media"/"Baja"/null): solo si tienes base real para decirlo (densidad de
  comparables encontrados, plusvalía positiva) -- null si no hay base.
- scoreConfianza (0-100): refleja la calidad real de los datos disponibles -- bajo si hay pocos
  comparables o faltan ambos datos reales (SHF/SNIIV), alto solo si hay comparables + al menos un
  dato real confirmado.

OUTPUT -- JSON EXACTO:
{
  "comparablesAnalizados": ${comparables.length},
  "precioPromedioM2Zona": number | null,
  "rangoMinMXN": number | null,
  "rangoMaxMXN": number | null,
  "precioSalidaRecomendadoMXN": number | null,
  "percentilPosicionamiento": number | null,
  "plusvalia3AniosTexto": "texto corto, copiado del dato real de arriba",
  "absorcionTexto": "texto corto, copiado del dato real de arriba",
  "demandaLabel": "Alta" | "Media" | "Baja" | null,
  "scoreConfianza": number,
  "scoreComponentes": { "comparablesMercado": number, "documentacionLegal": number, "condicionActivo": number },
  "interpretacion": "2-3 frases de estrategia recomendada, honesta sobre qué tan sólida es la base de datos"
}
Retorna ÚNICAMENTE el JSON.`

  try {
    const parsed = await callClaudeJson<Record<string, unknown>>(client, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    parsed.grounded = grounded
    parsed.comparables = comparables
    parsed.fuentesConsultadas = fuentesConsultadas
    return NextResponse.json(parsed)
  } catch (error: unknown) {
    console.error('Agente Mercado (SMTBROKER) error:', error)
    return NextResponse.json({ error: 'Error en Agente Mercado' }, { status: 500 })
  }
}
