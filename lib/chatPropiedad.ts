// Chat de entrada (Documento Maestro V10, §29.2), camino "vender o poner en renta". Piezas
// compartidas por el navegador (app/empezar/Recorrido.tsx) y el servidor (app/api/chat-propiedad).
//
// Claude SOLO traduce lo que el dueño escribe a esta ficha; las preguntas salen de aquí.
// Obligatorios: operación, tipo, ubicación (colonia y municipio) y el precio que pide (venta y/o
// renta mensual). Se preguntan UNA vez: m²; en casa o departamento, recámaras, baños,
// estacionamientos y amenidades. El chat nunca supone un precio: si no lo dijo, lo pregunta.

export const TIPOS_PROPIEDAD = ['Casa', 'Departamento', 'Terreno', 'Local comercial', 'Oficina', 'Bodega'] as const
export type TipoPropiedad = (typeof TIPOS_PROPIEDAD)[number]

/** Mismo vocabulario que activos.amenidades (restricción activos_amenidades_validas). */
export const AMENIDADES_PROPIEDAD: [string, string][] = [
  ['jardin', 'Jardín'], ['alberca', 'Alberca'], ['terraza', 'Terraza'], ['roof_garden', 'Roof garden'], ['seguridad_24h', 'Seguridad 24 h'],
  ['pet_friendly', 'Acepta mascotas'], ['gimnasio', 'Gimnasio'], ['elevador', 'Elevador'], ['cuarto_de_servicio', 'Cuarto de servicio'], ['area_de_juegos', 'Área de juegos'],
]
const ETIQUETA_AMENIDAD = Object.fromEntries(AMENIDADES_PROPIEDAD)

export interface FichaPropiedad {
  operacion: 'venta' | 'renta' | 'ambas' | null
  tipo: TipoPropiedad | null
  municipio: string | null
  colonia: string | null
  precio: number | null
  renta_mensual: number | null
  superficie: number | null
  recamaras: number | null
  banos: number | null
  estacionamientos: number | null
  /** Claves de AMENIDADES_PROPIEDAD. */
  amenidades: string[]
  /** Lo que el dueño contó y no es un campo de la ficha ("recién remodelada", "vista a la montaña"). */
  notas: string[]
}

export const propiedadVacia = (): FichaPropiedad => ({
  operacion: null, tipo: null, municipio: null, colonia: null, precio: null, renta_mensual: null,
  superficie: null, recamaras: null, banos: null, estacionamientos: null, amenidades: [], notas: [],
})

export type PreguntaPropiedad = 'operacion' | 'tipo' | 'municipio' | 'colonia' | 'precio' | 'renta' | 'superficie' | 'recamaras' | 'banos' | 'estacionamientos' | 'amenidades'
export const PREGUNTAS_PROPIEDAD: PreguntaPropiedad[] = ['operacion', 'tipo', 'municipio', 'colonia', 'precio', 'renta', 'superficie', 'recamaras', 'banos', 'estacionamientos', 'amenidades']

const habitacional = (t: TipoPropiedad | null) => t === 'Casa' || t === 'Departamento'
const vende = (f: FichaPropiedad) => f.operacion === 'venta' || f.operacion === 'ambas'
const renta = (f: FichaPropiedad) => f.operacion === 'renta' || f.operacion === 'ambas'

export const propiedadLista = (f: FichaPropiedad) =>
  !!(f.operacion && f.tipo && f.municipio && f.colonia && (!vende(f) || f.precio) && (!renta(f) || f.renta_mensual))

export function siguientePreguntaPropiedad(f: FichaPropiedad, ya: PreguntaPropiedad[]): PreguntaPropiedad | null {
  if (!f.operacion) return 'operacion'
  if (!f.tipo) return 'tipo'
  if (!f.municipio) return 'municipio'
  if (!f.colonia) return 'colonia'
  if (vende(f) && !f.precio) return 'precio'
  if (renta(f) && !f.renta_mensual) return 'renta'
  const una = (p: PreguntaPropiedad, falta: boolean) => falta && !ya.includes(p)
  if (una('superficie', f.superficie == null)) return 'superficie'
  if (habitacional(f.tipo)) {
    if (una('recamaras', f.recamaras == null)) return 'recamaras'
    if (una('banos', f.banos == null)) return 'banos'
    if (una('estacionamientos', f.estacionamientos == null)) return 'estacionamientos'
    if (una('amenidades', !f.amenidades.length)) return 'amenidades'
  }
  return null
}

const TEXTO: Record<PreguntaPropiedad, (f: FichaPropiedad) => string> = {
  operacion: () => '¿La quieres vender, rentar o las dos?',
  tipo: () => '¿Qué tipo de propiedad es? Casa, departamento, terreno, local, oficina o bodega.',
  municipio: () => '¿En qué municipio está?',
  colonia: () => '¿En qué colonia?',
  precio: () => '¿En cuánto la quieres vender?',
  renta: () => '¿En cuánto la quieres rentar al mes?',
  superficie: (f) => (f.tipo === 'Terreno' || f.tipo === 'Bodega' ? '¿Cuántos m² tiene de terreno?' : '¿Cuántos m² tiene?'),
  recamaras: () => '¿Cuántas recámaras tiene?',
  banos: () => '¿Cuántos baños?',
  estacionamientos: () => '¿Para cuántos coches tiene estacionamiento?',
  amenidades: () => '¿Tiene jardín, alberca, terraza, seguridad, gimnasio u otra amenidad?',
}

