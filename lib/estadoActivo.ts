// Etiqueta y color de cada estado de un activo, compartidos por el dashboard del propietario y el
// portafolio del broker (antes vivía solo en app/dashboard/page.tsx).
export const ESTADOS_ACTIVO = ['ingresado', 'valoracion', 'marketing', 'leads', 'cerrado'] as const

export const statusCfg = (status: string) => {
  if (status === 'valoracion')  return { label: 'En valoración', chip: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10' }
  if (status === 'marketing')   return { label: 'En marketing',  chip: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10' }
  if (status === 'leads')       return { label: 'Leads activos', chip: 'border-gold-500/40 text-gold-400 bg-gold-500/10' }
  if (status === 'cerrado')     return { label: 'Cerrado',       chip: 'border-white/15 text-slate bg-white/5' }
  return { label: 'Ingresado', chip: 'border-white/15 text-slate bg-white/5' }
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
