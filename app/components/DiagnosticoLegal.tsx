'use client'

// Reemplaza el bloque "Ficha Legal · Agente Due Diligence" hardcodeado de
// app/activo/[id]/page.tsx — puerto de smtbroker-output-catastro.html. Recap y datos de
// ubicación/tipo/superficie/folio son REALES (vienen del activo); los 4 checks siguen siendo
// simulados (sin conexión a catastro/RPP/CONANP/SENER real — ver plan).
import { legalTriage, CHECK_AMBIENTAL, CHECK_CFE, type CheckLegal } from '@/lib/legalTriage'
import { legalFontVars } from './legalFonts'

const verdictBadgeCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#3f7a52]/20 text-[#8fd9a8]',
  warn: 'bg-[#a86b1f]/20 text-[#f0c184]',
  bad: 'bg-[#a8401f]/20 text-[#f0a184]',
}
const verdictDotCls: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-[#5fbf7f]', warn: 'bg-[#e0a24a]', bad: 'bg-[#e0724a]' }
const checkIconCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#e9f3ec] text-[#2f6b45]',
  warn: 'bg-[#faf1e0] text-[#93601a]',
  bad: 'bg-[#f9e9e2] text-[#96361a]',
}
const checkStatusCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#e9f3ec] text-[#2f6b45]',
  warn: 'bg-[#faf1e0] text-[#93601a]',
  bad: 'bg-[#f9e9e2] text-[#96361a]',
}
const checkIconSymbol: Record<'ok' | 'warn' | 'bad', string> = { ok: '✓', warn: '!', bad: '×' }

function CheckRow({ titulo, check }: { titulo: string; check: CheckLegal }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4 md:p-5 flex gap-4 items-start">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[15px] ${checkIconCls[check.cls]}`} style={{ fontFamily: 'var(--font-legal-mono)' }}>
        {checkIconSymbol[check.cls]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h4 className="text-[14px] font-semibold text-[#111827]">{titulo}</h4>
          <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${checkStatusCls[check.cls]}`} style={{ fontFamily: 'var(--font-legal-mono)' }}>{check.status}</span>
        </div>
        <p className="text-[13px] text-[#4B5E7A] leading-relaxed mb-1.5">{check.desc}</p>
        <p className="text-[11px] text-[#8EA0BC]"><b className="font-medium">Fuente:</b> {check.fuente}</p>
      </div>
    </div>
  )
}

export function DiagnosticoLegal({
  estadoDocumentacionLegal, ubicacion, tipo, superficieTerreno, superficieConstruccion, folioOClave,
}: {
  estadoDocumentacionLegal: string | null | undefined
  ubicacion: string
  tipo: string
  superficieTerreno: number | null
  superficieConstruccion: number | null
  folioOClave: string | null
}) {
  const t = legalTriage(estadoDocumentacionLegal)
  const superficieTxt = superficieTerreno
    ? `${superficieTerreno} m² terreno${superficieConstruccion ? ` · ${superficieConstruccion} m² const.` : ''}`
    : '—'

  return (
    <div className={legalFontVars} style={{ fontFamily: 'var(--font-legal-sans)' }}>
      <div className="bg-[#0F1F3D] rounded-2xl p-5 md:p-7 text-white flex flex-wrap justify-between items-center gap-5 mb-4">
        <div className="flex-1 min-w-[240px]">
          <span className={`inline-flex items-center gap-2 text-[11.5px] font-medium px-3 py-1.5 rounded-full mb-3 ${verdictBadgeCls[t.verdictCls]}`} style={{ fontFamily: 'var(--font-legal-mono)' }}>
            <span className={`w-2 h-2 rounded-full ${verdictDotCls[t.verdictCls]}`} />
            {t.verdictBadge}
          </span>
          <h3 className="text-[19px] font-semibold mb-1.5" style={{ fontFamily: 'var(--font-legal-serif)' }}>{t.verdictTitle}</h3>
          <p className="text-[13px] text-white/60 max-w-[480px]">{t.verdictDesc}</p>
        </div>
        <div className="text-right">
          <div className="text-[38px] leading-none text-[#ddc06a]" style={{ fontFamily: 'var(--font-legal-serif)' }}>{t.score}</div>
          <div className="text-[10px] uppercase tracking-wide text-white/50 mt-1" style={{ fontFamily: 'var(--font-legal-mono)' }}>Score legal</div>
        </div>
      </div>

      <div className="flex flex-wrap rounded-2xl border border-[#DDE3EC] overflow-hidden bg-white mb-5">
        {[
          { label: 'Ubicación', val: ubicacion },
          { label: 'Tipo', val: tipo },
          { label: 'Superficie', val: superficieTxt },
          { label: 'Folio / clave', val: folioOClave || 'No capturado' },
        ].map((r, i) => (
          <div key={r.label} className={`flex-1 min-w-[150px] p-3.5 ${i < 3 ? 'border-r border-[#DDE3EC]' : ''}`}>
            <div className="text-[10px] uppercase tracking-wide text-[#8EA0BC] mb-1" style={{ fontFamily: 'var(--font-legal-mono)' }}>{r.label}</div>
            <div className="text-[13px] text-[#111827]">{r.val}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <CheckRow titulo="Uso de suelo" check={t.usoSuelo} />
        <CheckRow titulo="Titularidad y gravámenes (RPP)" check={t.rpp} />
        <CheckRow titulo="Restricciones ambientales" check={CHECK_AMBIENTAL} />
        <CheckRow titulo="Restricciones por infraestructura federal (CFE)" check={CHECK_CFE} />
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-[#DDE3EC] bg-[#FAFAF7] p-3.5">
        <p className="text-[11.5px] text-[#8EA0BC]">
          <b className="text-[#4B5E7A] font-medium">Nota de transparencia:</b> este diagnóstico combina fuentes gratuitas verificables (INEGI, CONANP/CONABIO, SENER) con los gaps ya documentados (RPP, SIGEIA, CFE). Ningún resultado proviene de una consulta real todavía — son estados simulados mientras se cierran los spikes técnicos de integración.
        </p>
      </div>
    </div>
  )
}
