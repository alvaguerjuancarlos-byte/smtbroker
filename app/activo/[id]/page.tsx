'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../../components/Topbar'
import { MapView } from '../../components/MapPicker'
import { DiagnosticoLegal } from '../../components/DiagnosticoLegal'

interface Activo {
  id: string
  nombre: string
  tipo: string
  direccion: string
  municipio: string
  estado: string
  superficie: number | null
  precio_total: number | null
  descripcion: string
  status: string
  created_at: string
  lat: number | null
  lng: number | null
  clave_catastral: string | null
  folio_real: string | null
  estado_documentacion_legal: string | null
  escritura_publica: string | null
  gravamenes_conocidos: string | null
  uso_suelo_declarado: string | null
  superficie_construccion_m2: number | null
}

function MetricRow({ label, value, valueClass = 'text-paper' }: {
  label: string; value: string; valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/10 last:border-0">
      <p className="text-[13px] text-paper-dim">{label}</p>
      <p className={`text-[13px] font-medium ${valueClass}`}>{value}</p>
    </div>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const r = 54
  const circ = Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#ddc06a' : score >= 50 ? '#D97706' : '#e05a5a'
  const label = score >= 70 ? 'Valoración Sólida' : score >= 50 ? 'Revisar Precio' : 'Riesgo Elevado'
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 140, height: 90 }}>
        <svg width="140" height="90" viewBox="0 0 140 90" fill="none">
          <path d="M 16 74 A 54 54 0 0 1 124 74" stroke="rgba(255,255,255,0.1)" strokeWidth="12" strokeLinecap="round" fill="none"/>
          <path d="M 16 74 A 54 54 0 0 1 124 74" stroke={color} strokeWidth="12" strokeLinecap="round" fill="none"
            strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 1s ease' }}/>
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1">
          <span className="font-fraunces text-[30px] font-medium leading-none" style={{ color }}>{score}</span>
          <span className="text-[11px] text-slate">/ 100</span>
        </div>
      </div>
      <span className="font-plex-mono text-[11px] font-medium mt-2" style={{ color }}>{label}</span>
    </div>
  )
}

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

