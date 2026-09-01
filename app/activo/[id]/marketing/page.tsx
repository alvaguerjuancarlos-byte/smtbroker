'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../../../components/Topbar'

interface Activo {
  id: string
  nombre: string
  tipo: string
  municipio: string
  estado: string
  superficie: number | null
  precio_total: number | null
}

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const VISTAS_SEMANA = [
  { dia: 'Lun', vistas: 142 },
  { dia: 'Mar', vistas: 198 },
  { dia: 'Mié', vistas: 175 },
  { dia: 'Jue', vistas: 223 },
  { dia: 'Vie', vistas: 267 },
  { dia: 'Sáb', vistas: 189 },
  { dia: 'Dom', vistas: 90  },
]

function BarChart() {
  const max = Math.max(...VISTAS_SEMANA.map(d => d.vistas))
  return (
    <div className="bg-white rounded-2xl border border-[#DDE3EC] p-5 md:p-6 md:col-span-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[15px] font-bold text-[#111827]">Vistas por día</p>
          <p className="text-[12px] text-[#8EA0BC]">Últimos 7 días · 1,284 total</p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#FBF5E6] text-[#0F1F3D]">+18% vs semana anterior</span>
      </div>
      <div className="flex items-end gap-2 h-[120px]">
        {VISTAS_SEMANA.map((d, i) => {
          const pct = (d.vistas / max) * 100
          const isMax = d.vistas === max
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <span className={`text-[10px] font-bold ${isMax ? 'text-[#C9A84C]' : 'text-[#8EA0BC]'}`}>{d.vistas}</span>
              <div className="w-full flex items-end" style={{ height: 80 }}>
                <div
                  className={`w-full rounded-t-lg transition-all ${isMax ? 'bg-[#C9A84C]' : 'bg-[#EDD9A3]'}`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-[#8EA0BC]">{d.dia}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LEADS_CANALES = [
  { canal: 'Portales',  leads: 18, color: '#C9A84C' },
  { canal: 'Redes',     leads: 14, color: '#3730A3' },
  { canal: 'Correo',    leads: 6,  color: '#D97706' },
]

function DonutChart() {
  const total = LEADS_CANALES.reduce((a, c) => a + c.leads, 0)
  const r = 42
  const circ = 2 * Math.PI * r
  let offset = 0

  const segments = LEADS_CANALES.map(c => {
    const pct   = c.leads / total
    const dash  = pct * circ
    const gap   = circ - dash
    const seg   = { ...c, dash, gap, offset, pct }
    offset += dash
    return seg
  })

  return (
    <div className="bg-white rounded-2xl border border-[#DDE3EC] p-6">
      <p className="text-[15px] font-bold text-[#111827] mb-1">Leads por canal</p>
      <p className="text-[12px] text-[#8EA0BC] mb-5">{total} contactos totales</p>
      <div className="flex items-center gap-6">
        <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#EDF1F7" strokeWidth="12" />
            {segments.map((s, i) => (
              <circle key={i} cx="50" cy="50" r={r} fill="none"
                stroke={s.color} strokeWidth="12"
                strokeDasharray={`${s.dash} ${s.gap}`}
                strokeDashoffset={-s.offset}
                transform="rotate(-90 50 50)"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-black text-[#111827]">{total}</span>
            <span className="text-[9px] text-[#8EA0BC]">leads</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 flex-1">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-[12px] text-[#4B5E7A]">{s.canal}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-[#111827]">{s.leads}</span>
                <span className="text-[10px] text-[#8EA0BC]">{Math.round(s.pct * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color = 'text-[#111827]' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#DDE3EC] p-5">
      <p className="text-[11px] text-[#8EA0BC] uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-[26px] font-black ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#8EA0BC] mt-0.5">{sub}</p>}
    </div>
  )
}

function CanalCard({ nombre, icono, alcance, status, leads }: {
  nombre: string; icono: React.ReactNode; alcance: string; status: 'activo' | 'programado' | 'inactivo'; leads: number
}) {
  const statusCfg = {
    activo:     { label: 'Activo',      badge: 'bg-[#FBF5E6] text-[#0F1F3D]', dot: 'bg-[#C9A84C]' },
    programado: { label: 'Programado',  badge: 'bg-[#FEF3C7] text-[#92600A]', dot: 'bg-[#D97706]' },
    inactivo:   { label: 'Inactivo',    badge: 'bg-[#F3F4F6] text-[#6B7280]', dot: 'bg-[#D1D5DB]' },
  }
  const cfg = statusCfg[status]

  return (
    <div className="bg-white rounded-2xl border border-[#DDE3EC] p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F5F7FA] border border-[#DDE3EC] flex items-center justify-center shrink-0">
            {icono}
          </div>
          <p className="text-[14px] font-bold text-[#111827]">{nombre}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${cfg.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#8EA0BC]">Alcance estimado</span>
        <span className="font-semibold text-[#111827]">{alcance}</span>
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#8EA0BC]">Leads captados</span>
        <span className={`font-bold ${leads > 0 ? 'text-[#0F1F3D]' : 'text-[#8EA0BC]'}`}>{leads}</span>
      </div>
    </div>
  )
}

export default function MarketingPage() {
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
        .from('activos')
        .select('id, nombre, tipo, municipio, estado, superficie, precio_total')
        .eq('id', id)
        .eq('usuario_id', user.id)
        .single()

      if (!data) { router.push('/dashboard'); return }
      setActivo(data as Activo)
      setLoading(false)
    }
    init()
  }, [id, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Cargando…</p>
      </div>
    )
  }

  if (!activo) return null

  const precio      = activo.precio_total || 5000000
  const superficie  = activo.superficie   || 200
  const precioM2    = Math.round(precio / superficie)

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar rol="propietario" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[860px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Breadcrumb */}
          <div>
            <button onClick={() => router.push(`/activo/${id}`)}
              className="flex items-center gap-1.5 text-[13px] text-[#8EA0BC] hover:text-[#111827] mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {activo.nombre}
            </button>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-[22px] md:text-[26px] font-black text-[#111827]">Marketing y captación</h1>
                <p className="text-[14px] text-[#8EA0BC] mt-1">Fase 02 · {activo.tipo} en {activo.municipio}, {activo.estado}</p>
              </div>
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#FBF5E6] text-[#0F1F3D] self-start shrink-0 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                Campaña activa
              </span>
            </div>
          </div>

          {/* Navegación de fases */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { fase: '01', label: 'Diagnóstico', href: `/activo/${id}`,        active: false },
              { fase: '02', label: 'Marketing',   href: null,                   active: true  },
              { fase: '03', label: 'Leads',       href: `/activo/${id}/leads`,  active: false },
            ].map(f => (
              <button key={f.fase}
                onClick={() => f.href && router.push(f.href)}
                disabled={!f.href}
                className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl border text-left transition-all ${
                  f.active
                    ? 'bg-[#C9A84C] border-[#C9A84C] text-white'
                    : f.href
                      ? 'bg-white border-[#DDE3EC] text-[#111827] hover:border-[#C9A84C] hover:shadow-sm'
                      : 'bg-white border-[#DDE3EC] text-[#C4CFC8] cursor-not-allowed'
                }`}>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${f.active ? 'bg-white/20 text-white' : 'bg-[#EDF1F7] text-[#8EA0BC]'}`}>
                  {f.fase}
                </span>
                <span className="text-[12px] md:text-[13px] font-semibold truncate">{f.label}</span>
              </button>
            ))}
          </div>

          {/* Estadísticas de campaña */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Vistas totales"      value="1,284" sub="últimos 7 días"        color="text-[#111827]" />
            <StatCard label="Contactos recibidos" value="38"    sub="vía todos los canales" color="text-[#C9A84C]" />
            <StatCard label="Visitas al inmueble" value="6"     sub="confirmadas"           color="text-[#3730A3]" />
            <StatCard label="Tasa de conversión"  value="2.9%"  sub="contactos / vistas"    color="text-[#D97706]" />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BarChart />
            <DonutChart />
          </div>

          {/* Narrativa de venta */}
          <div>
            <h2 className="text-[13px] font-bold text-[#8EA0BC] tracking-[0.12em] uppercase mb-4">Narrativa de Venta · Agente de Marketing</h2>
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-7">
              <div className="flex items-center gap-3 mb-4 md:mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#FBF5E6] flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#111827]">{activo.nombre}</p>
                  <p className="text-[12px] text-[#8EA0BC]">Generada por Agente de Marketing IA</p>
                </div>
              </div>

              <div className="bg-[#F5F7FA] rounded-xl p-4 md:p-5 mb-4 md:mb-5">
                <p className="text-[13px] md:text-[14px] text-[#111827] leading-relaxed">
                  Oportunidad excepcional en <strong>{activo.municipio}, {activo.estado}</strong>. Este {activo.tipo.toLowerCase()} de <strong>{superficie.toLocaleString('es-MX')} m²</strong> se encuentra en una zona de alta plusvalía con crecimiento sostenido, ideal para inversionistas que buscan rendimientos superiores al mercado.
                </p>
                <p className="text-[13px] md:text-[14px] text-[#111827] leading-relaxed mt-3">
                  Con un precio de <strong>{formatMXN(precio)}</strong> ({formatMXN(precioM2)}/m²), el activo se posiciona competitivamente dentro del percentil 65 del mercado local, ofreciendo un margen de negociación estratégico y un potencial de plusvalía proyectado del <strong>+12% en 3 años</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Titular para portales',   value: `${activo.tipo} en venta · ${activo.municipio} · ${formatMXN(precio)}` },
                  { label: 'Hashtags sugeridos',      value: `#InversionInmobiliaria #${activo.municipio.replace(/\s/g,'')} #BienesRaices` },
                  { label: 'Puntos de venta clave',   value: 'Plusvalía, ubicación estratégica, precio competitivo' },
                ].map(item => (
                  <div key={item.label} className="bg-[#F5F7FA] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-wide mb-2">{item.label}</p>
                    <p className="text-[12px] text-[#111827] leading-relaxed">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Media Kit */}
          <div>
            <h2 className="text-[13px] font-bold text-[#8EA0BC] tracking-[0.12em] uppercase mb-4">Media Kit</h2>
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-7">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { nombre: 'Ficha técnica PDF',      status: true,  desc: '2 páginas · datos del activo y valoración' },
                  { nombre: 'Brochure ejecutivo',     status: true,  desc: 'Diseño profesional para presentar a compradores' },
                  { nombre: 'Galería fotográfica',    status: false, desc: 'Pendiente · subir fotos del activo' },
                  { nombre: 'Video de presentación',  status: false, desc: 'Pendiente · recorrido virtual o drone' },
                ].map(item => (
                  <div key={item.nombre} className={`flex items-start gap-3 p-4 rounded-xl border ${item.status ? 'border-[#EDD9A3] bg-[#F0FBF6]' : 'border-[#DDE3EC] bg-[#F5F7FA]'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.status ? 'bg-[#C9A84C]' : 'bg-[#DDE3EC]'}`}>
                      {item.status ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 4v6M4 7h6" stroke="#8EA0BC" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className={`text-[13px] font-semibold ${item.status ? 'text-[#111827]' : 'text-[#8EA0BC]'}`}>{item.nombre}</p>
                      <p className="text-[11px] text-[#8EA0BC] mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Canales de distribución */}
          <div>
            <h2 className="text-[13px] font-bold text-[#8EA0BC] tracking-[0.12em] uppercase mb-4">Canales de Distribución</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CanalCard
                nombre="Portales inmobiliarios"
                icono={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#C9A84C" strokeWidth="1.6" fill="none"/><path d="M9 21V12h6v9" stroke="#C9A84C" strokeWidth="1.6" strokeLinecap="round"/></svg>}
                alcance="12,000 usuarios/mes"
                status="activo"
                leads={18}
              />
              <CanalCard
                nombre="Redes sociales"
                icono={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="#3730A3" strokeWidth="1.6"/><circle cx="6" cy="12" r="3" stroke="#3730A3" strokeWidth="1.6"/><circle cx="18" cy="19" r="3" stroke="#3730A3" strokeWidth="1.6"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="#3730A3" strokeWidth="1.6"/></svg>}
                alcance="8,500 impresiones"
                status="activo"
                leads={14}
              />
              <CanalCard
                nombre="WhatsApp / Correo directo"
                icono={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Z" stroke="#D97706" strokeWidth="1.6" fill="none"/><path d="m22 6-10 7L2 6" stroke="#D97706" strokeWidth="1.6" strokeLinecap="round"/></svg>}
                alcance="450 contactos segmentados"
                status="programado"
                leads={6}
              />
              <CanalCard
                nombre="Red de brokers aliados"
                icono={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="4" stroke="#6B7280" strokeWidth="1.6" fill="none"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/></svg>}
                alcance="85 brokers activos"
                status="inactivo"
                leads={0}
              />
            </div>
          </div>

          {/* Agente conversacional */}
          <div>
            <h2 className="text-[13px] font-bold text-[#8EA0BC] tracking-[0.12em] uppercase mb-4">Agente Conversacional · Captación 24/7</h2>
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FBF5E6] flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#C9A84C" strokeWidth="1.8" fill="none"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-[#111827]">Asistente IA de ventas</p>
                    <p className="text-[12px] text-[#8EA0BC]">Responde dudas técnicas y legales en tiempo real</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#FBF5E6] text-[#0F1F3D] self-start sm:self-auto flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                  En línea
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {[
                  { label: 'Conversaciones iniciadas', value: '38' },
                  { label: 'Tiempo prom. de respuesta', value: '< 1 min' },
                  { label: 'Satisfacción del usuario',  value: '94%' },
                ].map(s => (
                  <div key={s.label} className="bg-[#F5F7FA] rounded-xl p-4 text-center">
                    <p className="text-[22px] font-black text-[#C9A84C]">{s.value}</p>
                    <p className="text-[11px] text-[#8EA0BC] mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#F0FBF6] border border-[#C9A84C]/30 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[15px] font-bold text-[#0F1F3D] mb-1">38 contactos captados · Listos para calificar</p>
              <p className="text-[13px] text-[#5a9078]">El agente de scoring filtrará a los inversionistas serios de los curiosos.</p>
            </div>
            <button
              onClick={() => router.push(`/activo/${id}/leads`)}
              className="flex items-center justify-center gap-2 bg-[#C9A84C] text-white px-6 py-3.5 rounded-xl text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors shrink-0"
            >
              Ver Leads
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}
