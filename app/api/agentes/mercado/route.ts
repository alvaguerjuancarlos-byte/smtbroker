import { NextRequest, NextResponse, after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { callClaudeJson, serieSHFParaCiudad, calcularApreciacionSHF, resolverAbsorcionSNIIV } from '@smt/shared-realestate'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { filtroAccesoActivo } from '@/lib/accesoActivo'
import { leerUltimo, guardar, conGuardado } from '@/lib/diagnosticoGuardado'
import { MODELO_DICTAMEN, MAX_TOKENS_DICTAMEN } from '@/lib/modelos'
import { buscarComparables } from '@/lib/comparables'
import { avisarUsuario } from '@/lib/avisos'
import { calcularPrecioMercado } from '@/lib/precioMercado'

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
// Los comparables de venta sí se buscan en vivo (lib/comparables.ts: Serper + extracción LLM), mismo patrón que
// app/api/agentes/comparables-venta/route.ts de smt-developer, pero sin su persistencia (ese
// Supabase es de otro proyecto) ni su filtro geocodificado de 5km (fuera de alcance aquí).
//
// V9 (§22.3, rentas): una propiedad en renta recibe su RENTA REALISTA con comparables de renta
// (renta mensual por m² × superficie, mismo cálculo, sin redondear a cientos de miles), en
// `resultado.renta`. Solo en renta: no se buscan comparables de venta y los campos de precio de venta
// quedan vacíos. En venta y renta: los dos.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

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

  const { activoId, regenerar } = await req.json()
  if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

  const { data: activo, error: activoErr } = await supabaseAdmin
    .from('activos').select('*').eq('id', activoId).or(filtroAccesoActivo(caller.user.id)).single()
  if (activoErr || !activo) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

  // Diagnóstico guardado (lib/diagnosticoGuardado.ts): si ya existe y no se pidió "Actualizar
  // diagnóstico", se devuelve tal cual -- sin llamar a Claude ni a Serper, y con el mismo resultado
  // en cada visita.
  if (!regenerar) {
    const previo = await leerUltimo(supabaseAdmin, activoId, 'mercado')
    if (previo) return NextResponse.json(conGuardado(previo.resultado, previo, false))
  }

  // Datos reales, calculados (no pedidos al LLM) -- ver cabecera del archivo.
  const serieShf = serieSHFParaCiudad(activo.municipio)
  const plusvaliaShf = serieShf ? calcularApreciacionSHF(serieShf.serie).find(v => v.ventana === '3_anios') ?? null : null
  const absorcion = await resolverAbsorcionSNIIV(activo.municipio || '', activo.estado || '').catch(() => null)

  const operacion: 'venta' | 'renta' | 'ambas' = activo.operacion ?? 'venta'
  const conVenta = operacion !== 'renta', conRenta = operacion !== 'venta'
  const lugar = { tipo: activo.tipo, municipio: activo.municipio, colonia: activo.colonia, estado: activo.estado }
  const sinBusqueda = { comparables: [], fuentesConsultadas: [] } as Awaited<ReturnType<typeof buscarComparables>>
  const [venta, rentaBusqueda] = await Promise.all([
    conVenta ? buscarComparables(lugar) : Promise.resolve(sinBusqueda),
    conRenta ? buscarComparables(lugar, 'renta') : Promise.resolve(sinBusqueda),
  ])
  const { comparables } = venta
  const fuentesConsultadas = [...venta.fuentesConsultadas, ...rentaBusqueda.fuentesConsultadas]
  const grounded = comparables.length + rentaBusqueda.comparables.length > 0
  const sup = activo.superficie ? Number(activo.superficie) : null
  // Rango y precio de salida calculados en código (lib/precioMercado.ts) — el modelo no los decide.
  const precio = calcularPrecioMercado(comparables, sup, activo.precio_total ? Number(activo.precio_total) : null)
  const renta = conRenta ? calcularPrecioMercado(rentaBusqueda.comparables, sup, activo.renta_mensual ? Number(activo.renta_mensual) : null, { total: 1_000, m2: 1 }) : null
  const mxn = (n: number | null) => n == null ? 'sin dato' : '$' + n.toLocaleString('es-MX')
  const bloqueRenta = renta ? `

RENTA DE MERCADO -- YA CALCULADA con ${rentaBusqueda.comparables.length} comparables de RENTA (${renta.comparablesUsados} usados, ${renta.outliersExcluidos} descartados por atípicos o por tamaño muy distinto; los demás no traen renta por m² calculable y no cuentan — es normal, no lo señales como error):
${rentaBusqueda.comparables.map(c => `- ${c.nombre} | ${c.direccion || '?'} | $${c.precioM2 ?? '?'}/m² al mes | ${c.url}`).join('\n') || 'Ninguno.'}
- Renta por m² de la zona (mediana): ${mxn(renta.precioPromedioM2Zona)} al mes
- Rango: ${mxn(renta.rangoMinMXN)} a ${mxn(renta.rangoMaxMXN)} al mes
- Renta realista recomendada: ${mxn(renta.precioSalidaRecomendadoMXN)} al mes
- La renta que pide el propietario (${activo.renta_mensual ? mxn(Number(activo.renta_mensual)) + ' al mes' : 'no capturada'}) queda en el percentil ${renta.percentilPosicionamiento ?? 'sin dato'}.` : ''

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

${conVenta ? `COMPARABLES DE REVENTA ENCONTRADOS (búsqueda real, ${comparables.length} resultados):
${comparables.length > 0 ? comparables.map(c => `- ${c.nombre} | ${c.direccion || '?'} | $${c.precioM2 ?? '?'}/m² | ${c.tipologia || '?'} | ${c.url}`).join('\n') : 'Ninguno -- sin SERPER_API_KEY configurada o sin resultados.'}

PRECIO DE MERCADO -- YA CALCULADO con los comparables (mediana y cuartiles del precio/m² × superficie; ${precio.comparablesUsados} comparables usados, ${precio.outliersExcluidos} descartados por atípicos o por tamaño muy distinto al activo):
- Precio/m² de la zona (mediana): ${mxn(precio.precioPromedioM2Zona)}
- Rango: ${mxn(precio.rangoMinMXN)} a ${mxn(precio.rangoMaxMXN)}
- Precio de salida recomendado: ${mxn(precio.precioSalidaRecomendadoMXN)}
- El precio del propietario queda en el percentil ${precio.percentilPosicionamiento ?? 'sin dato'} de los comparables.` : 'LA PROPIEDAD ESTÁ SOLO EN RENTA: no se valúa para venta.'}${bloqueRenta}`

  const prompt = `Eres el Agente de Mercado de Ciertix -- analizas en qué rango se debería vender
una propiedad YA CONSTRUIDA (reventa), comparada contra reventas similares reales en la zona. No
analizas absorción de un desarrollo nuevo en preventa -- eso es un producto distinto.

ACTIVO A VALUAR:
- Tipo: ${activo.tipo}. Ubicación: ${activo.colonia || ''}, ${activo.municipio}, ${activo.estado}.
- Superficie: ${activo.superficie ?? 'no capturada'} m². Precio de lista del propietario: ${activo.precio_total ? '$' + Number(activo.precio_total).toLocaleString('es-MX') : 'no capturado'}.
- Operación: ${operacion === 'renta' ? 'SOLO EN RENTA' : operacion === 'ambas' ? 'en venta y en renta' : 'en venta'}.${conRenta ? ` Renta que pide: ${activo.renta_mensual ? '$' + Number(activo.renta_mensual).toLocaleString('es-MX') + ' al mes' : 'no capturada'}.` : ''}
${datosRealesBlock}

REGLAS:
- Si la propiedad está en renta, la renta de mercado también ya está calculada: compárala igual con
  la renta que pide (arriba, en línea o abajo). Si está SOLO en renta, la estrategia es de renta: no
  menciones plusvalía, absorción ni venta en "interpretacion" (quien renta no compra).
- El precio de mercado ya está calculado arriba: NO lo recalcules ni propongas otro número. Si dice
  "sin dato" (menos de 2 comparables o sin superficie), dilo en "interpretacion". Compara el
  precio del propietario contra ese precio y dilo con claridad (arriba, en línea o abajo del mercado).
- plusvalia3Anios y absorcion: copia LITERAL el dato real de arriba (texto y número), nunca lo
  recalcules ni lo completes si dice "sin dato".
- demandaLabel ("Alta"/"Media"/"Baja"/null): solo si tienes base real para decirlo (densidad de
  comparables encontrados, plusvalía positiva) -- null si no hay base.
- scoreConfianza (0-100): refleja la calidad real de los datos disponibles -- bajo si hay pocos
  comparables o faltan ambos datos reales (SHF/SNIIV), alto solo si hay comparables + al menos un
  dato real confirmado.

OUTPUT -- JSON EXACTO:
{
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
      model: MODELO_DICTAMEN,
      max_tokens: MAX_TOKENS_DICTAMEN,
      messages: [{ role: 'user', content: prompt }],
    })
    // Los números del precio siempre vienen del cálculo, aunque el modelo devuelva otros.
    Object.assign(parsed, {
      comparablesAnalizados: comparables.length,
      precioPromedioM2Zona: precio.precioPromedioM2Zona,
      rangoMinMXN: precio.rangoMinMXN,
      rangoMaxMXN: precio.rangoMaxMXN,
      precioSalidaRecomendadoMXN: precio.precioSalidaRecomendadoMXN,
      percentilPosicionamiento: precio.percentilPosicionamiento,
    })
    parsed.operacion = operacion
    parsed.renta = renta ? {
      comparablesAnalizados: rentaBusqueda.comparables.length,
      comparablesUsados: renta.comparablesUsados,
      rentaM2Zona: renta.precioPromedioM2Zona,
      rangoMinMXN: renta.rangoMinMXN,
      rangoMaxMXN: renta.rangoMaxMXN,
      rentaRealistaMXN: renta.precioSalidaRecomendadoMXN,
      percentilPosicionamiento: renta.percentilPosicionamiento,
      comparables: rentaBusqueda.comparables,
    } : null
    parsed.grounded = grounded
    parsed.comparables = comparables
    parsed.fuentesConsultadas = fuentesConsultadas
    const g = await guardar(supabaseAdmin, { activoId, agente: 'mercado', resultado: parsed, modelo: MODELO_DICTAMEN, creadoPor: caller.user.id })
    // V7.2 (panel /inicio): el primer precio realista de un propietario se le avisa por correo,
    // por si dejó el panel mientras se calculaba. Las actualizaciones no avisan.
    const rentaRealista = renta?.precioSalidaRecomendadoMXN ?? null
    if (!regenerar && activo.usuario_id === caller.user.id && (parsed.precioSalidaRecomendadoMXN || rentaRealista)) {
      const f = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
      const cifras = [
        parsed.precioSalidaRecomendadoMXN ? `${conRenta ? 'venta ' : ''}${f(Number(parsed.precioSalidaRecomendadoMXN))}` : null,
        rentaRealista ? `${conVenta ? 'renta ' : ''}${f(rentaRealista)} al mes` : null,
      ].filter(Boolean).join(' · ')
      const soloRenta = !parsed.precioSalidaRecomendadoMXN
      after(() => avisarUsuario(supabaseAdmin, activo.usuario_id, {
        asunto: `Tu ${soloRenta ? 'renta' : 'precio'} realista está listo: ${activo.nombre}`,
        titulo: soloRenta ? 'Tu renta realista de mercado' : 'Tu precio realista de mercado',
        lineas: [`${activo.nombre}: ${cifras}.`, soloRenta ? 'Basada en la renta de propiedades similares en tu zona.' : 'Basado en el valor de mercado y la plusvalía de propiedades similares.',
          'Siguiente paso: certifica tu propiedad. La plataforma se encarga por ti.'],
        enlace: { texto: 'Ver mi panel', ruta: '/inicio' },
      }, { esDemo: !!activo.es_demo }))
    }
    return NextResponse.json(conGuardado(parsed, g, true))
  } catch (error: unknown) {
    console.error('Agente Mercado (Ciertix) error:', error)
    return NextResponse.json({ error: 'Error en Agente Mercado' }, { status: 500 })
  }
}
