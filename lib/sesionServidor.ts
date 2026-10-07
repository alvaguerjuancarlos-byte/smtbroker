// Sesión del usuario en las rutas de API (solo servidor). Lee el token Bearer que manda el
// navegador, lo valida con Supabase y trae el rol y el mundo (demo/real) de `usuarios`. Devuelve
// también el cliente admin (service_role), que ignora la RLS: cada ruta debe filtrar a mano por
// acceso (lib/accesoActivo.ts) y por mundo (lib/mundo.ts).
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export interface SesionServidor {
  uid: string
  rol: string | null
  esDemo: boolean
  esOperacion: boolean
  admin: SupabaseClient
}

export async function sesionServidor(req: NextRequest): Promise<SesionServidor | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: u } = await admin.from('usuarios').select('rol, es_demo').eq('id', data.user.id).maybeSingle()
  const fila = u as { rol: string | null; es_demo: boolean | null } | null
  return {
    uid: data.user.id,
    rol: fila?.rol ?? null,
    esDemo: !!fila?.es_demo,
    esOperacion: fila?.rol === 'broker_maestro',
    admin,
  }
}
