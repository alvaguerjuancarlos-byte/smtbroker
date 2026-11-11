'use client'

// Reemplaza el bloque "Ficha Legal · Agente Due Diligence" hardcodeado de
// app/activo/[id]/page.tsx — puerto de smtbroker-output-catastro.html. Recap (ubicación/tipo/
// superficie/folio) y los 4 checks son REALES desde 2026-10-03: el padre (ActivoPage) llama a
// POST /api/agentes/legal y pasa el resultado aquí vía `legal` — este componente ya no calcula
// nada, solo renderiza. `legal` llega null mientras carga o si el agente falló (ver `error`).
import type { CheckLegal } from '@/lib/legalTriage'

export interface TriageLegalReal {
  ruta: 'fast' | 'hybrid' | 'slow'
  rutaLabel: string
  rutaDesc: string
  verdictCls: 'ok' | 'warn' | 'bad'
  verdictBadge: string
  verdictTitle: string
  verdictDesc: string
  score: string
  usoSuelo: CheckLegal
  rpp: CheckLegal
  ambiental: CheckLegal
  cfe: CheckLegal
  grounded: boolean
}

const verdictChipCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'border-[#3fbe72]/40 text-exito bg-[#3fbe72]/10',
  warn: 'border-[#D97706]/40 text-aviso bg-[#D97706]/10',
  bad: 'border-error-linea text-error bg-error-suave',
}
const verdictDotCls: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-[#3fbe72]', warn: 'bg-[#D97706]', bad: 'bg-[#e05a5a]' }
const checkIconCls: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-[#3fbe72]/15 text-exito',
  warn: 'bg-[#D97706]/15 text-aviso',
  bad: 'bg-error-suave text-error',
}
const checkStatusCls: Record<'ok' | 'warn' | 'bad', string> = checkIconCls
const checkIconSymbol: Record<'ok' | 'warn' | 'bad', string> = { ok: '✓', warn: '!', bad: '×' }

function CheckRow({ titulo, check }: { titulo: string; check: CheckLegal }) {
  return (
    <div className="bg-tarjeta border border-linea p-4 md:p-5 flex gap-4 items-start rounded-xl">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-sans text-[18px] ${checkIconCls[check.cls]}`}>
        {checkIconSymbol[check.cls]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h4 className="text-[17px] font-medium text-tinta">{titulo}</h4>
          <span className={`font-sans text-[13px] px-2 py-0.5 border ${checkStatusCls[check.cls]} rounded-lg`}>{check.status}</span>
        </div>
        <p className="text-[16px] text-tinta-2 leading-relaxed mb-1.5">{check.desc}</p>
        <p className="text-[14px] text-tenue"><b className="font-medium">Fuente:</b> {check.fuente}</p>
      </div>
    </div>
  )
}

export function DiagnosticoLegal({
  legal, error, ubicacion, tipo, superficieTerreno, superficieConstruccion, folioOClave,
}: {
  legal: TriageLegalReal | null
  error: string | null
  ubicacion: string
  tipo: string
  superficieTerreno: number | null
  superficieConstruccion: number | null
  folioOClave: string | null
}) {
  const superficieTxt = superficieTerreno
    ? `${superficieTerreno} m² terreno${superficieConstruccion ? ` · ${superficieConstruccion} m² const.` : ''}`
    : '—'

  if (error) {
    return (
      <div className="bg-tarjeta border border-error-linea p-5 text-[16px] text-tinta-2 rounded-xl">
        No se pudo generar el diagnóstico legal ({error}). Intenta recargar la página.
      </div>
    )
  }

  if (!legal) {
    return (
      <div className="bg-tarjeta border border-linea p-5 flex items-center gap-3 rounded-xl">
        <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />
        <p className="text-[16px] text-tenue font-sans">Analizando uso de suelo, título y restricciones reales…</p>
      </div>
    )
  }
  const t = legal

  return (
    <div>
      <div className="bg-superficie border border-gold-500/20 p-5 md:p-7 flex flex-wrap justify-between items-center gap-5 mb-4 rounded-xl">
        <div className="flex-1 min-w-[240px]">
          <span className={`inline-flex items-center gap-2 font-sans text-[14px] font-medium px-3 py-1.5 border mb-3 ${verdictChipCls[t.verdictCls]} rounded-lg`}>
            <span className={`w-2 h-2 rounded-full ${verdictDotCls[t.verdictCls]}`} />
            {t.verdictBadge}
          </span>
          <h3 className="font-display text-[21px] font-medium text-tinta mb-1.5">{t.verdictTitle}</h3>
          <p className="text-[16px] text-tenue max-w-[480px]">{t.verdictDesc}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-[44px] leading-none text-acento">{t.score}</div>
          <div className="font-sans text-[13px] text-tenue mt-1">Score legal</div>
        </div>
      </div>

      <div className="flex flex-wrap border border-linea overflow-hidden bg-tarjeta mb-5 rounded-xl">
        {[
          { label: 'Ubicación', val: ubicacion },
          { label: 'Tipo', val: tipo },
          { label: 'Superficie', val: superficieTxt },
          { label: 'Folio / clave', val: folioOClave || 'No capturado' },
        ].map((r, i) => (
          <div key={r.label} className={`flex-1 min-w-[150px] p-3.5 ${i < 3 ? 'border-r border-linea' : ''}`}>
            <div className="font-sans text-[13px] text-tenue mb-1">{r.label}</div>
            <div className="text-[16px] text-tinta">{r.val}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <CheckRow titulo="Uso de suelo" check={t.usoSuelo} />
        <CheckRow titulo="Titularidad y gravámenes (RPP)" check={t.rpp} />
        <CheckRow titulo="Restricciones ambientales" check={t.ambiental} />
        <CheckRow titulo="Restricciones por infraestructura federal (CFE)" check={t.cfe} />
      </div>

      <div className="mt-4 border border-dashed border-linea bg-sutil p-3.5">
        <p className="text-[14px] text-tenue">
          <b className="text-tinta-2 font-medium">Nota de transparencia:</b> {t.grounded
            ? 'diagnóstico generado por el Agente Legal con búsqueda real y GIS municipal (ver fuente de cada check). No existe API pública del Registro Público de la Propiedad — el check de título nunca certifica contra el registro en vivo, se basa en lo que el propietario declaró/aportó.'
            : 'no se encontraron fuentes reales para fundamentar este diagnóstico (búsqueda sin resultados) — trátalo como una estimación sin verificar, no como un diagnóstico confiable.'}
        </p>
      </div>
    </div>
  )
}
