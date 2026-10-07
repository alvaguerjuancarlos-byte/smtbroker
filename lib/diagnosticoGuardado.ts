// Diagnóstico guardado (migración 20261007000000_diagnosticos_guardados.sql). SOLO servidor: usa el
// cliente service_role de app/api/agentes/*. Antes, cada visita a un activo volvía a correr los
// agentes Legal y Mercado (costo y resultados distintos entre visitas); ahora se reutiliza el más
// reciente y solo se recalcula con "Actualizar diagnóstico".
import type { SupabaseClient } from '@supabase/supabase-js'

export type Agente = 'legal' | 'mercado' | 'ficha'

export interface DiagnosticoGuardado {
  id: string
  fecha: string
  resultado: Record<string, unknown>
}

export async function leerUltimo(admin: SupabaseClient, activoId: string, agente: Agente): Promise<DiagnosticoGuardado | null> {
  const { data } = await admin
    .from('diagnosticos')
    .select('id, created_at, resultado')
    .eq('activo_id', activoId)
    .eq('agente', agente)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const d = data as { id: string; created_at: string; resultado: Record<string, unknown> }
  return { id: d.id, fecha: d.created_at, resultado: d.resultado }
}

export async function guardar(
  admin: SupabaseClient,
  d: { activoId: string; agente: Agente; resultado: object; modelo: string; creadoPor: string },
): Promise<{ id: string; fecha: string } | null> {
  const { data, error } = await admin
    .from('diagnosticos')
    .insert({ activo_id: d.activoId, agente: d.agente, resultado: d.resultado, modelo: d.modelo, creado_por: d.creadoPor })
    .select('id, created_at')
    .single()
  // Si no se pudo guardar, el diagnóstico igual se devuelve al usuario -- solo se pierde la
  // reutilización, no el resultado.
  if (error || !data) {
    console.error('No se pudo guardar el diagnóstico:', error?.message)
    return null
  }
  const g = data as { id: string; created_at: string }
  return { id: g.id, fecha: g.created_at }
}

/** Respuesta común de las rutas: el resultado más los datos de cuándo se generó. */
export const conGuardado = (resultado: object, g: { id: string; fecha: string } | null, nuevo: boolean) => ({
  ...resultado,
  _guardado: g ? { id: g.id, fecha: g.fecha, nuevo } : null,
})
