import { NextRequest, NextResponse } from 'next/server'
import { MUNICIPIOS_NL } from '@/lib/necesidad'
import { dentroDelFreno, traducir, textoLimpio as texto, numeroLimpio as num, nulo } from '@/lib/chatServidor'
import {
  TIPOS_PROPIEDAD, AMENIDADES_PROPIEDAD, PREGUNTAS_PROPIEDAD, propiedadVacia, siguientePreguntaPropiedad,
  mensajeChatPropiedad, propiedadLista, type FichaPropiedad, type PreguntaPropiedad, type TipoPropiedad,
} from '@/lib/chatPropiedad'

// Chat de entrada (Documento Maestro V10, §29.2), camino "vender o poner en renta": traduce UN
// mensaje del dueño a la ficha de su propiedad. Claude solo traduce; la pregunta siguiente sale de
// lib/chatPropiedad.ts. Sin sesión (el dueño crea su cuenta después); con freno por IP. No se guarda
// nada de lo que escribe (§29.5, #4).

const AMEN = AMENIDADES_PROPIEDAD.map(([k]) => k)
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operacion', 'tipo', 'municipio', 'colonia', 'precio', 'renta_mensual', 'superficie', 'recamaras', 'banos', 'estacionamientos', 'amenidades', 'notas'],
  properties: {
    operacion: nulo({ type: 'string', enum: ['venta', 'renta', 'ambas'] }),
    tipo: nulo({ type: 'string', enum: [...TIPOS_PROPIEDAD] }),
    municipio: nulo({ type: 'string' }),
    colonia: nulo({ type: 'string' }),
    precio: nulo({ type: 'number' }),
    renta_mensual: nulo({ type: 'number' }),
    superficie: nulo({ type: 'number' }),
    recamaras: nulo({ type: 'number' }),
    banos: nulo({ type: 'number' }),
    estacionamientos: nulo({ type: 'number' }),
    amenidades: { type: 'array', items: { type: 'string', enum: AMEN } },
    notas: { type: 'array', items: { type: 'string' } },
  },
}

const SISTEMA = `Eres el traductor del chat de entrada de SMT Match, una plataforma inmobiliaria del área metropolitana de Monterrey. El dueño de una propiedad cuenta qué quiere vender o rentar. Recibes la ficha actual, la última pregunta que le hizo el chat y su mensaje nuevo. Devuelves la ficha COMPLETA actualizada. No conversas: solo traduces.

Reglas:
1. Conserva todo lo de la ficha actual, salvo lo que el mensaje nuevo cambie o corrija.
2. Nunca inventes ni supongas un dato. Si el dueño no dijo el precio, queda null: no lo estimes. Si no sabe algo ("no sé cuántos m²"), queda null.
3. Si el mensaje es una respuesta corta ("3", "en renta", "5 millones"), interprétala como respuesta a la última pregunta.
4. operacion: "venta" (vender, venta), "renta" (rentar, renta, alquilar) o "ambas" (vender o rentar, lo que salga primero).
5. tipo: Casa (casa, residencia, townhouse), Departamento (depa, depto, departamento, loft, penthouse), Terreno (lote, predio), Local comercial (local), Oficina, Bodega (nave).
6. municipio: uno de ${MUNICIPIOS_NL.join(', ')}. Si el dueño solo dice una colonia conocida (Cumbres, Valle Oriente, Contry, Del Valle, Mitras, Carretera Nacional…), pon la colonia y su municipio solo si estás seguro. colonia: la colonia o fraccionamiento, como lo dijo.
7. Montos: "melón/melones" y "M/millones" = 1,000,000; "mil/k" = 1,000. precio es el precio de venta; renta_mensual es la renta al mes.
8. superficie: m² principales (construcción; en terreno o bodega, los del terreno). recamaras, banos ("2 y medio" = 2.5), estacionamientos ("cochera para 2" = 2): cantidades.
9. amenidades, solo de esta lista de claves: ${AMENIDADES_PROPIEDAD.map(([k, l]) => `${k} (${l})`).join(', ')}. "Vigilancia" o "caseta" = seguridad_24h; "pet friendly" = pet_friendly. "No tiene" = lista vacía.
10. notas: lo que el dueño contó y no es un campo de la ficha, corto y con sus palabras ("recién remodelada", "vista a la montaña", "urge vender"). Nunca nombres, teléfonos ni correos.`

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const MUN = new Map(MUNICIPIOS_NL.map((m) => [sinAcentos(m), m]))
MUN.set('san pedro', 'San Pedro Garza García'); MUN.set('san nicolas', 'San Nicolás de los Garza'); MUN.set('escobedo', 'General Escobedo')

function limpiar(x: unknown): FichaPropiedad {
  const o = (x ?? {}) as Record<string, unknown>
  const f = propiedadVacia()
  f.operacion = o.operacion === 'venta' || o.operacion === 'renta' || o.operacion === 'ambas' ? o.operacion : null
  f.tipo = (TIPOS_PROPIEDAD as readonly string[]).includes(o.tipo as string) ? (o.tipo as TipoPropiedad) : null
  f.municipio = MUN.get(sinAcentos(texto(o.municipio, 60))) ?? null
  f.colonia = texto(o.colonia, 80) || null
  f.precio = f.operacion === 'renta' ? null : num(o.precio, 5_000_000_000)
  f.renta_mensual = f.operacion === 'venta' ? null : num(o.renta_mensual, 5_000_000)
  f.superficie = num(o.superficie, 1_000_000)
  f.recamaras = num(o.recamaras, 30); f.banos = num(o.banos, 30); f.estacionamientos = num(o.estacionamientos, 100)
  f.amenidades = [...new Set((Array.isArray(o.amenidades) ? o.amenidades : []).filter((a): a is string => AMEN.includes(a as string)))]
  f.notas = [...new Set((Array.isArray(o.notas) ? o.notas : []).map((n) => texto(n, 80)).filter(Boolean))].slice(0, 8)
  return f
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const mensaje = texto(b.mensaje, 600)
    if (!mensaje) return NextResponse.json({ error: 'Cuéntame de tu propiedad' }, { status: 400 })
    const actual = limpiar(b.ficha)
    const ya = (Array.isArray(b.yaPreguntadas) ? b.yaPreguntadas : []).filter((p): p is PreguntaPropiedad => PREGUNTAS_PROPIEDAD.includes(p as PreguntaPropiedad))
    const ultima = PREGUNTAS_PROPIEDAD.includes(b.ultimaPregunta as PreguntaPropiedad) ? (b.ultimaPregunta as PreguntaPropiedad) : null
    if (!dentroDelFreno(req)) return NextResponse.json({ error: 'Llegaste al límite de mensajes por hora. Puedes llenar la ficha a mano.' }, { status: 429 })

    const ficha = limpiar(await traducir(SISTEMA, SCHEMA, `Ficha actual: ${JSON.stringify(actual)}\nÚltima pregunta del chat: ${ultima ?? '(ninguna)'}\nMensaje nuevo del dueño: ${mensaje}`))
    const yaPreguntadas = ultima && !ya.includes(ultima) ? [...ya, ultima] : ya
    const pregunta = siguientePreguntaPropiedad(ficha, yaPreguntadas)
    return NextResponse.json({ ficha, pregunta, yaPreguntadas, mensaje: mensajeChatPropiedad(ficha, pregunta, pregunta != null && pregunta === ultima), lista: propiedadLista(ficha) })
  } catch (e) {
    console.error('chat-propiedad:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No te entendí esta vez. Intenta de nuevo o llena la ficha a mano.' }, { status: 500 })
  }
}
