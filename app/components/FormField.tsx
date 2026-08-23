// Extraído de app/activo/nuevo/page.tsx para reusarse también en CatastroLegalSection.tsx —
// mismo look de campo (label + asterisco/opcional + error) en todo el formulario de activo.
export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
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

export const inputCls = (err?: boolean) =>
  `w-full px-4 py-3 rounded-xl border ${err ? 'border-[#DC2626] bg-[#FFF5F5]' : 'border-[#DDE3EC] bg-[#F5F7FA]'} text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all`
