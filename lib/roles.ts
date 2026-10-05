// Única fuente de verdad para "a qué home le toca a cada rol" -- antes vivía por separado y
// ligeramente distinto en Topbar.tsx, dashboard/page.tsx y panel/page.tsx, y ya había divergido:
// dashboard/page.tsx nunca aprendió sobre "broker_maestro", así que un Broker Maestro que
// iniciaba sesión (login o al fijar contraseña, ambos mandan siempre a /dashboard) caía en la
// vista vacía de "Mis activos" de un propietario en vez de /panel (hallazgo 2026-09-27).
export type Rol = 'propietario' | 'broker' | 'inversionista' | 'broker_maestro'

export const HOME_POR_ROL: Record<Rol, string> = {
  propietario: '/dashboard',
  broker: '/portal-broker',
  inversionista: '/portal-inversion',
  broker_maestro: '/panel',
}

export function homePorRol(rol: string | null | undefined): string {
  return (rol && rol in HOME_POR_ROL) ? HOME_POR_ROL[rol as Rol] : '/dashboard'
}

// Documento Maestro V6.1 (2026-10-04): el "Broker Maestro" deja de ser una persona del ecosistema
// y pasa a ser la consola interna de Operación MindBridge; "inversionista" se presenta como
// "comprador". Los identificadores internos ('broker_maestro', 'inversionista') NO se renombran a
// propósito: las políticas RLS de Supabase los referencian literalmente y no están todas
// versionadas -- renombrarlos arriesga reabrir los hallazgos de la auditoría del 2026-10-03. Toda
// etiqueta visible al usuario debe pasar por aquí.
export const ETIQUETA_ROL: Record<Rol, string> = {
  propietario: 'Propietario',
  broker: 'Broker',
  inversionista: 'Comprador',
  broker_maestro: 'Operación MindBridge',
}

export function etiquetaRol(rol: string | null | undefined): string {
  return (rol && rol in ETIQUETA_ROL) ? ETIQUETA_ROL[rol as Rol] : (rol || '')
}