export function mensajeChatPropiedad(f: FichaPropiedad, pregunta: PreguntaPropiedad | null, repetida = false): string {
  // Si el dueño no sabe su precio, el chat no lo supone (§29.2): le explica que SMT Match le dará uno de mercado.
  if (repetida && (pregunta === 'precio' || pregunta === 'renta')) {
    return `No hay problema: al terminar, SMT Match te da un precio realista de mercado. Por ahora dime en cuánto te gustaría ${pregunta === 'renta' ? 'rentarla al mes' : 'venderla'}; lo puedes cambiar después.`
  }
  if (repetida && pregunta) return `No te entendí. ${TEXTO[pregunta](f)}`
  if (pregunta) return TEXTO[pregunta](f)
  return 'Tu ficha está lista. Revísala y dale "Analizar mi propiedad". Si quieres, sigue contándome más.'
}

export const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const DINERO = (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
export interface ChipPropiedad { clave: string; texto: string }

export function chipsDePropiedad(f: FichaPropiedad): ChipPropiedad[] {
  const c: ChipPropiedad[] = []
  if (f.operacion) c.push({ clave: 'operacion', texto: f.operacion === 'venta' ? 'En venta' : f.operacion === 'renta' ? 'En renta' : 'En venta y en renta' })
  if (f.tipo) c.push({ clave: 'tipo', texto: f.tipo })
  if (f.colonia || f.municipio) c.push({ clave: 'ubicacion', texto: [f.colonia, f.municipio].filter(Boolean).join(', ') })
  if (f.precio) c.push({ clave: 'precio', texto: `venta ${DINERO(f.precio)}` })
  if (f.renta_mensual) c.push({ clave: 'renta', texto: `renta ${DINERO(f.renta_mensual)} al mes` })
  if (f.superficie) c.push({ clave: 'superficie', texto: `${f.superficie.toLocaleString('es-MX')} m²` })
  if (f.recamaras != null) c.push({ clave: 'recamaras', texto: cuantos(f.recamaras, 'recámara', 'recámaras') })
  if (f.banos != null) c.push({ clave: 'banos', texto: cuantos(f.banos, 'baño', 'baños') })
  if (f.estacionamientos != null) c.push({ clave: 'estacionamientos', texto: cuantos(f.estacionamientos, 'estacionamiento', 'estacionamientos') })
  for (const a of f.amenidades) c.push({ clave: `amenidad:${a}`, texto: (ETIQUETA_AMENIDAD[a] ?? a).toLowerCase() })
  for (const n of f.notas) c.push({ clave: `nota:${n}`, texto: `nota: ${n}` })
  return c
}

export function quitarChipPropiedad(f: FichaPropiedad, clave: string): FichaPropiedad {
  const g: FichaPropiedad = { ...f, amenidades: [...f.amenidades], notas: [...f.notas] }
  const k = clave.split(':')[0], v = clave.slice(clave.indexOf(':') + 1)
  if (k === 'operacion') { g.operacion = null; g.precio = null; g.renta_mensual = null }
  else if (k === 'tipo') { g.tipo = null; g.recamaras = null; g.banos = null; g.estacionamientos = null; g.amenidades = [] }
  else if (k === 'ubicacion') { g.municipio = null; g.colonia = null }
  else if (k === 'precio') g.precio = null
  else if (k === 'renta') g.renta_mensual = null
  else if (k === 'superficie' || k === 'recamaras' || k === 'banos' || k === 'estacionamientos') g[k] = null
  else if (k === 'amenidad') g.amenidades = g.amenidades.filter((a) => a !== v)
  else if (k === 'nota') g.notas = g.notas.filter((n) => n !== v)
  return g
}

/** Reglas del chat de vender o poner en renta para app/empezar/ChatEntrada.tsx. */
export const REGLAS_VENDER = {
  ruta: '/api/chat-propiedad',
  vacia: propiedadVacia,
  chips: chipsDePropiedad,
  quitar: quitarChipPropiedad,
  siguiente: siguientePreguntaPropiedad,
  mensaje: mensajeChatPropiedad,
  lista: propiedadLista,
  saludo: 'Cuéntame de tu propiedad, como se lo dirías a una persona: qué es, dónde está, cómo es y en cuánto la quieres vender o rentar.',
  ejemplo: 'Quiero vender mi depa en Valle Oriente, 2 recámaras, 110 m², en 6 millones.',
  titulo: 'Cuéntanos de tu propiedad',
  subtitulo: 'Escríbelo con tus palabras. Tu ficha se va llenando sola.',
  boton: 'Analizar mi propiedad',
  color: '#c9a227',
}
