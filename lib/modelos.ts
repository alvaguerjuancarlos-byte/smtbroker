// Modelos de Claude de los agentes -- un solo lugar para cambiarlos (antes estaban escritos en cada
// ruta). Actualizados el 2026-10-07 (paso 4 del plan V6.3) desde claude-sonnet-4-6 y
// claude-haiku-4-5-20251001.
//
// En Claude Opus 5.5 el razonamiento (thinking) siempre está activo y sus tokens cuentan contra
// max_tokens: por eso el límite sube de 1,500–2,000 a 16,000 (un JSON de dictamen corto más el
// razonamiento). No se manda `temperature` (ese modelo la rechaza).

/** Dictamen legal y análisis de mercado (JSON estructurado). */
export const MODELO_DICTAMEN = 'claude-opus-5-5'
export const MAX_TOKENS_DICTAMEN = 16000

/** Extracción de comparables desde resultados de búsqueda (tarea mecánica, alto volumen). */
export const MODELO_EXTRACCION = 'claude-haiku-4-5'
