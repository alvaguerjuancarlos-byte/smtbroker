'use client'

// Sección "Identificación catastral y legal" — puerto de las Secciones 2+3 de
// smtbroker-input-catastro.html a React/Tailwind, reusando los tokens de color ya existentes en
// globals.css. Insertada dentro de app/activo/nuevo/page.tsx (formulario de un solo paso, ver
// plan — no se reestructura como wizard). Solo alimenta al Agente Legal: tipo/superficie
// terreno viven en la sección de Características ya existente, no se duplican aquí.
import { Field, inputCls } from './FormField'
import { legalTriage, type EstadoDocumentacionLegal } from '@/lib/legalTriage'
import { legalFontVars } from './legalFonts'

export interface CatastroLegalValue {
  clave_catastral: string
  folio_real: string
  estado_documentacion_legal: EstadoDocumentacionLegal | ''
  escritura_publica: 'si' | 'no' | 'no_sabe' | ''
  gravamenes_conocidos: 'ninguno' | 'hipotecario' | 'otro' | 'no_sabe'
  uso_suelo_declarado: 'habitacional' | 'comercial' | 'mixto' | 'industrial' | 'no_determinado'
  superficie_construccion_m2: string
}

const DOC_OPCIONES: { val: EstadoDocumentacionLegal; tag: string; titulo: string; desc: string }[] = [
  { val: 'completa', tag: 'Ruta rápida', titulo: 'Completa', desc: 'Escrituras, folio y libertad de gravamen disponibles y en regla.' },
  { val: 'parcial', tag: 'Ruta híbrida', titulo: 'Parcial', desc: 'Hay algo de documentación, pero falta validar folio, gravamen o escritura.' },
  { val: 'no_localizada', tag: 'Ruta lenta', titulo: 'No localizada', desc: 'El propietario no cuenta con documentación a la mano en este momento.' },
]

const rutaBadgeCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#e9f3ec] text-[#3f7a52]',
  warn: 'bg-[#faf1e0] text-[#a86b1f]',
  bad: 'bg-[#f9e9e2] text-[#a8401f]',
}
const rutaDotCls: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-[#3f7a52]', warn: 'bg-[#a86b1f]', bad: 'bg-[#a8401f]' }

export function CatastroLegalSection({
  value, onChange, tipoActivo, submitted,
}: {
  value: CatastroLegalValue
  onChange: (patch: Partial<CatastroLegalValue>) => void
  tipoActivo: string
  submitted: boolean
}) {
  const triage = value.estado_documentacion_legal ? legalTriage(value.estado_documentacion_legal) : null

  return (
    <div className={`${legalFontVars} bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6 flex flex-col gap-5`} style={{ fontFamily: 'var(--font-legal-sans)' }}>
      <div>
        <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Identificación catastral y legal</p>
        <p className="text-[12px] text-[#8EA0BC] mt-1">Insumo directo del Agente Legal — gravámenes, folio, uso de suelo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Clave catastral" required={false}>
          <input type="text" value={value.clave_catastral} onChange={e => onChange({ clave_catastral: e.target.value })}
            placeholder="19-039-014" className={inputCls()} style={{ fontFamily: 'var(--font-legal-mono)' }} />
        </Field>
        <Field label="Folio real / RPP">
          <input type="text" value={value.folio_real} onChange={e => onChange({ folio_real: e.target.value })}
            placeholder="NL-2024-000123" className={inputCls()} style={{ fontFamily: 'var(--font-legal-mono)' }} />
          <p className="text-[11px] text-[#8EA0BC]">Si no lo tienes, el Agente Legal inicia la búsqueda por dirección.</p>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">
          Estado de documentación legal <span className="text-[#DC2626]">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOC_OPCIONES.map(o => {
            const sel = value.estado_documentacion_legal === o.val
            return (
              <button
                type="button"
                key={o.val}
                onClick={() => onChange({ estado_documentacion_legal: o.val })}
                className={`text-left rounded-xl border p-3.5 transition-all ${sel ? 'border-[#C9A84C] bg-[#FBF5E6]' : 'border-[#DDE3EC] hover:border-[#EDD9A3]'}`}
              >
                <span className="block text-[9.5px] uppercase tracking-wide text-[#8EA0BC] mb-1" style={{ fontFamily: 'var(--font-legal-mono)' }}>{o.tag}</span>
                <h4 className="text-[14px] font-semibold text-[#111827] mb-1">{o.titulo}</h4>
                <p className="text-[12px] text-[#8EA0BC] leading-snug">{o.desc}</p>
              </button>
            )
          })}
        </div>
        {submitted && !value.estado_documentacion_legal && (
          <p className="text-[11px] text-[#DC2626]">Este campo es obligatorio</p>
        )}
      </div>

      {triage && (
        <div className="rounded-xl border border-[#DDE3EC] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[#8EA0BC] mb-2" style={{ fontFamily: 'var(--font-legal-mono)' }}>Ruta de diagnóstico estimada</p>
          <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full mb-2 ${rutaBadgeCls[triage.verdictCls]}`} style={{ fontFamily: 'var(--font-legal-mono)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${rutaDotCls[triage.verdictCls]}`} />
            {triage.rutaLabel}
          </span>
          <p className="text-[12.5px] text-[#4B5E7A] leading-relaxed">{triage.rutaDesc}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">¿Cuenta con escritura pública?</label>
          <div className="flex gap-2">
            {(['si', 'no', 'no_sabe'] as const).map(v => (
              <button key={v} type="button" onClick={() => onChange({ escritura_publica: v })}
                className={`flex-1 text-center py-2.5 px-2 rounded-xl border text-[13px] transition-all ${value.escritura_publica === v ? 'border-[#C9A84C] bg-[#FBF5E6] text-[#5a4a1a] font-medium' : 'border-[#DDE3EC] text-[#4B5E7A]'}`}>
                {v === 'si' ? 'Sí' : v === 'no' ? 'No' : 'No sabe'}
              </button>
            ))}
          </div>
        </div>
        <Field label="Gravámenes conocidos">
          <select value={value.gravamenes_conocidos} onChange={e => onChange({ gravamenes_conocidos: e.target.value as CatastroLegalValue['gravamenes_conocidos'] })} className={inputCls()}>
            <option value="ninguno">Ninguno conocido</option>
            <option value="hipotecario">Sí — hipotecario</option>
            <option value="otro">Sí — otro</option>
            <option value="no_sabe">No sabe</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tipoActivo !== 'Terreno' && (
          <Field label="Superficie construcción (m²)">
            <input type="number" min="0" value={value.superficie_construccion_m2} onChange={e => onChange({ superficie_construccion_m2: e.target.value })}
              placeholder="0" className={inputCls()} style={{ fontFamily: 'var(--font-legal-mono)' }} />
          </Field>
        )}
        <Field label="Uso de suelo declarado">
          <select value={value.uso_suelo_declarado} onChange={e => onChange({ uso_suelo_declarado: e.target.value as CatastroLegalValue['uso_suelo_declarado'] })} className={inputCls()}>
            <option value="habitacional">Habitacional</option>
            <option value="comercial">Comercial</option>
            <option value="mixto">Mixto</option>
            <option value="industrial">Industrial</option>
            <option value="no_determinado">No determinado</option>
          </select>
          <p className="text-[11px] text-[#8EA0BC]">Declaración inicial del propietario — el Agente Legal la contrasta contra la fuente oficial.</p>
        </Field>
      </div>
    </div>
  )
}
