// Radar de mercado: piezas de servidor compartidas por app/api/radar y app/api/radar/[id].
import { NextResponse } from 'next/server'
import type { SesionServidor } from '@/lib/sesionServidor'

/** Perfil del comprador por su cuenta, o la respuesta de error. */
export async function perfilDelComprador(s: SesionServidor) {
  if (s.rol !== 'inversionista') return { error: NextResponse.json({ error: 'El Radar es para compradores' }, { status: 403 }) }
  const { data } = await s.admin.from('perfiles_intencion').select('id, representado_por').eq('usuario_id', s.uid).maybeSingle()
  const p = data as { id: string; representado_por: string | null } | null
  if (!p) return { error: NextResponse.json({ error: 'Primero describe lo que buscas' }, { status: 409 }) }
  if (p.representado_por) return { error: NextResponse.json({ error: 'Tu broker busca por ti', conBroker: true }, { status: 409 }) }
  return { perfilId: p.id }
}
