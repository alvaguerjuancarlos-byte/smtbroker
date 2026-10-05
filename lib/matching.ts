// Motor de matching v0 (Documento Maestro V6.1, §4 y §6): cruza un activo con un perfil de
// búsqueda con REGLAS EXPLICABLES, no embeddings (mismo principio que la prospección, V5 §8.4).
// Cada match devuelve sus razones en español para que el broker y Operación entiendan por qué.
//
// Los perfiles están en texto libre y con formatos mezclados (datos reales, 2026-10-05):
//   presupuesto "$3M - $8M" / "$5M – $15M" / "Menos de $2M" / "Más de $50M"
//   tipo        "Depto" / "Departamentos, casas" / "Locales comerciales"
//   zona        "San Pedro / Santa Catarina" / "Valle Oriente" (no es municipio)
// Por eso todo pasa primero por normalizadores.
//
// Sin dependencias ni imports: se prueba con `node --test lib/matching.test.ts`.

export interface ActivoMatch {
  tipo: string | null
  municipio: string | null
  colonia?: string | null
  precio_total: number | null
  status?: string | null
}

export interface PerfilMatch {
  presupuesto: string | null
  zona: string | null
  tipo_activo_interes: string | null
}

export interface ResultadoMatch {
  score: number
  razones: string[]
  coincideTipo: boolean
}

export const UMBRAL_MATCH = 60
const PUNTOS = { tipo: 40, zona: 30, precioDentro: 30, precioCerca: 15 }
const TOLERANCIA_PRECIO = 0.15

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ── Presupuesto ─────────────────────────────────────────────────────────────────────────────

function aPesos(numero: string, unidad: string | undefined): number {
  const n = parseFloat(numero.replace(/,/g, ''))
  const u = (unidad || '').toLowerCase()
  if (u === 'mil' || u.startsWith('k')) return n * 1_000 // antes que 'm': "mil" también empieza con m
  if (u.startsWith('m')) return n * 1_000_000
  return n
}

/** "$3M - $8M" → {min: 3e6, max: 8e6}. "Menos de $2M" → {min: 0, max: 2e6}. null si no se entiende. */
export function parsePresupuesto(texto: string | null | undefined): { min: number; max: number } | null {
  if (!texto) return null
  const t = sinAcentos(texto)
  const nums = [...t.matchAll(/\$?\s*(\d+(?:[.,]\d+)?)\s*(millones|mdp|mil|m|k)?/g)]
    .map((m) => aPesos(m[1], m[2] ?? (/millon|mdp|\dm\b/.test(t) ? 'm' : undefined)))
    .filter((n) => n > 0)
  if (nums.length === 0) return null
  if (/menos de|hasta/.test(t)) return { min: 0, max: nums[0] }
  if (/mas de|desde/.test(t)) return { min: nums[0], max: Infinity }
  if (nums.length === 1) return { min: nums[0] * (1 - TOLERANCIA_PRECIO), max: nums[0] * (1 + TOLERANCIA_PRECIO) }
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) }
}

// ── Tipo de propiedad ──────────────────────────────────────────────────────────────────────

const SINONIMOS_TIPO: [RegExp, string][] = [
  [/\bcasas?\b|\bresidencia/, 'casa'],
  [/\bdeptos?\b|\bdepartamentos?\b|\bdpto\b|\bdepa\b/, 'departamento'],
  [/\bterrenos?\b|\blotes?\b|\bpredios?\b/, 'terreno'],
  [/\blocal(es)?\b|\bcomercial(es)?\b/, 'local'],
  [/\bbodegas?\b|\bnave(s)? industrial/, 'bodega'],
  [/\bedificios?\b|\btorres?\b/, 'edificio'],
  [/\boficinas?\b/, 'oficina'],
]

/** "Departamentos, casas" → {departamento, casa}. */
export function normalizarTipos(texto: string | null | undefined): Set<string> {
  const t = sinAcentos(texto || '')
  return new Set(SINONIMOS_TIPO.filter(([re]) => re.test(t)).map(([, canon]) => canon))
}

