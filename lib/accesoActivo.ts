// Quién puede ver y trabajar un activo -- única fuente de verdad (Documento Maestro V6.1, §10).
// Antes, cada pantalla y cada agente filtraba por separado con `.eq('usuario_id', yo)`, así que el
// broker que representa un activo no podía ni abrirlo. Ahora tienen acceso:
//   - el dueño de la cuenta (usuario_id), y
//   - el broker que lo representa (broker_id).
// La misma regla existe en la RLS de Supabase (migración 20261005000100_v6_broker_protagonista.sql);
// este helper es para las consultas del código, incluidas las que corren con supabaseAdmin (que
// ignora la RLS y por eso necesitan el filtro explícito).

/** Filtro para `.or(...)` de supabase-js: activos del usuario o representados por él. */
export function filtroAccesoActivo(uid: string): string {
  return `usuario_id.eq.${uid},broker_id.eq.${uid}`
}

export function puedeAccederActivo(
  activo: { usuario_id: string | null; broker_id: string | null } | null | undefined,
  uid: string,
): boolean {
  return !!activo && (activo.usuario_id === uid || activo.broker_id === uid)
}
