import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { callClaudeJson, consultarNormativaReal } from '@smt/shared-realestate'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { filtroAccesoActivo } from '@/lib/accesoActivo'

// Agente Legal real para REVENTA de un activo existente -- distinto a propósito del "Agente
// Legal" de smt-developer (que evalúa factibilidad de desarrollo nuevo: COS/CUS/cajones/régimen
// de condominio). Aquí lo que importa es si el activo se puede vender limpio: título/RPP,
// gravámenes, escritura pública -- campos que ya capturamos en `activos` (estado_documentacion_legal,
// folio_real, clave_catastral, escritura_publica, gravamenes_conocidos) y que el agente de
// smt-developer ni pregunta, porque no aplica a un terreno sin construir.
//
// Reemplaza lib/legalTriage.ts (tabla fija de 3 escenarios, "nunca certifica nada real" según su
// propio comentario) -- este endpoint sí ancla a fuentes reales cuando puede: GIS municipal de
// San Pedro (@smt/shared-realestate, mismo motor que ya usa smt-developer) para uso de
// suelo/densidad/altura, y Serper (búsqueda real) para el Plan de Desarrollo Urbano / reglamento
// del municipio. Nunca finge verificar el RPP contra una fuente en vivo -- no existe API pública
// para eso (mismo gap documentado en smt-developer) -- el check de título siempre se basa en lo
// que el propietario declaró/subió, nunca se presenta como "verificado contra el registro".

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ResultadoSerper { link: string; title: string; snippet?: string }
function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

interface CheckLegal {
  cls: 'ok' | 'warn' | 'bad'
  status: string
  desc: string
  fuente: string
}

interface TriageLegalReal {
  ruta: 'fast' | 'hybrid' | 'slow'
  rutaLabel: string
  rutaDesc: string
  verdictCls: 'ok' | 'warn' | 'bad'
  verdictBadge: string
  verdictTitle: string
  verdictDesc: string
  score: string
  usoSuelo: CheckLegal
  rpp: CheckLegal
  ambiental: CheckLegal
  cfe: CheckLegal
  grounded: boolean
  fuentesConsultadas: { url: string; titulo: string }[]
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

  // El cliente solo manda el id -- los datos del predio se leen del servidor, nunca se confía en
  // lo que mande el navegador para armar el diagnóstico (evita que alguien arme un "diagnóstico"
  // favorable para un activo que no es suyo). Se verifica acceso con el mismo criterio que la RLS
  // (dueño o broker que lo representa, ver lib/accesoActivo.ts), vía supabaseAdmin porque este
  // check corre antes de decidir si la petición procede.
  const { data: activo, error: activoErr } = await supabaseAdmin
    .from('activos').select('*').eq('id', activoId).or(filtroAccesoActivo(caller.user.id)).single()
  if (activoErr || !activo) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

  const esSanPedro = /san\s*pedro/i.test(activo.municipio || '')
  const gisReal = (esSanPedro && typeof activo.lat === 'number' && typeof activo.lng === 'number')
    ? await consultarNormativaReal(activo.lat, activo.lng).catch(() => null)
    : null
  const gisBlock = gisReal && (gisReal.uso || gisReal.densidad || gisReal.altura)
    ? `\n\nDATOS OFICIALES REALES -- GeoServer municipal de San Pedro Garza García (catastro/zonificación):\n${
        gisReal.uso ? `- Uso de suelo (E2): "${gisReal.uso.uso}" -- ${gisReal.uso.descripcion} -- distrito "${gisReal.uso.distrito}"\n` : ''
      }${
        gisReal.densidad ? `- Densidad (E3): código "${gisReal.densidad.densidadCodigo}", CUS = ${gisReal.densidad.cusNum}\n` : ''
      }${
        gisReal.altura ? `- Altura (E4): ${gisReal.altura.nivelesMax} niveles, ${gisReal.altura.alturaM} m\n` : ''
      }\nSon la fuente más confiable disponible para uso de suelo -- úsalos directo para "usoSuelo" si aplican.`
    : ''