// ── Zona ───────────────────────────────────────────────────────────────────────────────────

const MUNICIPIOS: [RegExp, string][] = [
  [/san pedro|garza garcia|\bspgg\b/, 'San Pedro Garza García'],
  [/monterrey|\bmty\b/, 'Monterrey'],
  [/santa catarina/, 'Santa Catarina'],
  [/apodaca/, 'Apodaca'],
  [/guadalupe/, 'Guadalupe'],
  [/san nicolas/, 'San Nicolás de los Garza'],
  [/escobedo/, 'General Escobedo'],
  [/(?<!garza )\bgarcia\b/, 'García'], // "San Pedro Garza García" NO es el municipio García
]

// Zonas conocidas que la gente escribe en lugar del municipio. Diccionario pequeño a propósito:
// crecerá con los datos reales que capture Operación.
const ZONAS_CONOCIDAS: [RegExp, string][] = [
  [/valle oriente|del valle|fuentes del valle|chipinque|valle poniente|arboleda/, 'San Pedro Garza García'],
  [/carretera nacional|cumbres|contry|centro de monterrey|obispado/, 'Monterrey'],
]

/** "San Pedro / Santa Catarina" → {San Pedro Garza García, Santa Catarina}. */
export function normalizarZonas(texto: string | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const parte of sinAcentos(texto || '').split(/\/|,|;|\by\b/)) {
    const p = parte.trim()
    if (!p) continue
    for (const [re, mun] of [...ZONAS_CONOCIDAS, ...MUNICIPIOS]) {
      if (re.test(p)) out.add(mun)
    }
  }
  return out
}

const municipioCanonico = (m: string | null | undefined) => [...normalizarZonas(m)][0] ?? (m || '')

// ── Puntuación ─────────────────────────────────────────────────────────────────────────────

const mxn = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`)
const rango = (r: { min: number; max: number }) =>
  r.max === Infinity ? `desde ${mxn(r.min)}` : r.min === 0 ? `hasta ${mxn(r.max)}` : `${mxn(r.min)}–${mxn(r.max)}`

export function puntuarMatch(activo: ActivoMatch, perfil: PerfilMatch): ResultadoMatch {
  const razones: string[] = []
  let score = 0

  const tipoActivo = [...normalizarTipos(activo.tipo)][0]
  const tiposBuscados = normalizarTipos(perfil.tipo_activo_interes)
  const coincideTipo = !!tipoActivo && tiposBuscados.has(tipoActivo)
  if (coincideTipo) {
    score += PUNTOS.tipo
    razones.push(`Busca ${tipoActivo}`)
  }

  const zonas = normalizarZonas(perfil.zona)
  const muni = municipioCanonico(activo.municipio)
  const zonaActivo = new Set([...normalizarZonas(activo.municipio), ...normalizarZonas(activo.colonia)])
  if ([...zonas].some((z) => zonaActivo.has(z))) {
    score += PUNTOS.zona
    razones.push(`Busca en ${muni}`)
  }

  const r = parsePresupuesto(perfil.presupuesto)
  const precio = activo.precio_total
  if (r && precio && precio > 0) {
    if (precio >= r.min && precio <= r.max) {
      score += PUNTOS.precioDentro
      razones.push(`Precio ${mxn(precio)} dentro de su presupuesto (${rango(r)})`)
    } else if (precio >= r.min * (1 - TOLERANCIA_PRECIO) && precio <= r.max * (1 + TOLERANCIA_PRECIO)) {
      score += PUNTOS.precioCerca
      razones.push(`Precio ${mxn(precio)} cerca de su presupuesto (${rango(r)})`)
    }
  }

  return { score, razones, coincideTipo }
}

/** Un match se muestra si coincide el tipo, alcanza el umbral y el activo sigue disponible. */
export function esMatchValido(activo: ActivoMatch, resultado: ResultadoMatch): boolean {
  return activo.status !== 'cerrado' && resultado.coincideTipo && resultado.score >= UMBRAL_MATCH
}
