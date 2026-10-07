// Programa Broker Certificado SMT (Documento Maestro V6.3, §6.3 y §15): niveles por desempeño,
// inspirados en Uber Pro y el Superhost de Airbnb. Subir de nivel requiere REPORTAR cierres (que
// Operación verifica) -- así reportar le conviene al broker y se ataca la fuga de transacciones.
//
// V6.3: Aliado → Plata → Oro → Platino. "Certificado" dejó de ser un nivel: ahora "certificada" se
// refiere a la PROPIEDAD (certificación legal, §13). Aliado no se muestra a propietarios (§15).
//
// UMBRALES PROVISIONALES (decisión pendiente de JC): viven SOLO en NIVELES para cambiarlos en un
// solo lugar. Mientras no exista la certificación legal de propiedades, "documentada" = folio
// real o escritura capturados (tieneDocumentacion).
//
// Fundador (Plan Piloto V1): marca que pone Operación a los brokers del piloto. Garantiza como
// mínimo Plata; si su desempeño da más, sube igual que cualquiera.

export interface MetricasBroker {
  propiedades: number
  conDocumentacion: number // folio real o escritura capturados
  cierresVerificados: number
  fundador?: boolean
}

export interface Nivel {
  id: 'aliado' | 'plata' | 'oro' | 'platino'
  nombre: string
  requisito: string
  cumple: (m: MetricasBroker) => boolean
}

const pctDoc = (m: MetricasBroker) => (m.propiedades ? m.conDocumentacion / m.propiedades : 0)
const portafolioBase = (m: MetricasBroker) => m.propiedades >= 3 && pctDoc(m) >= 0.5

export const NIVELES: Nivel[] = [
  { id: 'aliado', nombre: 'Aliado', requisito: 'Registrado en la plataforma', cumple: () => true },
  {
    id: 'plata', nombre: 'Plata',
    requisito: '3 propiedades o más, con al menos la mitad documentadas (folio real o escritura)',
    cumple: (m) => !!m.fundador || portafolioBase(m),
  },
  {
    id: 'oro', nombre: 'Oro',
    requisito: 'Requisitos de Plata y al menos 1 cierre verificado',
    cumple: (m) => portafolioBase(m) && m.cierresVerificados >= 1,
  },
  {
    id: 'platino', nombre: 'Platino',
    requisito: '5 cierres verificados o más y 80% del portafolio documentado',
    cumple: (m) => m.cierresVerificados >= 5 && pctDoc(m) >= 0.8,
  },
]

export const ORDEN_NIVEL: Record<Nivel['id'], number> = { aliado: 0, plata: 1, oro: 2, platino: 3 }

/** Nivel más alto que cumple el broker, y el siguiente (null si ya está en el máximo). */
export function calcularNivel(m: MetricasBroker): { actual: Nivel; siguiente: Nivel | null } {
  let i = 0
  NIVELES.forEach((n, k) => { if (n.cumple(m)) i = k })
  return { actual: NIVELES[i], siguiente: NIVELES[i + 1] ?? null }
}

export const tieneDocumentacion = (a: { folio_real?: string | null; escritura_publica?: string | null }) =>
  !!(a.folio_real?.trim() || a.escritura_publica?.trim())
