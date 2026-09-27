// Mismo chip que ya se usa en /panel (commit "Marcar visualmente los datos de ejemplo en
// /panel") para distinguir un número inventado de uno real -- reusado aquí porque
// /activo/[id]/leads y /activo/[id]/marketing son 100% datos simulados (sin ninguna consulta a
// Supabase más allá del nombre/tipo del activo), previsualizando cómo se verá el módulo una vez
// que exista captación de leads y analítica real. Sin este chip, un propietario real podía leer
// "Carlos Mendoza, c.mendoza@email.com, score 92" como un comprador real.
export function EjemploBadge() {
  return (
    <span className="font-plex-mono text-[9px] font-medium px-1.5 py-0.5 border border-dashed border-white/25 text-slate uppercase tracking-wide shrink-0">
      Datos de ejemplo
    </span>
  )
}
