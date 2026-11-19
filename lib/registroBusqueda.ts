// Registro de una búsqueda (guion v12, momento 3; JC, 19-nov-2026): TODO lo que SMT Match revisó para
// una necesidad, de dónde vino cada cosa y si pasó o por qué no. Se guarda al crear la necesidad
// (lib/necesidadServidor.ts → tabla busquedas_registro). El cliente ve solo el resumen; Operación, el
// detalle en /panel.

export type Revision = 'plataforma' | 'portal' | 'comparable'
/** mostrada: el cliente la ve · descartada: no cumple o no sirve · referencia: comparable de precio usado. */
export type Resultado = 'mostrada' | 'descartada' | 'referencia'

export interface ItemRegistro {
  revision: Revision
  fuente: string
  titulo: string
  url: string | null
  /** Precio o renta (plataforma y comparables), si se conoce. */
  precio: number | null
  m2: number | null
  /** Índice de la zona de la ficha donde se buscó, o null. */
  zona: number | null
  resultado: Resultado
  razon: string | null
}

export interface ResumenRegistro {
  /** Propiedades y anuncios revisados (sin repetir la misma liga). */
  revisadas: number
  fuentes: number
  /** Los que el cliente ve en su tablero al guardar la búsqueda. */
  cumplen: number
  nombresFuentes: string[]
}

// Nombre visible de cada sitio (los portales de lib/necesidadServidor.ts y otros que aparecen en los comparables).
const NOMBRES: [string, string][] = [
  ['inmuebles24.com', 'inmuebles24'], ['vivanuncios.com.mx', 'Vivanuncios'], ['propiedades.com', 'Propiedades.com'],
  ['mercadolibre.com.mx', 'Mercado Libre'], ['lamudi.com.mx', 'Lamudi'], ['doorvel.com', 'Doorvel'], ['spot2.mx', 'Spot2'],
  ['casasyterrenos.com', 'Casas y Terrenos'], ['easybroker.com', 'EasyBroker'], ['avisosdeocasion.com', 'Avisos de Ocasión'], ['monopolio.com.mx', 'Monopolio'],
  ['metroscubicos.com', 'Metros Cúbicos'], ['icasas.mx', 'iCasas'], ['trovit.com.mx', 'Trovit'], ['nocnok.com', 'Nocnok'],
]

/** "https://www.inmuebles24.com/..." → "inmuebles24"; un sitio desconocido, su dominio sin www. */
export function fuenteDeUrl(url: string): string {
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch { return 'otro sitio' }
  const conocido = NOMBRES.find(([d]) => host === d || host.endsWith('.' + d))
  return conocido ? conocido[1] : host.replace(/^www\./, '')
}

/** Ligas de redirección del propio buscador (google.com/goto…): no son anuncios ni fuentes; no se registran. */
export function esLigaDelBuscador(url: string): boolean {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'google.com' || h.endsWith('.google.com') || /^google\.com\.\w+$/.test(h) } catch { return true }
}

export function resumirRegistro(items: ItemRegistro[]): ResumenRegistro {
  // Una misma liga revisada dos veces (p. ej. como anuncio y como comparable) cuenta una vez.
  const vistas = new Set<string>()
  let revisadas = 0
  for (const i of items) {
    const clave = i.url ?? `${i.revision}:${i.titulo}`
    if (vistas.has(clave)) continue
    vistas.add(clave); revisadas++
  }
  const nombresFuentes = [...new Set(items.map((i) => i.fuente))].sort((a, b) => (a === 'SMT Match' ? -1 : b === 'SMT Match' ? 1 : a.localeCompare(b)))
  return { revisadas, fuentes: nombresFuentes.length, cumplen: items.filter((i) => i.resultado === 'mostrada').length, nombresFuentes }
}

/** La línea del tablero del cliente. */
export function lineaRegistro(r: Pick<ResumenRegistro, 'revisadas' | 'fuentes' | 'cumplen'>): string {
  const p = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`
  // "Te mostramos", no "cumplen": parte de lo que se muestra son páginas de portales sin verificar (JC, 19-nov).
  const revisamos = `Revisamos ${p(r.revisadas, 'propiedad y anuncio', 'propiedades y anuncios')} en ${p(r.fuentes, 'fuente', 'fuentes')}.`
  if (r.cumplen === 0) return `${revisamos} Ninguna coincide todavía con lo que pides: te avisamos en cuanto aparezca.`
  return `${revisamos} ${r.cumplen === 1 ? 'Te mostramos la que coincide' : `Te mostramos las ${r.cumplen.toLocaleString('es-MX')} que coinciden`} con lo que pides.`
}
