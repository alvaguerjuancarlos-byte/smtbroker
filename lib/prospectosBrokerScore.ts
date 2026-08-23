// Score explicable (no ML) del módulo de Prospección de Brokers — reglas simples, auditables,
// ajustables por parámetro. Ver HANDOFF_Prospeccion_Brokers.md Sección 3. Se corre igual al alta
// manual que en una futura ingesta automatizada — el pipeline de scoring no distingue origen.
//
// "Presencia digital verificable" (+2 en el handoff) es evaluación MANUAL en Fase 1a, no entra
// aquí como regla automática — el broker maestro la aplica a mano al revisar en la cola.

// Punto de partida sugerido por el handoff, no validado con datos reales — ajustar con los
// primeros lotes.
export const UMBRAL_VOLUMEN = 5
export const UMBRAL_COLA = 5

// Substrings (minúsculas) que identifican zona del piloto — coincide con los municipios ya
// usados en app/activo/nuevo/page.tsx para el piloto Fase 1a (San Pedro Garza García).
export const ZONAS_PILOTO = ['san pedro', 'corredor de desarrollo']

export interface InsumosScore {
  zona: string
  volumenListadosAparente: number | null
  afiliacionPrevia: boolean
}

export interface ResultadoScore {
  score: number
  excluido: boolean
  razones: string[]
}

function esZonaPiloto(zona: string): boolean {
  const z = zona.toLowerCase()
  return ZONAS_PILOTO.some(p => z.includes(p))
}

export function calcularScore({ zona, volumenListadosAparente, afiliacionPrevia }: InsumosScore): ResultadoScore {
  // Afiliación previa excluye del flujo — no entra a la cola de revisión, sin importar el resto.
  if (afiliacionPrevia) {
    return { score: 0, excluido: true, razones: ['Afiliación previa detectada — excluido del flujo'] }
  }

  let score = 0
  const razones: string[] = []

  if (zona && esZonaPiloto(zona)) {
    score += 3
    razones.push('Zona del piloto (+3)')
  }
  if (volumenListadosAparente != null && volumenListadosAparente >= UMBRAL_VOLUMEN) {
    score += 2
    razones.push(`Volumen de actividad ≥ ${UMBRAL_VOLUMEN} (+2)`)
  }

  return { score, excluido: false, razones }
}
