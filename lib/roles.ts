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
