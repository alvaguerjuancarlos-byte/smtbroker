// Lectura de UN anuncio de portal a petición del comprador (Documento Maestro V8; opción 2, JC
// 10-nov-2026). Lógica pura, sin red: la usa lib/lecturaAnuncioServidor.ts.
//
// Reglas:
//   - Si el portal bloquea la lectura (verificación anti-robots, acceso denegado), NO se evade: se
//     marca 'bloqueado' y el comprador escribe el precio y los m² que vio.
//   - Cada número que extrae el modelo debe venir con la cita exacta del texto, y la cita debe estar
//     en la página y contener ese número (mismo criterio que smt-developer/lib/mercado/
//     serperComparables.ts: lo que no se comprueba se descarta).
//   - Nunca se guarda nada del anunciante (nombre, teléfono, correo).
//
// Sin imports de alias: se prueba con `node --test lib/lecturaAnuncio.test.ts`.

// Señales de que el portal no dejó leer la página (probado el 10-nov-2026: Inmuebles24 "Just a
// moment...", Mercado Libre "account-verification", Lamudi "Access Denied", Propiedades.com
// "Challenge Validation", Doorvel "The request could not be satisfied").
const SENALES_BLOQUEO = [
  /just a moment/i, /are not a bot/i, /captcha/i, /access denied/i, /challenge validation/i,
  /account-verification/i, /request could not be satisfied/i, /returned error 40[13]/i, /attention required/i,
]

export function detectarBloqueo(texto: string): boolean {
  const cabecera = texto.slice(0, 1500)
  return SENALES_BLOQUEO.some((re) => re.test(cabecera)) || texto.replace(/\s+/g, ' ').trim().length < 400
}

const soloDigitos = (s: string) => s.replace(/[^\d]/g, '')

/**
 * ¿La cita está en el texto y contiene el número? Compara sin espacios ni mayúsculas, y el número
 * por sus dígitos (así "$16,470,000" y "16470000" coinciden; "16.5 millones" se acepta si la cita
 * trae "16.5" y "millones").
 */
export function citaValida(texto: string, cita: unknown, numero: number | null): boolean {
  if (numero == null || typeof cita !== 'string' || cita.trim().length < 3) return false
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!norm(texto).includes(norm(cita))) return false
  const digitosCita = soloDigitos(cita)
  const entero = String(Math.round(numero))
  if (digitosCita.includes(entero)) return true
  // "16.5 millones", "1,200 m²" con decimales: el número en millones o con un decimal.
  const millones = numero / 1_000_000
  if (/mill|mdp/i.test(cita) && digitosCita.includes(soloDigitos(String(+millones.toFixed(2))))) return true
  return digitosCita.includes(soloDigitos(String(+numero.toFixed(1))))
}

export interface DatosAnuncio {
  titulo: string | null
  precio: number | null      // MXN, precio total de venta
  superficie: number | null  // m² (construcción o terreno, la principal del anuncio)
  tipo: string | null
  municipio: string | null
  colonia: string | null
  recamaras: number | null
  banos: number | null
}

/** Lo que regresa el modelo, antes de verificar. */
export interface ExtraccionModelo {
  esListado?: boolean
  esVenta?: boolean
  titulo?: string | null
  precio?: number | null
  moneda?: string | null
  citaPrecio?: string | null
  superficieM2?: number | null
  citaSuperficie?: string | null
  tipo?: string | null
  municipio?: string | null
  colonia?: string | null
  recamaras?: number | null
  banos?: number | null
}

export type ResultadoLectura =
  | { lectura: 'leido'; datos: DatosAnuncio; descartados: string[] }
  | { lectura: 'listado' | 'bloqueado' | 'fallo'; motivo: string }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const txt = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Verifica lo que extrajo el modelo contra el texto de la página. */
export function verificarExtraccion(texto: string, e: ExtraccionModelo): ResultadoLectura {
  if (e.esListado) return { lectura: 'listado', motivo: 'Es una página de resultados con muchas propiedades, no un anuncio.' }
  if (e.esVenta === false) return { lectura: 'fallo', motivo: 'El anuncio es de renta, no de venta.' }
  const descartados: string[] = []
  let precio = num(e.precio)
  if (precio && e.moneda && !/mxn|pesos|mn/i.test(e.moneda)) { descartados.push(`precio en ${e.moneda}`); precio = null }
  if (precio && !citaValida(texto, e.citaPrecio, precio)) { descartados.push('precio sin cita comprobable'); precio = null }
  let superficie = num(e.superficieM2)
  if (superficie && !citaValida(texto, e.citaSuperficie, superficie)) { descartados.push('superficie sin cita comprobable'); superficie = null }
  if (!precio && !superficie) return { lectura: 'fallo', motivo: 'No se encontró un precio ni una superficie comprobables en la página.' }
  return {
    lectura: 'leido', descartados,
    datos: {
      titulo: txt(e.titulo, 200), precio, superficie, tipo: txt(e.tipo, 40), municipio: txt(e.municipio, 80),
      colonia: txt(e.colonia, 80), recamaras: num(e.recamaras), banos: num(e.banos),
    },
  }
}
