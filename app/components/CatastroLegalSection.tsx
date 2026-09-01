'use client'

// Sección "Identificación catastral y legal" — puerto de las Secciones 2+3 de
// smtbroker-input-catastro.html a React/Tailwind. Insertada dentro de app/activo/nuevo/page.tsx
// (formulario de un solo paso, ver plan — no se reestructura como wizard). Solo alimenta al
// Agente Legal: tipo/superficie terreno viven en la sección de Características ya existente, no
// se duplican aquí.
//
// Usa los tokens font-fraunces/font-plex-mono del rediseño navy/dorado (ver app/layout.tsx) —
// antes tenía su propia carga de fuente duplicada (legalFonts.ts, retirado) con las mismas
// familias Fraunces/IBM Plex bajo otro nombre de variable.
import { Field, inputCls } from './FormField'
import { legalTriage, type EstadoDocumentacionLegal } from '@/lib/legalTriage'

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

const rutaChipCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'border-[#3fbe72]/40 text-[#6bdb9a] bg-[#3fbe72]/10',
  warn: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10',
  bad: 'border-red-900/60 text-[#f3a3a3] bg-red-950/20',
}
const rutaDotCls: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-[#3fbe72]', warn: 'bg-[#D97706]', bad: 'bg-[#e05a5a]' }

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
    <div className="bg-navy-800 border border-white/10 p-4 md:p-6 flex flex-col gap-5">
      <div>
        <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Identificación catastral y legal</p>
        <p className="text-[12px] text-slate mt-1">Insumo directo del Agente Legal — gravámenes, folio, uso de suelo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Clave catastral" required={false} tema="oscuro">
          <input type="text" value={value.clave_catastral} onChange={e => onChange({ clave_catastral: e.target.value })}
            placeholder="19-039-014" className={`${inputCls(false, 'oscuro')} font-plex-mono`} />
        </Field>
        <Field label="Folio real / RPP" tema="oscuro">
          <input type="text" value={value.folio_real} onChange={e => onChange({ folio_real: e.target.value })}
            placeholder="NL-2024-000123" className={`${inputCls(false, 'oscuro')} font-plex-mono`} />
          <p className="text-[11px] text-slate">Si no lo tienes, el Agente Legal inicia la búsqueda por dirección.</p>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">
          Estado de documentación legal <span className="text-gold-400">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOC_OPCIONES.map(o => {
            const sel = value.estado_documentacion_legal === o.val
            return (
              <button
                type="button"
                key={o.val}
                onClick={() => onChange({ estado_documentacion_legal: o.val })}
                className={`text-left border p-3.5 transition-all ${sel ? 'border-gold-500 bg-gold-500/10' : 'border-white/15 hover:border-gold-500/50'}`}
              >
                <span className="block font-plex-mono text-[9.5px] uppercase tracking-wide text-slate mb-1">{o.tag}</span>
                <h4 className="text-[14px] font-medium text-paper mb-1">{o.titulo}</h4>
                <p className="text-[12px] text-paper-dim leading-snug">{o.desc}</p>
              </button>
            )
          })}
        </div>
        {submitted && !value.estado_documentacion_legal && (
          <p className="text-[11px] text-[#f3a3a3]">Este campo es obligatorio</p>
        )}
      </div>

      {triage && (
        <div className="border border-white/10 p-4">
          <p className="font-plex-mono text-[10px] uppercase tracking-wide text-slate mb-2">Ruta de diagnóstico estimada</p>
          <span className={`inline-flex items-center gap-1.5 font-plex-mono text-[11px] font-medium px-2.5 py-1 border mb-2 ${rutaChipCls[triage.verdictCls]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${rutaDotCls[triage.verdictCls]}`} />
            {triage.rutaLabel}
          </span>
          <p className="text-[12.5px] text-paper-dim leading-relaxed">{triage.rutaDesc}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">¿Cuenta con escritura pública?</label>
          <div className="flex gap-2">
            {(['si', 'no', 'no_sabe'] as const).map(v => (
              <button key={v} type="button" onClick={() => onChange({ escritura_publica: v })}
                className={`flex-1 text-center py-2.5 px-2 border font-plex-mono text-[12px] transition-all ${value.escritura_publica === v ? 'border-gold-500 bg-gold-500/10 text-gold-400' : 'border-white/15 text-paper-dim'}`}>
                {v === 'si' ? 'Sí' : v === 'no' ? 'No' : 'No sabe'}
              </button>
            ))}
          </div>
        </div>
        <Field label="Gravámenes conocidos" tema="oscuro">
          <select value={value.gravamenes_conocidos} onChange={e => onChange({ gravamenes_conocidos: e.target.value as CatastroLegalValue['gravamenes_conocidos'] })} className={inputCls(false, 'oscuro')}>
            <option value="ninguno" className="bg-navy-900">Ninguno conocido</option>
            <option value="hipotecario" className="bg-navy-900">Sí — hipotecario</option>
            <option value="otro" className="bg-navy-900">Sí — otro</option>
            <option value="no_sabe" className="bg-navy-900">No sabe</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tipoActivo !== 'Terreno' && (
          <Field label="Superficie construcción (m²)" tema="oscuro">
            <input type="number" min="0" value={value.superficie_construccion_m2} onChange={e => onChange({ superficie_construccion_m2: e.target.value })}
              placeholder="0" className={`${inputCls(false, 'oscuro')} font-plex-mono`} />
          </Field>
        )}
        <Field label="Uso de suelo declarado" tema="oscuro">
          <select value={value.uso_suelo_declarado} onChange={e => onChange({ uso_suelo_declarado: e.target.value as CatastroLegalValue['uso_suelo_declarado'] })} className={inputCls(false, 'oscuro')}>
            <option value="habitacional" className="bg-navy-900">Habitacional</option>
            <option value="comercial" className="bg-navy-900">Comercial</option>
            <option value="mixto" className="bg-navy-900">Mixto</option>
            <option value="industrial" className="bg-navy-900">Industrial</option>
            <option value="no_determinado" className="bg-navy-900">No determinado</option>
          </select>
          <p className="text-[11px] text-slate">Declaración inicial del propietario — el Agente Legal la contrasta contra la fuente oficial.</p>
        </Field>
      </div>
    </div>
  )
}
