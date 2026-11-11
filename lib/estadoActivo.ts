// Etiqueta y color de cada estado de un activo, compartidos por el dashboard del propietario y el
// portafolio del broker (antes vivía solo en app/dashboard/page.tsx).
export const ESTADOS_ACTIVO = ['ingresado', 'valoracion', 'marketing', 'leads', 'cerrado'] as const

export const statusCfg = (status: string) => {
  if (status === 'valoracion')  return { label: 'En valoración', chip: 'border-[#D97706]/40 text-aviso bg-[#D97706]/10' }
  if (status === 'marketing')   return { label: 'En marketing',  chip: 'border-[#4F46E5]/40 text-violeta bg-[#4F46E5]/10' }
  if (status === 'leads')       return { label: 'Leads activos', chip: 'border-gold-500/40 text-acento bg-gold-500/10' }
  if (status === 'cerrado')     return { label: 'Cerrado',       chip: 'border-linea text-tenue bg-sutil' }
  return { label: 'Ingresado', chip: 'border-linea text-tenue bg-sutil' }
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
