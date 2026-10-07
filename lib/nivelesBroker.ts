// Programa Broker Certificado SMT (Documento Maestro V6.3, §6.3 y §15): niveles por desempeño,
// inspirados en Uber Pro y el Superhost de Airbnb. Subir de nivel requiere REPORTAR cierres (que
// Operación verifica) -- así reportar le conviene al broker y se ataca la fuga de transacciones.
//
// V6.3: Aliado → Plata → Oro → Platino. "Certificado" dejó de ser un nivel: ahora "certificada" se
// refiere a la PROPIEDAD (certificación legal, §13). Aliado no se muestra a propietarios (§15).
//
// UMBRALES PROVISIONALES (decisión pendiente de JC): viven SOLO en NIVELES para cambiarlos en un
// solo lugar. Mientras no exista la certificación legal de propiedades, "documentada" = folio
// real o escritura declarados (tieneDocumentacion, en lib/expediente.ts).
//
// Pionero (Plan Piloto V1): marca que pone Operación a los brokers del piloto. Garantiza como
// mínimo Plata; si su desempeño da más, sube igual que cualquiera.

export interface MetricasBroker {
  propiedades: number
  conDocumentacion: number // folio real o escritura capturados
  cierresVerificados: number
  pionero?: boolean
}

/** Una meta medible para alcanzar un nivel (lo que la barra de progreso le muestra al broker). */
export interface Meta {
  etiqueta: string
  actual: number
  meta: number
}

export interface Nivel {
  id: 'aliado' | 'plata' | 'oro' | 'platino'
  nombre: string
  requisito: string
  /** Metas del nivel con el avance del broker. El nivel se cumple cuando todas se alcanzan. */
  metas: (m: MetricasBroker) => Meta[]
  cumple: (m: MetricasBroker) => boolean
}

// Gamificación (JC, 2026-10-07): cada nivel se define por METAS medibles y `cumple` se deriva de
// ellas, para que la barra de progreso del portal y el nivel calculado nunca se contradigan.
const propiedades = (m: MetricasBroker): Meta => ({ etiqueta: 'Propiedades en tu portafolio', actual: m.propiedades, meta: 3 })
// `base`: tamaño mínimo de portafolio sobre el que se calcula el porcentaje (Plata exige 3).
const documentadas = (m: MetricasBroker, pct: number, base: number): Meta => ({
  etiqueta: `Propiedades documentadas (${Math.round(pct * 100)}% del portafolio)`,
  actual: m.conDocumentacion,
  meta: Math.ceil(Math.max(m.propiedades, base) * pct),
})
const cierres = (m: MetricasBroker, n: number): Meta => ({ etiqueta: 'Cierres verificados', actual: m.cierresVerificados, meta: n })
const alcanzadas = (metas: Meta[]) => metas.every((x) => x.actual >= x.meta)

function nivel(id: Nivel['id'], nombre: string, requisito: string, metas: Nivel['metas'], extra?: (m: MetricasBroker) => boolean): Nivel {
  return { id, nombre, requisito, metas, cumple: (m) => !!extra?.(m) || alcanzadas(metas(m)) }
}

export const NIVELES: Nivel[] = [
  nivel('aliado', 'Aliado', 'Registrado en la plataforma', () => []),
  // Pionero (grupo piloto): Plata garantizado desde el primer día.
  nivel('plata', 'Plata', '3 propiedades o más, con al menos la mitad documentadas (folio real o escritura)',
    (m) => [propiedades(m), documentadas(m, 0.5, 3)], (m) => !!m.pionero),
  nivel('oro', 'Oro', 'Requisitos de Plata y al menos 1 cierre verificado',
    (m) => [propiedades(m), documentadas(m, 0.5, 3), cierres(m, 1)]),
  nivel('platino', 'Platino', '5 cierres verificados o más y 80% del portafolio documentado',
    (m) => [cierres(m, 5), documentadas(m, 0.8, 1)]),
]

export const ORDEN_NIVEL: Record<Nivel['id'], number> = { aliado: 0, plata: 1, oro: 2, platino: 3 }

/** Nivel más alto que cumple el broker, y el siguiente (null si ya está en el máximo). */
export function calcularNivel(m: MetricasBroker): { actual: Nivel; siguiente: Nivel | null } {
  let i = 0
  NIVELES.forEach((n, k) => { if (n.cumple(m)) i = k })
  return { actual: NIVELES[i], siguiente: NIVELES[i + 1] ?? null }
}
