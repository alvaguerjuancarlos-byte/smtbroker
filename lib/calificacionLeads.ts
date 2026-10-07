// Calificación de leads de la página pública (Documento Maestro V6.3, §14.2): REGLAS EXPLICABLES,
// igual que el matching (lib/matching.ts) -- cada categoría viene con sus razones en español para
// que el broker sepa a quién atender primero y por qué.
//
//   Serio       coincide con el presupuesto, plazo menor a 3 meses y contado o crédito aprobado
//   Calificado  coincide con el presupuesto y plazo menor a 6 meses
//   Interesado  dejó sus datos, pero falta información o no coincide del todo
//   Curioso     muy fuera del presupuesto, o sin presupuesto ni plazo definidos
//
// Criterios PROVISIONALES (V6.3 §14.2): viven solo aquí. Se prueba con
// `node --test lib/calificacionLeads.test.ts`.
import { parsePresupuesto } from './matching.ts'

export type Plazo = 'menos_3m' | '3_6m' | 'mas_6m' | 'sin_definir'
export type FormaPago = 'contado' | 'credito_aprobado' | 'credito_tramite' | 'no_se'
export type CategoriaLead = 'serio' | 'calificado' | 'interesado' | 'curioso'

export interface LeadEntrada {
  presupuesto: string | null
  plazo: Plazo
  formaPago: FormaPago
}

export const PLAZOS: Record<Plazo, string> = {
  menos_3m: 'Menos de 3 meses', '3_6m': 'De 3 a 6 meses', mas_6m: 'Más de 6 meses', sin_definir: 'Aún no lo sé',
}
export const FORMAS_PAGO: Record<FormaPago, string> = {
  contado: 'De contado', credito_aprobado: 'Crédito aprobado', credito_tramite: 'Crédito en trámite', no_se: 'Aún no lo sé',
}
/** Rangos que ofrece el formulario (mismo formato que entiende parsePresupuesto). */
export const RANGOS_PRESUPUESTO = ['Menos de $5M', '$5M – $10M', '$10M – $20M', '$20M – $40M', 'Más de $40M']

export const ETIQUETA_CATEGORIA: Record<CategoriaLead, string> = {
  serio: 'Serio', calificado: 'Calificado', interesado: 'Interesado', curioso: 'Curioso',
}

const TOLERANCIA = 0.15 // "coincide": dentro del rango ±15 %, igual que el matching
const MUY_FUERA = 0.3   // "muy fuera": más de 30 % por encima del máximo o debajo de la mitad del mínimo

const mxn = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`)

export function calificarLead(lead: LeadEntrada, precio: number | null): { categoria: CategoriaLead; razones: string[] } {
  const razones: string[] = []
  const r = parsePresupuesto(lead.presupuesto)
  let coincide = false
  let muyFuera = false

  if (!r) razones.push('No indicó presupuesto')
  else if (!precio) razones.push('La propiedad no tiene precio de lista para comparar')
  else {
    coincide = precio >= r.min * (1 - TOLERANCIA) && precio <= r.max * (1 + TOLERANCIA)
    muyFuera = precio > r.max * (1 + MUY_FUERA) || precio < r.min * 0.5
    razones.push(coincide
      ? `El precio (${mxn(precio)}) está en su presupuesto (${lead.presupuesto})`
      : `El precio (${mxn(precio)}) está ${muyFuera ? 'muy ' : ''}fuera de su presupuesto (${lead.presupuesto})`)
  }

  razones.push(`Plazo: ${PLAZOS[lead.plazo].toLowerCase()}`)
  razones.push(`Pago: ${FORMAS_PAGO[lead.formaPago].toLowerCase()}`)

  const pagoListo = lead.formaPago === 'contado' || lead.formaPago === 'credito_aprobado'
  const categoria: CategoriaLead =
    coincide && lead.plazo === 'menos_3m' && pagoListo ? 'serio'
      : coincide && (lead.plazo === 'menos_3m' || lead.plazo === '3_6m') ? 'calificado'
        : muyFuera || (!r && lead.plazo === 'sin_definir') ? 'curioso'
          : 'interesado'

  return { categoria, razones }
}
