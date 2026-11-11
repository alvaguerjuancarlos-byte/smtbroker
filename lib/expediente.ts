// Expediente legal de un activo (Documento Maestro V6.3, §13 — diagnóstico en dos niveles).
//
// El diagnóstico RÁPIDO (gratis) no da un veredicto legal: con el expediente vacío (lo normal al
// dar de alta una propiedad, y siempre en lo importado de EasyBroker) un dictamen solo diría "no
// apto", que es honesto pero inútil. En su lugar dice exactamente qué falta para poder pedir la
// CERTIFICACIÓN legal (de pago), que es donde corre el dictamen completo del Agente Legal.
//
// Determinista y sin dependencias: se prueba con `node --test lib/expediente.test.ts`.
// Valores reales de las columnas (app/components/CatastroLegalSection.tsx): escritura_publica
// 'si' | 'no' | 'no_sabe' | null; gravamenes_conocidos 'ninguno' | 'hipotecario' | 'otro' |
// 'no_sabe'; uso_suelo_declarado ... | 'no_determinado'.

export interface ActivoExpediente {
  folio_real?: string | null
  clave_catastral?: string | null
  escritura_publica?: string | null
  gravamenes_conocidos?: string | null
  uso_suelo_declarado?: string | null
}

export interface DocumentoFaltante {
  campo: keyof ActivoExpediente
  documento: string
  porque: string
}

const vacio = (s: string | null | undefined) => !s?.trim()

/** La escritura cuenta solo si se declaró que existe ('si' o un dato capturado), no 'no'/'no_sabe'. */
export const tieneEscritura = (e: string | null | undefined) =>
  !vacio(e) && !['no', 'no_sabe'].includes((e as string).trim().toLowerCase())

/**
 * Certificación de VENTA o de RENTA (V9, §22.6). La de renta es más ligera: que quien renta pueda
 * rentar (escritura o constancia de propiedad, clave catastral para el predial) y, en locales,
 * oficinas y bodegas, el uso de suelo para el giro. No pide folio real ni gravámenes.
 */
export type AlcanceCertificacion = 'venta' | 'renta'
export const ETIQUETA_ALCANCE: Record<AlcanceCertificacion, string> = { venta: 'Certificación de venta', renta: 'Certificación de renta' }
export const REVISION_RENTA = [
  'Identidad del dueño o poder del administrador',
  'Escritura o constancia de propiedad',
  'Predial al corriente',
  'Uso de suelo para el giro (locales, oficinas y bodegas)',
]
/** Una propiedad solo en renta se certifica para renta; en venta (o en las dos), la de venta, que también sirve para rentar. */
export const alcancePara = (operacion: string | null | undefined): AlcanceCertificacion => (operacion === 'renta' ? 'renta' : 'venta')

export function documentosFaltantes(a: ActivoExpediente & { tipo?: string | null }, alcance: AlcanceCertificacion = 'venta'): DocumentoFaltante[] {
  const faltan: DocumentoFaltante[] = []
  const renta = alcance === 'renta'
  if (!renta && vacio(a.folio_real)) faltan.push({
    campo: 'folio_real', documento: 'Folio real',
    porque: 'Identifica el inmueble en el Registro Público de la Propiedad.',
  })
  if (!tieneEscritura(a.escritura_publica)) faltan.push({
    campo: 'escritura_publica', documento: 'Escritura pública',
    porque: renta ? 'Acredita quién es el dueño y que puede rentar.' : 'Acredita quién es el dueño y que puede vender.',
  })
  if (vacio(a.clave_catastral)) faltan.push({
    campo: 'clave_catastral', documento: 'Clave catastral',
    porque: 'Liga la propiedad con el catastro municipal (predial y uso de suelo).',
  })
  if (!renta && (vacio(a.gravamenes_conocidos) || a.gravamenes_conocidos === 'no_sabe')) faltan.push({
    campo: 'gravamenes_conocidos', documento: 'Gravámenes declarados',
    porque: 'Hipotecas o embargos que el comprador debe conocer antes de ofertar.',
  })
  const usoAplica = !renta || /local|oficina|bodega/i.test(a.tipo ?? '')
  if (usoAplica && (vacio(a.uso_suelo_declarado) || a.uso_suelo_declarado === 'no_determinado')) faltan.push({
    campo: 'uso_suelo_declarado', documento: 'Uso de suelo declarado',
    porque: 'Se contrasta con la zonificación oficial del municipio.',
  })
  return faltan
}

/** "Documentada" para los niveles de broker (lib/nivelesBroker.ts): folio real o escritura. */
export const tieneDocumentacion = (a: ActivoExpediente) => !vacio(a.folio_real) || tieneEscritura(a.escritura_publica)

/** Con el expediente completo se puede pedir la certificación legal. */
export const listoParaCertificar = (a: ActivoExpediente) => documentosFaltantes(a).length === 0

// Certificación GRATIS con límite (decisión de JC, 2026-10-07; migración 20261008000600).
export type EstadoCertificacion = 'en_revision' | 'certificada' | 'rechazada'

/** Certificaciones gratis por persona al mes (los Pioneros no tienen límite). */
export const LIMITE_CERTIFICACIONES_MES = 3

export const ETIQUETA_CERTIFICACION: Record<EstadoCertificacion, string> = {
  en_revision: 'Certificación en revisión',
  certificada: 'Inventario certificado',
  rechazada: 'Certificación no aprobada',
}
