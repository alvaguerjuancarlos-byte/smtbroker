// Conexión entre el comprador y quien ofrece la propiedad (Documento Maestro V8, Parte 3, §21).
// Lógica pura, sin red ni base: la usan app/api/conexiones, el cron de seguimiento y las pantallas.
//
// La plataforma conecta, ordena la visita, registra la intención de oferta y da seguimiento hasta el
// cierre verificado. NO negocia ni cierra por nadie (§21.5).
//
// Sin imports de alias: se prueba con `node --test lib/conexion.test.ts`.

export type EstadoConexion = 'por_validar' | 'activa' | 'rechazada' | 'cerrada' | 'descartada'
export type ResultadoVisita = 'me_interesa' | 'quiero_ofertar' | 'descarto'
export type RespuestaCompra = 'si_esta' | 'no_aun' | 'otra'
export type Rol = 'comprador' | 'contraparte' | 'broker_comprador'

export interface ConexionBase {
  comprador_id: string
  contraparte_id: string
  broker_comprador_id: string | null
  estado: EstadoConexion
  horarios_propuestos: string[]
  visita_at: string | null
  visita_confirmada_at: string | null
  visita_resultado: ResultadoVisita | null
  oferta_at: string | null
  cierre_reportado_at: string | null
  cierre_confirmado_at: string | null
  seguimientos_enviados: number
  created_at: string
}

export function rolEn(c: Pick<ConexionBase, 'comprador_id' | 'contraparte_id' | 'broker_comprador_id'>, uid: string): Rol | null {
  if (c.comprador_id === uid) return 'comprador'
  if (c.contraparte_id === uid) return 'contraparte'
  if (c.broker_comprador_id === uid) return 'broker_comprador'
  return null
}

/** Lado del comprador: él mismo o su broker (ambos pueden proponer horarios y escribir). */
export const ladoComprador = (r: Rol | null) => r === 'comprador' || r === 'broker_comprador'

export type Fase =
  | 'por_validar' | 'rechazada' | 'descartada' | 'conversando' | 'visita_propuesta' | 'visita_confirmada'
  | 'visita_realizada' | 'oferta' | 'cierre_por_confirmar' | 'cerrada'

/** En qué va la conexión, para mostrar el paso actual (§21.3–21.7). */
export function fase(c: ConexionBase, ahora = Date.now()): Fase {
  if (c.estado === 'por_validar' || c.estado === 'rechazada' || c.estado === 'descartada') return c.estado
  if (c.cierre_confirmado_at || c.estado === 'cerrada') return 'cerrada'
  if (c.cierre_reportado_at) return 'cierre_por_confirmar'
  if (c.oferta_at) return 'oferta'
  if (c.visita_confirmada_at && c.visita_at) return new Date(c.visita_at).getTime() <= ahora ? 'visita_realizada' : 'visita_confirmada'
  if (c.horarios_propuestos.length) return 'visita_propuesta'
  return 'conversando'
}

export const TEXTO_FASE: Record<Fase, string> = {
  por_validar: 'Operación revisa la conexión',
  rechazada: 'Conexión no aprobada',
  descartada: 'Descartada por el comprador',
  conversando: 'Conversando',
  visita_propuesta: 'Visita: horarios propuestos',
  visita_confirmada: 'Visita confirmada',
  visita_realizada: 'Visita realizada',
  oferta: 'Intención de oferta enviada',
  cierre_por_confirmar: 'Cierre reportado, falta la confirmación del comprador',
  cerrada: 'Cierre verificado',
}

const HORA = 3600_000
/** 1 a 3 horarios, desde 2 horas adelante y hasta 60 días. Devuelve ISO ordenados. */
export function validarHorarios(v: unknown, ahora = Date.now()): { horarios: string[] } | { error: string } {
  if (!Array.isArray(v) || v.length < 1 || v.length > 3) return { error: 'Propón de 1 a 3 horarios' }
  const fechas = v.map((x) => new Date(typeof x === 'string' ? x : NaN))
  if (fechas.some((f) => Number.isNaN(f.getTime()))) return { error: 'Algún horario no es una fecha válida' }
  if (fechas.some((f) => f.getTime() < ahora + 2 * HORA)) return { error: 'Los horarios deben ser al menos 2 horas a partir de ahora' }
  if (fechas.some((f) => f.getTime() > ahora + 60 * 24 * HORA)) return { error: 'Los horarios deben ser en los próximos 60 días' }
  return { horarios: [...new Set(fechas.map((f) => f.toISOString()))].sort() }
}

export const FORMAS_PAGO_OFERTA = ['contado', 'credito', 'infonavit'] as const
export function validarOferta(monto: unknown, formaPago: unknown): { monto: number; formaPago: string } | { error: string } {
  const m = Number(String(monto ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(m) || m <= 0) return { error: 'Escribe el monto de tu oferta' }
  if (!FORMAS_PAGO_OFERTA.includes(formaPago as typeof FORMAS_PAGO_OFERTA[number])) return { error: 'Elige la forma de pago' }
  return { monto: Math.round(m), formaPago: formaPago as string }
}

export function validarCalificacion(b: Record<string, unknown>): { atencion: number; rapidez: number; honestidad: number; comentario: string | null } | { error: string } {
  const nota = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? v as number : null)
  const atencion = nota(b.atencion), rapidez = nota(b.rapidez), honestidad = nota(b.honestidad)
  if (atencion == null || rapidez == null || honestidad == null) return { error: 'Califica atención, rapidez y honestidad de 1 a 5' }
  const comentario = typeof b.comentario === 'string' ? b.comentario.trim().slice(0, 500) || null : null
  return { atencion, rapidez, honestidad, comentario }
}

export const DIAS_SEGUIMIENTO = [30, 60, 90]
const DIA = 24 * HORA

/** ¿Toca preguntarle al comprador "¿ya compraste?"? (§21.7): a los 30, 60 y 90 días sin cierre. */
export function seguimientoPendiente(c: ConexionBase, ahora = Date.now()): number | null {
  if (c.estado !== 'activa' || c.cierre_reportado_at || c.cierre_confirmado_at) return null
  const dias = (ahora - new Date(c.created_at).getTime()) / DIA
  const tocan = DIAS_SEGUIMIENTO.filter((d) => dias >= d).length
  return tocan > c.seguimientos_enviados ? DIAS_SEGUIMIENTO[tocan - 1] : null
}

/** Recordatorio de la visita: un día antes (entre 12 y 36 horas antes, para un cron diario). */
export const tocaRecordatorio = (c: Pick<ConexionBase, 'visita_at' | 'visita_confirmada_at'> & { recordatorio_enviado_at: string | null }, ahora = Date.now()) => {
  if (!c.visita_at || !c.visita_confirmada_at || c.recordatorio_enviado_at) return false
  const falta = new Date(c.visita_at).getTime() - ahora
  return falta > 12 * HORA && falta <= 36 * HORA
}

/** "¿Cómo te fue?": al día siguiente de la visita, si el comprador no ha contestado. */
export const tocaComoTeFue = (c: Pick<ConexionBase, 'visita_at' | 'visita_confirmada_at' | 'visita_resultado'> & { como_te_fue_enviado_at: string | null }, ahora = Date.now()) =>
  !!c.visita_at && !!c.visita_confirmada_at && !c.visita_resultado && !c.como_te_fue_enviado_at && ahora - new Date(c.visita_at).getTime() >= 12 * HORA
