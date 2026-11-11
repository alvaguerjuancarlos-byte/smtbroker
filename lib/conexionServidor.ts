// Conexiones: piezas de servidor (solo con supabaseAdmin) compartidas por app/api/conexiones y el
// cron de seguimiento (Documento Maestro V8, Parte 3, §21).
import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarUsuario, type Aviso } from '@/lib/avisos'
import type { ConexionBase } from '@/lib/conexion'

export const COLS_CONEXION = 'id, comprador_id, activo_id, necesidad_id, propuesta_id, contraparte_id, contraparte_es_broker, broker_comprador_id, origen, estado, validacion, validada_at, aporte, horarios_propuestos, visita_at, visita_confirmada_at, recordatorio_enviado_at, como_te_fue_enviado_at, visita_resultado, motivo_descarte, oferta_monto, oferta_forma_pago, oferta_at, cierre_precio, cierre_fecha, cierre_reportado_at, cierre_confirmado_at, seguimientos_enviados, compro_respuesta, compro_respuesta_at, es_demo, created_at, actualizado_at'

export interface FilaConexion extends ConexionBase {
  id: string
  activo_id: string
  necesidad_id: string | null
  propuesta_id: string | null
  contraparte_es_broker: boolean
  origen: 'propuesta' | 'particular' | 'red'
  validacion: 'automatica' | 'manual'
  validada_at: string | null
  aporte: Record<string, unknown>
  recordatorio_enviado_at: string | null
  como_te_fue_enviado_at: string | null
  motivo_descarte: string | null
  oferta_monto: number | null
  oferta_forma_pago: string | null
  cierre_precio: number | null
  cierre_fecha: string | null
  compro_respuesta: 'si_esta' | 'no_aun' | 'otra' | null
  compro_respuesta_at: string | null
  es_demo: boolean
  actualizado_at: string
}

/** Las partes que reciben avisos: comprador, quien ofrece la propiedad y el broker del comprador. */
export const partes = (c: Pick<FilaConexion, 'comprador_id' | 'contraparte_id' | 'broker_comprador_id'>) =>
  [c.comprador_id, c.contraparte_id, c.broker_comprador_id].filter((x): x is string => !!x)

export async function avisarPartes(admin: SupabaseClient, c: FilaConexion, aviso: Aviso, excepto?: string): Promise<void> {
  await Promise.all(partes(c).filter((u) => u !== excepto).map((u) => avisarUsuario(admin, u, aviso, { esDemo: c.es_demo })))
}

/**
 * WhatsApp de una parte, solo para cuando la visita está confirmada (§21.3). Clientes: el de su
 * registro (contactos_cliente). Brokers: el de su solicitud de registro (solicitudes, por correo).
 */
export async function telefonoDe(admin: SupabaseClient, uid: string, esBroker: boolean): Promise<string | null> {
  if (!esBroker) {
    const { data } = await admin.from('contactos_cliente').select('telefono').eq('usuario_id', uid).maybeSingle()
    return (data as { telefono: string | null } | null)?.telefono ?? null
  }
  const { data: auth } = await admin.auth.admin.getUserById(uid)
  const correo = auth?.user?.email
  if (!correo) return null
  const { data } = await admin.from('solicitudes').select('telefono').eq('email', correo).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as { telefono: string | null } | null)?.telefono ?? null
}

export async function nombresDe(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return new Map()
  const { data } = await admin.from('usuarios').select('id, nombre').in('id', unicos)
  return new Map(((data as { id: string; nombre: string | null }[]) || []).map((u) => [u.id, u.nombre || 'Usuario']))
}

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
