'use client'

// Reemplaza el bloque "Ficha Legal · Agente Due Diligence" hardcodeado de
// app/activo/[id]/page.tsx — puerto de smtbroker-output-catastro.html. Recap y datos de
// ubicación/tipo/superficie/folio son REALES (vienen del activo); los 4 checks siguen siendo
// simulados (sin conexión a catastro/RPP/CONANP/SENER real — ver plan).
import { legalTriage, CHECK_AMBIENTAL, CHECK_CFE, type CheckLegal } from '@/lib/legalTriage'

const verdictChipCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'border-[#3fbe72]/40 text-[#6bdb9a] bg-[#3fbe72]/10',
  warn: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10',
  bad: 'border-red-900/60 text-[#f3a3a3] bg-red-950/20',
}
const verdictDotCls: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-[#3fbe72]', warn: 'bg-[#D97706]', bad: 'bg-[#e05a5a]' }
const checkIconCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#3fbe72]/15 text-[#6bdb9a]',
  warn: 'bg-[#D97706]/15 text-[#e8b568]',
  bad: 'bg-red-950/40 text-[#f3a3a3]',
}
const checkStatusCls: Record<'ok' | 'warn' | 'bad', string> = checkIconCls
const checkIconSymbol: Record<'ok' | 'warn' | 'bad', string> = { ok: '✓', warn: '!', bad: '×' }

function CheckRow({ titulo, check }: { titulo: string; check: CheckLegal }) {
  return (
    <div className="bg-navy-800 border border-white/10 p-4 md:p-5 flex gap-4 items-start">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-plex-mono text-[15px] ${checkIconCls[check.cls]}`}>
        {checkIconSymbol[check.cls]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h4 className="text-[14px] font-medium text-paper">{titulo}</h4>
          <span className={`font-plex-mono text-[10px] uppercase tracking-wide px-2 py-0.5 border ${checkStatusCls[check.cls]}`}>{check.status}</span>
        </div>
        <p className="text-[13px] text-paper-dim leading-relaxed mb-1.5">{check.desc}</p>
        <p className="text-[11px] text-slate"><b className="font-medium">Fuente:</b> {check.fuente}</p>
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
    <div>
      <div className="bg-navy-900 border border-gold-500/20 p-5 md:p-7 flex flex-wrap justify-between items-center gap-5 mb-4">
        <div className="flex-1 min-w-[240px]">
          <span className={`inline-flex items-center gap-2 font-plex-mono text-[11px] font-medium px-3 py-1.5 border mb-3 ${verdictChipCls[t.verdictCls]}`}>
            <span className={`w-2 h-2 rounded-full ${verdictDotCls[t.verdictCls]}`} />
            {t.verdictBadge}
          </span>
          <h3 className="font-fraunces text-[19px] font-medium text-paper mb-1.5">{t.verdictTitle}</h3>
          <p className="text-[13px] text-slate max-w-[480px]">{t.verdictDesc}</p>
        </div>
        <div className="text-right">
          <div className="font-fraunces text-[38px] leading-none text-gold-400">{t.score}</div>
          <div className="font-plex-mono text-[10px] uppercase tracking-wide text-slate mt-1">Score legal</div>
        </div>
      </div>

      <div className="flex flex-wrap border border-white/10 overflow-hidden bg-navy-800 mb-5">
        {[
          { label: 'Ubicación', val: ubicacion },
          { label: 'Tipo', val: tipo },
          { label: 'Superficie', val: superficieTxt },
          { label: 'Folio / clave', val: folioOClave || 'No capturado' },
        ].map((r, i) => (
          <div key={r.label} className={`flex-1 min-w-[150px] p-3.5 ${i < 3 ? 'border-r border-white/10' : ''}`}>
            <div className="font-plex-mono text-[10px] uppercase tracking-wide text-slate mb-1">{r.label}</div>
            <div className="text-[13px] text-paper">{r.val}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <CheckRow titulo="Uso de suelo" check={t.usoSuelo} />
        <CheckRow titulo="Titularidad y gravámenes (RPP)" check={t.rpp} />
        <CheckRow titulo="Restricciones ambientales" check={CHECK_AMBIENTAL} />
        <CheckRow titulo="Restricciones por infraestructura federal (CFE)" check={CHECK_CFE} />
      </div>

      <div className="mt-4 border border-dashed border-white/15 bg-white/[0.02] p-3.5">
        <p className="text-[11.5px] text-slate">
          <b className="text-paper-dim font-medium">Nota de transparencia:</b> este diagnóstico combina fuentes gratuitas verificables (INEGI, CONANP/CONABIO, SENER) con los gaps ya documentados (RPP, SIGEIA, CFE). Ningún resultado proviene de una consulta real todavía — son estados simulados mientras se cierran los spikes técnicos de integración.
        </p>
      </div>
    </div>
  )
}
