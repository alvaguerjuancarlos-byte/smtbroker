// Chat de entrada (Documento Maestro V10, §29.2), camino "comprar o rentar". Piezas compartidas por
// el navegador (app/empezar/ChatFicha.tsx) y el servidor (app/api/chat-ficha).
//
// Claude SOLO traduce lo que el cliente escribe a esta ficha. Lo que el chat pregunta y dice lo
// deciden las reglas de aquí (siguientePaso), no el modelo: así nunca promete ni inventa nada.
//
// Datos importantes (§29.2): obligatorios operación, tipo y zona; si faltan, se pregunta UNA vez
// por el presupuesto y, en casa o departamento, por las recámaras.
import { TIPOS_NECESIDAD, type TipoNecesidad, type Operacion } from '@/lib/necesidad'

export const AMENIDADES_CHAT = ['Jardín', 'Alberca', 'Seguridad privada', 'Cuarto de servicio', 'Gimnasio', 'Roof garden', 'Acepta mascotas'] as const

export interface ZonaChat { municipio: string; colonias: string[] }

export interface FichaChat {
  operacion: Operacion | null
  tipo: TipoNecesidad | null
  zonas: ZonaChat[]
  presupuesto_min: number | null
  presupuesto_max: number | null
  recamaras: number | null
  banos: number | null
  estacionamientos: number | null
  amenidades: string[]
  /** Lo que el cliente quiere pero no es un filtro ("para mi familia", "tranquilo"), con sus palabras. */
  preferencias: string[]
}

export const fichaVacia = (): FichaChat => ({
  operacion: null, tipo: null, zonas: [], presupuesto_min: null, presupuesto_max: null,
  recamaras: null, banos: null, estacionamientos: null, amenidades: [], preferencias: [],
})

export type Pregunta = 'operacion' | 'tipo' | 'zona' | 'presupuesto' | 'recamaras'

const habitacional = (t: TipoNecesidad | null) => t === 'casa' || t === 'departamento'
export const fichaLista = (f: FichaChat) => !!(f.operacion && f.tipo && f.zonas.length)

/** Qué falta preguntar, en orden. Las opcionales se preguntan una sola vez (`yaPreguntadas`). */
export function siguientePregunta(f: FichaChat, yaPreguntadas: Pregunta[]): Pregunta | null {
  if (!f.operacion) return 'operacion'
  if (!f.tipo) return 'tipo'
  if (!f.zonas.length) return 'zona'
  if (f.presupuesto_max == null && !yaPreguntadas.includes('presupuesto')) return 'presupuesto'
  if (habitacional(f.tipo) && f.recamaras == null && !yaPreguntadas.includes('recamaras')) return 'recamaras'
  return null
}

const TEXTO_PREGUNTA: Record<Pregunta, (f: FichaChat) => string> = {
  operacion: () => '¿Quieres comprar o rentar?',
  tipo: (f) => `¿Qué tipo de propiedad ${f.operacion === 'renta' ? 'quieres rentar' : 'buscas'}? Casa, departamento, terreno, oficina, local o bodega.`,
  zona: () => '¿En qué zona o municipio? Puedes darme hasta 3.',
  presupuesto: (f) => (f.operacion === 'renta' ? '¿Cuánto puedes pagar de renta al mes, como máximo?' : '¿Cuál es tu presupuesto máximo?'),
  recamaras: () => '¿Cuántas recámaras necesitas?',
}

/** El mensaje del chat después de cada respuesta: qué entendió (en los chips) y la siguiente pregunta. */
export function mensajeDelChat(f: FichaChat, pregunta: Pregunta | null, nuevasPreferencias: string[]): string {
  const partes: string[] = []
  if (nuevasPreferencias.length) {
    const p = nuevasPreferencias.map((x) => `"${x}"`).join(', ')
    partes.push(pregunta === 'recamaras'
      ? `${p} lo tomo como preferencia; si me dices cuántas recámaras, afino la búsqueda.`
      : `${p} lo tomo como preferencia.`)
    if (pregunta === 'recamaras') return partes.join(' ')
  }
  if (pregunta) partes.push(TEXTO_PREGUNTA[pregunta](f))
  else partes.push('Tu ficha está lista. Revisa los datos y dale "Buscar". Si quieres, sigue contándome más.')
  return partes.join(' ')
}