export default function ActivoPage() {
  const router = useRouter()
  const params = useParams()
  const id     = params.id as string

  const [activo,  setActivo]  = useState<Activo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('activos').select('*').eq('id', id).eq('usuario_id', user.id).single()

      if (!data) { router.push('/dashboard'); return }
      setActivo(data as Activo)
      setLoading(false)
    }
    init()
  }, [id, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando activo…</p>
      </div>
    )
  }

  if (!activo) return null

  // Datos simulados derivados del activo real
  const precioBase    = activo.precio_total || 5000000
  const superficieM2  = activo.superficie   || 200
  const precioM2      = Math.round(precioBase / superficieM2)
  const precioMin     = Math.round(precioBase * 0.92)
  const precioMax     = Math.round(precioBase * 1.14)
  const precioSalida  = Math.round(precioBase * 1.08)
  const plusvalia     = '+12%'
  const scoreConf     = 76

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="relative flex flex-col flex-1">
      <Topbar rol="propietario" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[860px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Breadcrumb */}
          <div>
            <button onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-[13px] text-slate hover:text-paper mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Mis activos
            </button>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="font-fraunces text-[24px] md:text-[28px] font-medium text-paper">{activo.nombre}</h1>
                <p className="text-[14px] text-slate mt-1">{activo.tipo} · {activo.municipio}, {activo.estado}</p>
              </div>
              <span className="font-plex-mono text-[10.5px] font-medium px-3 py-1.5 border border-gold-500/40 text-gold-400 bg-gold-500/10 self-start shrink-0">
                Diagnóstico completado
              </span>
            </div>
          </div>

          {/* Navegación de fases */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { fase: '01', label: 'Diagnóstico', href: null,                       active: true  },
              { fase: '02', label: 'Marketing',   href: `/activo/${id}/marketing`,  active: false },
              { fase: '03', label: 'Leads',       href: `/activo/${id}/leads`,      active: false },
            ].map(f => (
              <button key={f.fase}
                onClick={() => f.href && router.push(f.href)}
                disabled={!f.href}
                className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 border text-left transition-all ${
                  f.active
                    ? 'bg-gold-500 border-gold-500 text-navy-950'
                    : f.href
                      ? 'bg-navy-800 border-white/10 text-paper hover:border-gold-500/50'
                      : 'bg-navy-800 border-white/10 text-slate-dim cursor-not-allowed'
                }`}>
                <span className={`font-plex-mono text-[10px] font-medium px-1.5 py-0.5 shrink-0 ${f.active ? 'bg-navy-950/20 text-navy-950' : 'bg-white/5 text-slate'}`}>
                  {f.fase}
                </span>
                <span className="text-[12px] md:text-[13px] font-medium truncate">{f.label}</span>
              </button>
            ))}
          </div>

          {/* Hero banner */}
          <div className="bg-navy-900 border border-gold-500/20 p-5 md:p-7">
            <div className="mb-4 md:mb-5">
              <span className="inline-flex items-center gap-1.5 font-plex-mono text-[10px] font-medium tracking-[0.1em] uppercase bg-gold-500 text-navy-950 px-3 py-1 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-navy-950 animate-pulse" />
                Análisis Completado
              </span>
              <h2 className="font-fraunces text-[18px] md:text-[22px] font-medium text-paper leading-tight">{activo.nombre}</h2>
              <p className="text-[13px] text-slate mt-1">{activo.tipo} · {activo.municipio}, {activo.estado}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 md:gap-4 pt-4 md:pt-5 border-t border-white/10">
              <div>
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-wide mb-1">Precio salida</p>
                <p className="font-plex-mono text-[15px] md:text-[19px] font-medium text-[#6bdb9a] leading-tight">{formatMXN(precioSalida)}</p>
                <p className="text-[10px] text-slate">recomendado</p>
              </div>
              <div>
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-wide mb-1">Precio / m²</p>
                <p className="font-plex-mono text-[15px] md:text-[19px] font-medium text-paper leading-tight">{formatMXN(precioM2)}</p>
                <p className="text-[10px] text-slate">zona</p>
              </div>
              <div>
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-wide mb-1">Score</p>
                <p className="font-plex-mono text-[15px] md:text-[19px] font-medium text-[#6bdb9a] leading-tight">{scoreConf}</p>
                <p className="text-[10px] text-slate">/ 100</p>
              </div>
            </div>
          </div>

          {/* Estrategia recomendada */}
          <div className="bg-gold-500/[0.06] border-l-2 border-gold-500 p-6">
            <p className="font-plex-mono text-[11px] font-medium text-gold-400 tracking-[0.1em] uppercase mb-1">Estrategia recomendada</p>
            <h3 className="font-fraunces text-[18px] font-medium text-paper mb-2">
              Venta directa a inversionista · Precio de salida {formatMXN(precioSalida)}
            </h3>
            <p className="text-[14px] text-paper-dim leading-relaxed">
              Con base en el análisis normativo del activo y la demanda activa en {activo.municipio}, la estrategia óptima es posicionar el {activo.tipo.toLowerCase()} como una oportunidad de inversión de alto potencial. El rango de mercado detectado es de <strong className="text-paper">{formatMXN(precioMin)}</strong> a <strong className="text-paper">{formatMXN(precioMax)}</strong>. Un precio de salida de <strong className="text-paper">{formatMXN(precioSalida)}</strong> maximiza la velocidad de cierre sin sacrificar rentabilidad.
            </p>
          </div>

          {/* Mapa de ubicación */}
          {activo.lat && activo.lng && (
            <div>
              <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-4">Ubicación del Activo</h2>
              <MapView lat={activo.lat} lng={activo.lng} label={activo.nombre} />
            </div>
          )}

          {/* Due Diligence Legal — diagnóstico del Agente Legal (catastro/RPP), ver
              lib/legalTriage.ts. Datos de recap reales; los 4 checks son simulados hasta que se
              cierren los spikes de integración (ver HANDOFF_Catastro_Input_Output.md). */}
          <div>
            <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-4">Diagnóstico Legal · Agente Due Diligence</h2>
            <DiagnosticoLegal
              estadoDocumentacionLegal={activo.estado_documentacion_legal}
              ubicacion={`${activo.municipio}, ${activo.estado}`}
              tipo={activo.tipo}
              superficieTerreno={activo.superficie}
              superficieConstruccion={activo.superficie_construccion_m2}
              folioOClave={activo.folio_real || activo.clave_catastral}
            />
          </div>

          {/* Análisis de Mercado */}
          <div>
            <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-4">Análisis de Mercado · Agente de Comparables</h2>
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6">
              <div className="flex items-center gap-3 mb-4 md:mb-5">
                <span className="inline-flex items-center gap-1.5 font-plex-mono text-[11px] font-medium px-3 py-1.5 border border-gold-500/40 text-gold-400 bg-gold-500/10">
                  <span className="w-2 h-2 rounded-full bg-gold-500" />
                  Demanda Activa
                </span>
                <span className="text-[12px] text-paper-dim">{activo.municipio}, {activo.estado}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8 mb-4 md:mb-5">
                <div>
                  <MetricRow label="Activos comparables analizados" value="12 propiedades" />
                  <MetricRow label="Precio promedio zona" value={formatMXN(precioM2) + '/m²'} />
                  <MetricRow label="Plusvalía 3 años" value={plusvalia} valueClass="text-gold-400 font-medium" />
                </div>
                <div>
                  <MetricRow label="Tiempo promedio de venta" value="4.5 meses" />
                  <MetricRow label="Rango de precio detectado" value={`${formatMXN(precioMin)} – ${formatMXN(precioMax)}`} />
                  <MetricRow label="Demanda estimada" value="Alta" valueClass="text-gold-400 font-medium" />
                </div>
              </div>
              <div className="border border-white/10 bg-white/[0.02] px-4 py-3">
                <p className="font-plex-mono text-[10.5px] font-medium text-gold-400 uppercase tracking-wide mb-1">Precio de salida recomendado</p>
                <p className="text-[13px] font-medium text-paper">{formatMXN(precioSalida)} · posicionamiento en percentil 65 del mercado local</p>
              </div>
            </div>
          </div>

          {/* Score de confianza */}
          <div>
            <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-4">Score de Confianza en la Valoración</h2>
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-start md:gap-8">
                <div className="flex justify-center md:justify-start mb-4 md:mb-0">
                  <ScoreGauge score={scoreConf} />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] md:text-[14px] text-paper-dim leading-relaxed mb-4">
                    El Score de Confianza mide la precisión de la valoración en función de la disponibilidad de comparables, calidad de la documentación y condiciones del mercado local. Un puntaje de <strong className="text-paper">{scoreConf}/100</strong> indica una <strong className="text-gold-400">valoración confiable</strong> con margen de error estimado del ±8%.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Comparables de mercado', score: 82, color: '#ddc06a' },
                      { label: 'Documentación legal',    score: 78, color: '#ddc06a' },
                      { label: 'Condición del activo',   score: 68, color: '#D97706' },
                    ].map(d => (
                      <div key={d.label} className="bg-navy-950/60 border border-white/5 p-3">
                        <p className="text-[10px] text-slate mb-2">{d.label}</p>
                        <div className="h-1 bg-white/10 overflow-hidden mb-1">
                          <div className="h-full" style={{ width: `${d.score}%`, backgroundColor: d.color }} />
                        </div>
                        <p className="font-plex-mono text-[12px] font-medium" style={{ color: d.color }}>{d.score}/100</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gold-500/[0.06] border-l-2 border-gold-500 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium text-gold-400 mb-1">Diagnóstico completo · Listo para marketing</p>
              <p className="text-[13px] text-paper-dim">El agente de marketing generará el media kit y la campaña de captación.</p>
            </div>
            <button
              onClick={() => router.push(`/activo/${id}/marketing`)}
              className="flex items-center justify-center gap-2 bg-gold-500 text-navy-950 px-6 py-3.5 font-plex-mono text-[13px] tracking-[0.02em] hover:bg-gold-400 transition-colors shrink-0"
            >
              Ir a Marketing
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="#070f1c" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

        </div>
      </main>
      </div>
    </div>
  )
}
