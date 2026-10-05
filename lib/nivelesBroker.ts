// Programa Broker Certificado SMT (Documento Maestro V6.1, §6.3): niveles por desempeño, inspirados
// en Uber Pro y el Superhost de Airbnb. Subir de nivel requiere REPORTAR cierres (que Operación
// verifica) -- así reportar le conviene al broker y se ataca la fuga de transacciones (§6.2).
//
// UMBRALES PROVISIONALES: V6.1 §7 deja pendiente la decisión de JC sobre cuántos cierres, qué
// calidad de inventario y qué beneficios por nivel. Viven SOLO en NIVELES para cambiarlos en un
// solo lugar.

export interface MetricasBroker {
  propiedades: number
  conDocumentacion: number // folio real o escritura capturados
  cierresVerificados: number
}

export interface Nivel {
  id: 'aliado' | 'certificado' | 'plata' | 'oro'
  nombre: string
  requisito: string
  cumple: (m: MetricasBroker) => boolean
}

const pctDoc = (m: MetricasBroker) => (m.propiedades ? m.conDocumentacion / m.propiedades : 0)

export const NIVELES: Nivel[] = [
  { id: 'aliado', nombre: 'Aliado', requisito: 'Registrado en la plataforma', cumple: () => true },
  {
    id: 'certificado', nombre: 'Certificado',
    requisito: '3 propiedades o más, con al menos la mitad documentadas (folio real o escritura)',
    cumple: (m) => m.propiedades >= 3 && pctDoc(m) >= 0.5,
  },
  {
    id: 'plata', nombre: 'Plata',
    requisito: 'Certificado y al menos 1 cierre verificado',
    cumple: (m) => m.propiedades >= 3 && pctDoc(m) >= 0.5 && m.cierresVerificados >= 1,
  },
  {
    id: 'oro', nombre: 'Oro',
    requisito: '5 cierres verificados o más y 80% del portafolio documentado',
    cumple: (m) => m.cierresVerificados >= 5 && pctDoc(m) >= 0.8,
  },
]

export const ORDEN_NIVEL: Record<Nivel['id'], number> = { aliado: 0, certificado: 1, plata: 2, oro: 3 }

/** Nivel más alto que cumple el broker, y el siguiente (null si ya está en el máximo). */
export function calcularNivel(m: MetricasBroker): { actual: Nivel; siguiente: Nivel | null } {
  let i = 0
  NIVELES.forEach((n, k) => { if (n.cumple(m)) i = k })
  return { actual: NIVELES[i], siguiente: NIVELES[i + 1] ?? null }
}

export const tieneDocumentacion = (a: { folio_real?: string | null; escritura_publica?: string | null }) =>
  !!(a.folio_real?.trim() || a.escritura_publica?.trim())