const DINERO = (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export interface ChipFicha { clave: string; texto: string }

/** Chips de la ficha, en el orden de §29.2. Cada uno se puede quitar con su `clave`. */
export function chipsDeFicha(f: FichaChat): ChipFicha[] {
  const c: ChipFicha[] = []
  if (f.operacion) c.push({ clave: 'operacion', texto: f.operacion === 'renta' ? 'Rentar' : 'Comprar' })
  if (f.tipo) c.push({ clave: 'tipo', texto: TIPOS_NECESIDAD.find((t) => t.id === f.tipo)?.etiqueta ?? f.tipo })
  f.zonas.forEach((z, i) => c.push({ clave: `zona:${i}`, texto: z.colonias.length ? `${z.colonias.join(', ')} (${z.municipio})` : z.municipio }))
  const mes = f.operacion === 'renta' ? ' al mes' : ''
  if (f.presupuesto_max != null) c.push({ clave: 'presupuesto', texto: f.presupuesto_min ? `${DINERO(f.presupuesto_min)} a ${DINERO(f.presupuesto_max)}${mes}` : `hasta ${DINERO(f.presupuesto_max)}${mes}` })
  if (f.recamaras != null) c.push({ clave: 'recamaras', texto: `${f.recamaras}+ recámaras` })
  if (f.banos != null) c.push({ clave: 'banos', texto: `${f.banos}+ baños` })
  if (f.estacionamientos != null) c.push({ clave: 'estacionamientos', texto: `${f.estacionamientos}+ estacionamientos` })
  for (const a of f.amenidades) c.push({ clave: `amenidad:${a}`, texto: a.toLowerCase() })
  for (const p of f.preferencias) c.push({ clave: `preferencia:${p}`, texto: `preferencia: ${p}` })
  return c
}

/** Quita el dato de un chip. Si era obligatorio, el chat lo vuelve a preguntar. */
export function quitarChip(f: FichaChat, clave: string): FichaChat {
  const g: FichaChat = { ...f, zonas: [...f.zonas], amenidades: [...f.amenidades], preferencias: [...f.preferencias] }
  const [k, v] = [clave.split(':')[0], clave.slice(clave.indexOf(':') + 1)]
  if (k === 'operacion') { g.operacion = null; g.presupuesto_min = null; g.presupuesto_max = null }
  else if (k === 'tipo') { g.tipo = null; g.recamaras = null; g.banos = null; g.estacionamientos = null; g.amenidades = [] }
  else if (k === 'zona') g.zonas.splice(Number(v), 1)
  else if (k === 'presupuesto') { g.presupuesto_min = null; g.presupuesto_max = null }
  else if (k === 'recamaras' || k === 'banos' || k === 'estacionamientos') g[k] = null
  else if (k === 'amenidad') g.amenidades = g.amenidades.filter((a) => a !== v)
  else if (k === 'preferencia') g.preferencias = g.preferencias.filter((p) => p !== v)
  return g
}

/** Reglas del chat de comprar o rentar para app/empezar/ChatEntrada.tsx. */
export const REGLAS_COMPRAR = {
  ruta: '/api/chat-ficha',
  vacia: fichaVacia,
  chips: chipsDeFicha,
  quitar: quitarChip,
  siguiente: siguientePregunta,
  mensaje: (f: FichaChat, p: Pregunta | null) => mensajeDelChat(f, p, []),
  lista: fichaLista,
  saludo: 'Cuéntame qué buscas, como se lo dirías a una persona: qué tipo de propiedad, dónde y cuánto quieres pagar.',
  ejemplo: 'Busco casa para mi familia en Cumbres, con jardín, como de 4 millones.',
  titulo: '¿Qué buscas?',
  subtitulo: 'Escríbelo con tus palabras. Tu ficha se va llenando sola.',
  boton: 'Buscar',
  color: 'var(--c-verde)',
}