  const snippets: string[] = []
  const fuentesConsultadas: { url: string; titulo: string }[] = []
  const serperKey = process.env.SERPER_API_KEY?.trim()
  if (serperKey && activo.municipio) {
    const queries = [
      `reglamento zonificación uso de suelo "${activo.municipio}" "${activo.estado}" site:gob.mx`,
      `plan desarrollo urbano "${activo.municipio}" restricciones ambientales ANP barrancas`,
    ]
    for (const q of queries) {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, gl: 'mx', hl: 'es', num: 6 }),
        })
        if (!res.ok) continue
        const json = await res.json()
        ;(json.organic ?? []).forEach((r: ResultadoSerper) => {
          snippets.push(`URL: ${r.link}\nTÍTULO: ${r.title}\nSNIPPET: ${r.snippet ?? ''}`)
          fuentesConsultadas.push({ url: r.link, titulo: r.title })
        })
      } catch { /* una búsqueda fallida no tumba la ruta completa */ }
    }
  }
  const grounded = snippets.length > 0 || !!gisBlock
  const groundingBlock = grounded
    ? `\n\nRESULTADOS DE BÚSQUEDA REAL (Google, vía Serper):\n${snippets.join('\n---\n')}\n\nUsa SOLO estos resultados (más el bloque GIS si existe) para fundamentar uso de suelo y restricciones ambientales -- si no confirman un dato, dilo explícito en vez de completarlo de memoria.${gisBlock}`
    : `\n\nNO se encontraron resultados de búsqueda real (falta SERPER_API_KEY o sin resultados)${gisBlock || '.'} Cualquier valor sin respaldo explícito del bloque GIS es una ESTIMACIÓN sin fuente verificada -- debes decirlo.`

  const docLabels: Record<string, string> = {
    completa: 'Documentación completa aportada por el propietario',
    parcial: 'Documentación parcial aportada por el propietario',
  }
  const estadoDoc = activo.estado_documentacion_legal as string | null
  const docBlock = `Estado de documentación declarado por el propietario: ${docLabels[estadoDoc || ''] || 'Sin documentación aportada'}.
Folio real: ${activo.folio_real || 'no capturado'}. Clave catastral: ${activo.clave_catastral || 'no capturada'}.
Escritura pública: ${activo.escritura_publica || 'no capturada'}. Gravámenes conocidos declarados: ${activo.gravamenes_conocidos || 'ninguno declarado'}.`

  const prompt = `Eres el Agente Legal de SMTBROKER -- evalúas si un activo YA EXISTENTE (no un
desarrollo nuevo) se puede vender limpio: uso de suelo, título/RPP, gravámenes, y restricciones
ambientales/de infraestructura. No evalúas factibilidad de construcción nueva (COS/CUS/régimen de
condominio) -- eso no aplica a una reventa.

DATOS DEL ACTIVO:
- Tipo: ${activo.tipo}. Dirección: ${activo.direccion}, ${activo.colonia || ''}, ${activo.municipio}, ${activo.estado}.
- Uso de suelo declarado por el propietario: ${activo.uso_suelo_declarado || 'no declarado'}.
- Superficie terreno: ${activo.superficie ?? 'no capturada'} m². Superficie construcción: ${activo.superficie_construccion_m2 ?? 'no capturada'} m².
${docBlock}
${groundingBlock}

REGLA DURA SOBRE TÍTULO/RPP (no la rompas): NO EXISTE una API pública del Registro Público de la
Propiedad de Nuevo León -- nunca digas "verificado contra el RPP" ni nada que implique una
consulta en vivo al registro. El check "rpp" solo puede decir: (a) si hay folio+escritura
declarados, que el diagnóstico SE BASA en esa documentación y recomienda validación humana antes
de cerrar; (b) si falta folio o escritura, que no se puede avanzar sin ella. "VERIFICADO" como
status está PROHIBIDO para "rpp" -- usa "RESPALDADO POR DOCUMENTACIÓN", "EN VALIDACIÓN", o "NO
LOCALIZADO" según corresponda.

OUTPUT -- JSON EXACTO (sin texto adicional), mismo contrato que ya usa la UI de SMTBROKER:
{
  "ruta": "fast" | "hybrid" | "slow",
  "rutaLabel": "Ruta rápida" | "Ruta híbrida" | "Ruta lenta",
  "rutaDesc": "1 frase explicando por qué esta ruta, en términos de qué falta o no",
  "verdictCls": "ok" | "warn" | "bad",
  "verdictBadge": "texto corto tipo LISTO PARA PUBLICAR / PUBLICABLE CON NOTA / REQUIERE VALIDACIÓN MANUAL",
  "verdictTitle": "título corto del diagnóstico",
  "verdictDesc": "1-2 frases de resumen honesto",
  "score": "número 0.0-10.0 como string, ej. '7.4' -- refleja qué tan listo está para vender, no inventes precisión que no tienes",
  "usoSuelo":    { "cls": "ok|warn|bad", "status": "texto corto", "desc": "1-2 frases", "fuente": "de dónde sale esto (GIS municipal / búsqueda real / sin fuente verificada)" },
  "rpp":         { "cls": "ok|warn|bad", "status": "texto corto (ver regla dura arriba)", "desc": "1-2 frases", "fuente": "Registro Público de la Propiedad Nuevo León -- sin API programática nacional" },
  "ambiental":   { "cls": "ok|warn|bad", "status": "texto corto", "desc": "1-2 frases", "fuente": "de dónde sale esto" },
  "cfe":         { "cls": "ok|warn|bad", "status": "texto corto", "desc": "1-2 frases sobre proximidad a infraestructura federal/servidumbres", "fuente": "de dónde sale esto" }
}

Retorna ÚNICAMENTE el JSON.`

  try {
    const parsed = await callClaudeJson<TriageLegalReal>(client, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    parsed.grounded = grounded
    parsed.fuentesConsultadas = fuentesConsultadas
    return NextResponse.json(parsed)
  } catch (error: unknown) {
    console.error('Agente Legal (SMTBROKER) error:', error)
    return NextResponse.json({ error: 'Error en Agente Legal' }, { status: 500 })
  }
}
