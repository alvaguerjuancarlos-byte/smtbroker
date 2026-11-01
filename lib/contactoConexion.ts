// Contacto entre las partes de un match puesto en contacto (Documento Maestro V7.1 §15 y §17;
// decisión (a) de JC: las partes ven sus datos cuando Operación valida). SOLO servidor.
//
// Cada lado se representa por su broker si lo tiene; si va por su cuenta, por él mismo. Así se
// cumple la regla "la plataforma no contacta al cliente de un broker": de un lado con broker solo
// sale el contacto del broker, nunca el de su cliente.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LadoActivo { broker_id: string | null; usuario_id: string }
export interface LadoPerfil { broker_id: string | null; usuario_id: string | null; representado_por: string | null }

export interface Contacto { nombre: string; correo: string | null; esBroker: boolean }

/** Quién atiende el lado del vendedor: su broker o el propietario por su cuenta. */
export const atiendeVendedor = (a: LadoActivo) => ({ id: a.broker_id ?? a.usuario_id, esBroker: !!a.broker_id })

/** Quién atiende el lado del comprador: el broker que lo registró, el que eligió o él mismo. */
export function atiendeComprador(p: LadoPerfil) {
  const broker = (p.usuario_id === null ? p.broker_id : null) ?? p.representado_por
  return broker ? { id: broker, esBroker: true } : { id: p.usuario_id!, esBroker: false }
}

export async function contactoDe(admin: SupabaseClient, lado: { id: string; esBroker: boolean }): Promise<Contacto> {
  const [{ data: u }, { data: auth }] = await Promise.all([
    admin.from('usuarios').select('nombre').eq('id', lado.id).maybeSingle(),
    admin.auth.admin.getUserById(lado.id),
  ])
  const nombre = (u as { nombre: string | null } | null)?.nombre || (lado.esBroker ? 'Broker' : 'Cliente')
  return { nombre, correo: auth?.user?.email ?? null, esBroker: lado.esBroker }
}
