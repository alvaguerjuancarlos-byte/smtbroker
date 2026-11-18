import { NextRequest, NextResponse } from 'next/server'
import { dentroDelFreno, traducir, textoLimpio as texto, numeroLimpio as num } from '@/lib/chatServidor'
import { TIPOS_NECESIDAD, MUNICIPIOS_NL, type TipoNecesidad } from '@/lib/necesidad'
import {
  AMENIDADES_CHAT, fichaVacia, siguientePregunta, mensajeDelChat, fichaLista,
  type FichaChat, type Pregunta,
} from '@/lib/chatFicha'

// Chat de entrada (Documento Maestro V10, §29.2): traduce UN mensaje del cliente a la ficha.
// Claude solo traduce (regla del motor, §29.1); la pregunta siguiente y el texto del chat salen de
// lib/chatFicha.ts. Sin sesión, como la búsqueda directa; con freno por IP porque cada mensaje
// cuesta una llamada al modelo. No se guarda nada de lo que el cliente escribe (§29.5, #4).

const n = (t: string) => ({ anyOf: [{ type: 'number' }, { type: 'null' }], description: t })
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operacion', 'tipo', 'zonas', 'presupuesto_min', 'presupuesto_max', 'recamaras', 'banos', 'estacionamientos', 'amenidades', 'preferencias'],
  properties: {
    operacion: { anyOf: [{ type: 'string', enum: ['compra', 'renta'] }, { type: 'null' }] },
    tipo: { anyOf: [{ type: 'string', enum: TIPOS_NECESIDAD.map((t) => t.id) }, { type: 'null' }] },
    zonas: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['municipio', 'colonias'], properties: { municipio: { type: 'string' }, colonias: { type: 'array', items: { type: 'string' } } } },
    },
    presupuesto_min: n('pesos; en renta, al mes'),
    presupuesto_max: n('pesos; en renta, al mes'),
    recamaras: n('mínimo'), banos: n('mínimo'), estacionamientos: n('mínimo'),
    amenidades: { type: 'array', items: { type: 'string', enum: [...AMENIDADES_CHAT] } },
    preferencias: { type: 'array', items: { type: 'string' } },
  },
}

const SISTEMA = `Eres el traductor del chat de entrada de SMT Match, una plataforma inmobiliaria del área metropolitana de Monterrey. Un cliente cuenta qué propiedad quiere comprar o rentar. Recibes la ficha actual, la última pregunta que le hizo el chat y su mensaje nuevo. Devuelves la ficha COMPLETA actualizada. No conversas: solo traduces.

Reglas:
1. Conserva todo lo de la ficha actual, salvo lo que el mensaje nuevo cambie o corrija.
2. Nunca inventes ni supongas un dato. Si el cliente no lo dijo, se queda como está (null o vacío). No rellenes con promedios.
3. Si el mensaje es una respuesta corta ("3", "renta", "en Cumbres"), interprétala como respuesta a la última pregunta.
4. operacion: "compra" (comprar, compra, venta, adquirir) o "renta" (rentar, renta, alquilar).
5. tipo: casa (casa, residencia, townhouse), departamento (depa, depto, departamento, loft), terreno (lote, predio), bodega (nave), oficina, local (local comercial), edificio.
6. zonas: hasta 3. municipio es uno de: ${MUNICIPIOS_NL.join(', ')}; si el cliente dice una colonia o zona conocida (Cumbres, Valle Oriente, Contry, Del Valle, Carretera Nacional, Mitras…), ponla en colonias y pon su municipio solo si estás seguro. Si no sabes el municipio, no agregues la zona: déjala en preferencias con sus palabras.
7. Montos: "melón/melones" y "M/millones" = 1,000,000; "mil/k" = 1,000. "hasta/máximo/menos de/no más de" = presupuesto_max; "desde/mínimo" = presupuesto_min; "como de X" o "alrededor de X" = presupuesto_max X. En renta el monto es mensual.
8. recamaras, banos, estacionamientos: mínimos ("3 recámaras" = 3; "cochera para 2" = 2 estacionamientos; "2 baños y medio" = 2.5).
9. amenidades, solo de esta lista: ${AMENIDADES_CHAT.join(', ')}. "Vigilancia" o "privada con caseta" = Seguridad privada; "pet friendly" o "con mi perro" = Acepta mascotas. Otras cosas van a preferencias.
10. preferencias: lo que el cliente quiere y no es un dato de la ficha, con sus palabras y corto ("para mi familia", "tranquilo", "cerca del Tec", "barata"). Sin repetir las que ya están.`

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const MUN = new Map(MUNICIPIOS_NL.map((m) => [sinAcentos(m), m]))
MUN.set('san pedro', 'San Pedro Garza García'); MUN.set('san nicolas', 'San Nicolás de los Garza'); MUN.set('escobedo', 'General Escobedo')

