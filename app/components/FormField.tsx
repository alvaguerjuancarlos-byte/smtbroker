// Extraído de app/activo/nuevo/page.tsx para reusarse también en CatastroLegalSection.tsx —
// mismo look de campo (label + asterisco/opcional + error) en todo el formulario de activo.
// `tema` sigue el mismo criterio de migración incremental que Topbar (ver ese componente):
// 'claro' es el look original, 'oscuro' el rediseño navy/dorado que se está aplicando pantalla
// por pantalla.
export function Field({ label, required, error, tema = 'claro', children }: { label: string; required?: boolean; error?: boolean; tema?: 'claro' | 'oscuro'; children: React.ReactNode }) {
  if (tema === 'oscuro') {
    return (
      <div className="flex flex-col gap-2">
        <label className="font-plex-mono text-[10.5px] font-medium text-slate uppercase tracking-[0.1em]">
          {label} {required && <span className="text-gold-400">*</span>}
        </label>
        {children}
        {error && <p className="text-[11px] text-[#f3a3a3]">Este campo es obligatorio</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">
        {label} {required && <span className="text-[#DC2626]">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-[#DC2626]">Este campo es obligatorio</p>}
    </div>
  )
}

export const inputCls = (err?: boolean, tema: 'claro' | 'oscuro' = 'claro') => {
  if (tema === 'oscuro') {
    return `w-full px-4 py-3 border ${err ? 'border-red-900/60 bg-red-950/20' : 'border-white/15 bg-navy-950/60'} text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors`
  }
  return `w-full px-4 py-3 rounded-xl border ${err ? 'border-[#DC2626] bg-[#FFF5F5]' : 'border-[#DDE3EC] bg-[#F5F7FA]'} text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all`
}
