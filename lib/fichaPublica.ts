// Datos de la página pública de una propiedad (/p/[id], Documento Maestro V6.3 §14.1). SOLO
// servidor (service_role): la página es para cualquier persona sin sesión, así que aquí se decide
// qué es público -- nunca folio, escritura, gravámenes, dirección exacta, dueño ni broker.
// Si la propiedad no está publicada (activos.publicada_at) o está cerrada, no existe para el público.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerUltimo } from '@/lib/diagnosticoGuardado'

export const BUCKET_FOTOS = 'fotos-activos'
export const MAX_FOTOS = 8

export interface FichaPublica {
  id: string
  nombre: string
  tipo: string
  colonia: string | null
  municipio: string
  estado: string
  superficie: number | null
  superficieConstruccion: number | null
  precio: number | null
  esDemo: boolean
  certificada: boolean
  fotos: string[]
  ficha: {
    titular: string; narrativa: string; puntosFuertes: string[]; precioSugeridoMXN: number | null
    argumentosComprador: string[]; mensajeWhatsApp: string
  } | null
  mercado: { comparables: number | null; plusvalia: string | null; precioM2Zona: number | null } | null
}

export async function cargarFichaPublica(admin: SupabaseClient, id: string): Promise<FichaPublica | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await admin.from('activos')
    .select('id, nombre, tipo, colonia, municipio, estado, superficie, superficie_construccion_m2, precio_total, status, publicada_at, es_demo')
    .eq('id', id).maybeSingle()
  const a = data as Record<string, unknown> | null
  if (!a || !a.publicada_at || a.status === 'cerrado') return null

  const [ficha, mercado, { data: cert }, { data: archivos }] = await Promise.all([
    leerUltimo(admin, id, 'ficha'),
    leerUltimo(admin, id, 'mercado'),
    admin.from('certificaciones').select('id').eq('activo_id', id).eq('estado', 'certificada').limit(1).maybeSingle(),
    admin.storage.from(BUCKET_FOTOS).list(id, { limit: MAX_FOTOS, sortBy: { column: 'created_at', order: 'asc' } }),
  ])
  const m = mercado?.resultado as Record<string, unknown> | undefined

  return {
    id,
    nombre: a.nombre as string,
    tipo: a.tipo as string,
    colonia: (a.colonia as string | null) ?? null,
    municipio: a.municipio as string,
    estado: a.estado as string,
    superficie: (a.superficie as number | null) ?? null,
    superficieConstruccion: (a.superficie_construccion_m2 as number | null) ?? null,
    precio: (a.precio_total as number | null) ?? null,
    esDemo: !!a.es_demo,
    certificada: !!cert,
    fotos: (archivos || []).filter((f) => f.name && !f.name.startsWith('.'))
      .map((f) => admin.storage.from(BUCKET_FOTOS).getPublicUrl(`${id}/${f.name}`).data.publicUrl),
    ficha: (ficha?.resultado as FichaPublica['ficha']) ?? null,
    mercado: m ? {
      comparables: (m.comparablesAnalizados as number | null) ?? null,
      plusvalia: (m.plusvalia3AniosTexto as string | null) ?? null,
      precioM2Zona: (m.precioPromedioM2Zona as number | null) ?? null,
    } : null,
  }
}
