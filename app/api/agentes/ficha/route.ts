import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { callClaudeJson } from '@smt/shared-realestate'
import { sesionServidor } from '@/lib/sesionServidor'
import { puedeAccederActivo } from '@/lib/accesoActivo'
import { leerUltimo, guardar, conGuardado } from '@/lib/diagnosticoGuardado'
import { MODELO_DICTAMEN, MAX_TOKENS_DICTAMEN } from '@/lib/modelos'

// Agente de Ficha de venta (Documento Maestro V6.3, §14.1): la narrativa de venta NACE DEL
// DIAGNÓSTICO -- no inventa datos de la propiedad ni del mercado. Usa solo lo que ya está guardado:
// los datos capturados del activo, el diagnóstico de Mercado (comparables reales, plusvalía SHF) y,
// si la propiedad está certificada, el dictamen legal. Sin búsquedas nuevas.
//
// Mismo patrón que Legal/Mercado (lib/diagnosticoGuardado.ts): devuelve la ficha guardada salvo
// `regenerar: true`. La lee y la genera el dueño o el broker que representa el activo.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FichaVenta {
  titular: string
  narrativa: string
  puntosFuertes: string[]
  precioSugeridoMXN: number | null
  argumentosComprador: string[]
  mensajeWhatsApp: string
  /** Solo para el broker (Marketing); NUNCA se publica. Advertencias, dudas y qué revisar. */
  notasBroker?: string[]
}

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { activoId, regenerar } = await req.json().catch(() => ({}))
    if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

    const { data: activo } = await s.admin.from('activos').select('*').eq('id', activoId).maybeSingle()
    if (!activo || !puedeAccederActivo(activo, s.uid)) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

    if (!regenerar) {
      const previa = await leerUltimo(s.admin, activoId, 'ficha')
      if (previa) return NextResponse.json(conGuardado(previa.resultado, previa, false))
    }

    const mercado = await leerUltimo(s.admin, activoId, 'mercado')
    if (!mercado) {
      return NextResponse.json({ error: 'Primero abre el diagnóstico de la propiedad: la ficha se arma con su análisis de mercado' }, { status: 409 })
    }
    const { data: cert } = await s.admin.from('certificaciones').select('id')
      .eq('activo_id', activoId).eq('estado', 'certificada').limit(1).maybeSingle()
    const legal = cert ? await leerUltimo(s.admin, activoId, 'legal') : null

    const m = mercado.resultado as Record<string, unknown>
    const datos = {
      nombre: activo.nombre, tipo: activo.tipo, colonia: activo.colonia, municipio: activo.municipio, estado: activo.estado,
      superficieTerrenoM2: activo.superficie, superficieConstruccionM2: activo.superficie_construccion_m2,
      precioListaMXN: activo.precio_total, descripcionDelPropietario: activo.descripcion || null,
    }
    const prompt = `Eres el Agente de Ficha de venta de SMTBROKER. Escribes la ficha con la que un broker
presentará esta propiedad a compradores (página pública y WhatsApp), en español de México, tono
profesional y cálido, sin exageraciones de folleto.

REGLA DURA: usa SOLO los datos de abajo. No inventes recámaras, amenidades, acabados, vistas ni
cifras que no aparezcan. Si un dato no está, no lo menciones. Los números de mercado salen del
diagnóstico (comparables reales y el Índice SHF), no de tu memoria.

DOS PÚBLICOS (hallazgo del recorrido guiado, 2026-10-07): titular, narrativa, puntosFuertes,
argumentosComprador y mensajeWhatsApp se PUBLICAN y los lee el comprador: escríbelos en positivo y
verificables, sin advertencias, sin "se recomienda revisar…", sin mencionar lo que falta, lo que no
se sabe ni dudas sobre el precio. Todo eso (inconsistencias de precio, uso de suelo por confirmar,
falta de certificación, qué preguntar al propietario) va SOLO en "notasBroker", que ve únicamente el
broker. Honestidad: nunca afirmes en lo público algo que esté en duda; si no es seguro, no lo digas.

DATOS DE LA PROPIEDAD:
${JSON.stringify(datos, null, 2)}

DIAGNÓSTICO DE MERCADO (guardado):
- Precio de salida recomendado: ${m.precioSalidaRecomendadoMXN ?? 'sin dato'}
- Rango de comparables: ${m.rangoMinMXN ?? '—'} a ${m.rangoMaxMXN ?? '—'} (${m.comparablesAnalizados ?? 0} comparables reales)
- Precio promedio de la zona: ${m.precioPromedioM2Zona ?? 'sin dato'} MXN/m²
- Plusvalía 3 años (SHF): ${m.plusvalia3AniosTexto ?? 'sin dato'}
- Lectura del analista: ${m.interpretacion ?? ''}
${legal ? `\nCERTIFICACIÓN LEGAL: la propiedad está CERTIFICADA por SMTBROKER (dictamen: "${(legal.resultado as { verdictTitle?: string }).verdictTitle ?? ''}"). Puedes mencionarlo como respaldo de confianza.` : '\nLa propiedad NO tiene certificación legal: no afirmes nada sobre su situación legal.'}

OUTPUT -- JSON EXACTO, sin texto adicional:
{
  "titular": "frase corta y concreta (máx. 70 caracteres)",
  "narrativa": "2 párrafos breves que presenten la propiedad y su contexto de mercado",
  "puntosFuertes": ["3 a 5 puntos, cada uno anclado a un dato de arriba"],
  "precioSugeridoMXN": número o null (el precio de salida recomendado del diagnóstico; null si no hay),
  "argumentosComprador": ["2 a 4 argumentos para quien evalúa comprar (precio vs. zona, plusvalía, certificación si aplica)"],
  "mensajeWhatsApp": "mensaje de 2-3 líneas listo para compartir, sin enlaces (el sistema agrega el enlace)",
  "notasBroker": ["0 a 4 notas internas para el broker: advertencias, qué verificar, qué preguntar al propietario"]
}`

    const ficha = await callClaudeJson<FichaVenta>(client, {
      model: MODELO_DICTAMEN,
      max_tokens: MAX_TOKENS_DICTAMEN,
      messages: [{ role: 'user', content: prompt }],
    })
    const g = await guardar(s.admin, { activoId, agente: 'ficha', resultado: ficha, modelo: MODELO_DICTAMEN, creadoPor: s.uid })
    return NextResponse.json(conGuardado(ficha, g, true))
  } catch (e) {
    console.error('Agente Ficha (SMTBROKER) error:', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