/** Limpia lo que llega (del navegador o del modelo). Nunca confía en campos que no conoce. */
function limpiar(x: unknown): FichaChat {
  const o = (x ?? {}) as Record<string, unknown>
  const f = fichaVacia()
  f.operacion = o.operacion === 'compra' || o.operacion === 'renta' ? o.operacion : null
  f.tipo = TIPOS_NECESIDAD.some((t) => t.id === o.tipo) ? (o.tipo as TipoNecesidad) : null
  f.zonas = (Array.isArray(o.zonas) ? o.zonas : []).flatMap((z) => {
    const m = MUN.get(sinAcentos(texto((z as ZonaIn)?.municipio, 60)))
    if (!m) return []
    const colonias = (Array.isArray((z as ZonaIn).colonias) ? (z as ZonaIn).colonias! : []).map((c) => texto(c, 60)).filter(Boolean).slice(0, 5)
    return [{ municipio: m, colonias }]
  }).slice(0, 3)
  const tope = f.operacion === 'renta' ? 2_000_000 : 5_000_000_000
  f.presupuesto_max = num(o.presupuesto_max, tope)
  f.presupuesto_min = num(o.presupuesto_min, tope)
  if (f.presupuesto_min != null && f.presupuesto_max != null && f.presupuesto_min > f.presupuesto_max) f.presupuesto_min = null
  f.recamaras = num(o.recamaras, 20); f.banos = num(o.banos, 20); f.estacionamientos = num(o.estacionamientos, 30)
  f.amenidades = [...new Set((Array.isArray(o.amenidades) ? o.amenidades : []).filter((a): a is string => (AMENIDADES_CHAT as readonly string[]).includes(a as string)))]
  f.preferencias = [...new Set((Array.isArray(o.preferencias) ? o.preferencias : []).map((p) => texto(p, 80)).filter(Boolean))].slice(0, 8)
  return f
}
type ZonaIn = { municipio?: unknown; colonias?: unknown[] }

const PREGUNTAS: Pregunta[] = ['operacion', 'tipo', 'zona', 'presupuesto', 'recamaras']

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const mensaje = texto(b.mensaje, 600)
    if (!mensaje) return NextResponse.json({ error: 'Escribe qué buscas' }, { status: 400 })
    const actual = limpiar(b.ficha)
    const ya = (Array.isArray(b.yaPreguntadas) ? b.yaPreguntadas : []).filter((p): p is Pregunta => PREGUNTAS.includes(p as Pregunta))
    const ultima = PREGUNTAS.includes(b.ultimaPregunta as Pregunta) ? (b.ultimaPregunta as Pregunta) : null

    if (!dentroDelFreno(req)) return NextResponse.json({ error: 'Llegaste al límite de mensajes por hora. Puedes llenar la ficha a mano.' }, { status: 429 })
    const ficha = limpiar(await traducir(SISTEMA, SCHEMA, `Ficha actual: ${JSON.stringify(actual)}
Última pregunta del chat: ${ultima ?? '(ninguna)'}
Mensaje nuevo del cliente: ${mensaje}`))
    // Un cambio de operación borra el presupuesto anterior (comprar y rentar no se comparan).
    if (actual.operacion && ficha.operacion && actual.operacion !== ficha.operacion && ficha.presupuesto_max === actual.presupuesto_max) { ficha.presupuesto_max = null; ficha.presupuesto_min = null }

    const yaPreguntadas = ultima && !ya.includes(ultima) ? [...ya, ultima] : ya
    const pregunta = siguientePregunta(ficha, yaPreguntadas)
    const nuevas = ficha.preferencias.filter((p) => !actual.preferencias.includes(p))
    return NextResponse.json({ ficha, pregunta, yaPreguntadas, mensaje: mensajeDelChat(ficha, pregunta, nuevas), lista: fichaLista(ficha) })
  } catch (e) {
    console.error('chat-ficha:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No te entendí esta vez. Intenta de nuevo o llena la ficha a mano.' }, { status: 500 })
  }
}
