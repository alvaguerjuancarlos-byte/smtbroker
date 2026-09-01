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
}

const LEADS_SIMULADOS = [
  { id: '1', nombre: 'Carlos Mendoza',    score: 92, canal: 'Portales',  status: 'listo',       contacto: 'c.mendoza@email.com' },
  { id: '2', nombre: 'Grupo Inversiones RM', score: 88, canal: 'Redes', status: 'listo',       contacto: '+52 81 2345 6789' },
  { id: '3', nombre: 'Ana Sofía Reyes',   score: 74, canal: 'Portales',  status: 'calificado',  contacto: 'areyes@gmail.com' },
  { id: '4', nombre: 'Roberto Castillo',  score: 71, canal: 'Correo',    status: 'calificado',  contacto: '+52 33 9876 5432' },
  { id: '5', nombre: 'Inmobiliaria VH',   score: 65, canal: 'Redes',     status: 'interesado',  contacto: 'contacto@vh.mx' },
  { id: '6', nombre: 'Patricia Lozano',   score: 58, canal: 'Portales',  status: 'interesado',  contacto: 'p.lozano@email.com' },
  { id: '7', nombre: 'Eduardo Garza',     score: 42, canal: 'Redes',     status: 'curioso',     contacto: '+52 81 1111 2222' },
  { id: '8', nombre: 'Fernanda Ruiz',     score: 35, canal: 'Correo',    status: 'curioso',     contacto: 'fruiz@hotmail.com' },
  { id: '9', nombre: 'Miguel Torres',     score: 28, canal: 'Portales',  status: 'curioso',     contacto: '+52 33 5555 6666' },
]

const scoreCfg = (score: number) => {
  if (score >= 80) return { label: 'Inversionista serio', badge: 'bg-gold-500/10 text-gold-400',  dot: 'bg-gold-500' }
  if (score >= 60) return { label: 'Calificado',          badge: 'bg-[#4F46E5]/10 text-[#a5a1f5]',  dot: 'bg-[#4F46E5]' }
  if (score >= 40) return { label: 'Interesado',          badge: 'bg-[#D97706]/10 text-[#e8b568]',  dot: 'bg-[#D97706]' }
  return               { label: 'Curioso',               badge: 'bg-white/5 text-slate',  dot: 'bg-slate' }
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#ddc06a' : score >= 60 ? '#4F46E5' : score >= 40 ? '#D97706' : '#5f6a80'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-[12px] font-bold text-paper w-8 text-right">{score}</span>
    </div>
  )
}

function FunnelChart() {
  const pasos = [
    { label: 'Contactos totales',  valor: 38, color: 'rgba(255,255,255,0.06)', texto: '#c9d3e0' },
    { label: 'Interesados',        valor: 15, color: 'rgba(217,119,6,0.15)', texto: '#e8b568' },
    { label: 'Calificados',        valor: 6,  color: 'rgba(79,70,229,0.15)', texto: '#a5a1f5' },
    { label: 'Listos para cerrar', valor: 2,  color: 'rgba(201,162,39,0.15)', texto: '#ddc06a' },
  ]
  const max = pasos[0].valor

  return (
    <div className="bg-navy-800 border border-white/10 p-6">
      <p className="text-[15px] font-bold text-paper mb-1">Embudo de calificación</p>
      <p className="text-[12px] text-slate mb-6">De contacto a cierre</p>
      <div className="flex flex-col gap-2">
        {pasos.map((p, i) => {
          const pct = (p.valor / max) * 100
          const margin = ((100 - pct) / 2)
          return (
            <div key={i} style={{ marginLeft: `${margin * 0.5}%`, marginRight: `${margin * 0.5}%` }}>
              <div className="rounded-xl px-4 py-3 flex items-center justify-between transition-all"
                style={{ backgroundColor: p.color }}>
                <span className="text-[12px] font-semibold" style={{ color: p.texto }}>{p.label}</span>
                <span className="text-[18px] font-black" style={{ color: p.texto }}>{p.valor}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreDistChart() {
  const rangos = [
    { label: 'Curiosos',     rango: '0–39',   count: 3, color: '#5f6a80' },
    { label: 'Interesados',  rango: '40–59',  count: 2, color: '#D97706' },
    { label: 'Calificados',  rango: '60–79',  count: 2, color: '#4F46E5' },
    { label: 'Serios',       rango: '80–100', count: 2, color: '#ddc06a' },
  ]
  const max = Math.max(...rangos.map(r => r.count))

  return (
    <div className="bg-navy-800 border border-white/10 p-6">
      <p className="text-[15px] font-bold text-paper mb-1">Distribución de scores</p>
      <p className="text-[12px] text-slate mb-6">Leads por rango de calificación</p>
      <div className="flex items-end gap-4 h-[120px]">
        {rangos.map((r, i) => {
          const pct = (r.count / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[13px] font-black" style={{ color: r.color }}>{r.count}</span>
              <div className="w-full flex items-end" style={{ height: 80 }}>
                <div className="w-full rounded-t-lg" style={{ height: `${pct}%`, backgroundColor: r.color }} />
              </div>
              <span className="text-[9px] text-slate text-center leading-tight">{r.label}</span>
              <span className="text-[9px] text-slate-dim">{r.rango}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const params = useParams()
  const id     = params.id as string

  const [activo,  setActivo]  = useState<Activo | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro,  setFiltro]  = useState<'todos' | 'serios' | 'calificados' | 'interesados' | 'curiosos'>('todos')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('activos')
        .select('id, nombre, tipo, municipio, estado')
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
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando…</p>
      </div>
    )
  }

  const leadsFiltrados = LEADS_SIMULADOS.filter(l => {
    if (filtro === 'todos')        return true
    if (filtro === 'serios')       return l.score >= 80
    if (filtro === 'calificados')  return l.score >= 60 && l.score < 80
    if (filtro === 'interesados')  return l.score >= 40 && l.score < 60
    if (filtro === 'curiosos')     return l.score < 40
    return true
  })

  const topLead = LEADS_SIMULADOS[0]

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
            <button onClick={() => router.push(`/activo/${id}`)}
              className="flex items-center gap-1.5 text-[13px] text-slate hover:text-paper mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {activo?.nombre}
            </button>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-[22px] md:text-[26px] font-black text-paper">Leads y calificación</h1>
                <p className="text-[14px] text-slate mt-1">Fase 03 · {activo?.tipo} en {activo?.municipio}, {activo?.estado}</p>
              </div>
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-gold-500/10 text-gold-400 self-start shrink-0">
                2 listos para cerrar
              </span>
            </div>
          </div>

          {/* Navegación de fases */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { fase: '01', label: 'Diagnóstico', href: `/activo/${id}`,           active: false },
              { fase: '02', label: 'Marketing',   href: `/activo/${id}/marketing`, active: false },
              { fase: '03', label: 'Leads',       href: null,                      active: true  },
            ].map(f => (
              <button key={f.fase}
                onClick={() => f.href && router.push(f.href)}
                disabled={!f.href}
                className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl border text-left transition-all ${
                  f.active
                    ? 'bg-gold-500 border-gold-500 text-navy-950'
                    : f.href
                      ? 'bg-navy-800 border-white/10 text-paper hover:border-gold-500'
                      : 'bg-navy-800 border-white/10 text-slate-dim cursor-not-allowed'
                }`}>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${f.active ? 'bg-navy-950/20 text-navy-950' : 'bg-white/10 text-slate'}`}>
                  {f.fase}
                </span>
                <span className="text-[12px] md:text-[13px] font-semibold truncate">{f.label}</span>
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Total leads',           value: '9',      sub: 'captados',           color: 'text-paper' },
              { label: 'Serios',                value: '2',      sub: 'score ≥ 80',         color: 'text-gold-400' },
              { label: 'Score promedio',        value: '61',     sub: 'de 100 posible',      color: 'text-[#a5a1f5]' },
              { label: 'Resp. promedio',        value: '18 min', sub: 'primer contacto',     color: 'text-[#e8b568]' },
            ].map(s => (
              <div key={s.label} className="bg-navy-800 border border-white/10 p-4 md:p-5">
                <p className="text-[11px] text-slate uppercase tracking-wide mb-2">{s.label}</p>
                <p className={`text-[22px] md:text-[24px] font-black ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-slate mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FunnelChart />
            <ScoreDistChart />
          </div>

          {/* Top lead destacado */}
          <div className="bg-navy-900 border border-gold-500/20 p-5 md:p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase bg-gold-500 text-white px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Lead prioritario
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[18px] md:text-[22px] font-black text-white truncate">{topLead.nombre}</h3>
                <p className="text-[12px] md:text-[13px] text-white/50 mt-1">Canal: {topLead.canal} · {topLead.contacto}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[30px] md:text-[36px] font-black text-[#4ade80]">{topLead.score}</p>
                <p className="text-[11px] text-white/40">/ 100</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {[
                { label: 'Capacidad financiera', value: 'Alta · Pre-aprobado' },
                { label: 'Tiempo de decisión',   value: '2–3 semanas' },
                { label: 'Interés declarado',    value: 'Inversión inmediata' },
              ].map(d => (
                <div key={d.label}>
                  <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">{d.label}</p>
                  <p className="text-[13px] font-semibold text-white">{d.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lista de leads con filtros */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-[16px] font-bold text-paper">Todos los leads</h2>
              <div className="flex items-center flex-wrap gap-1.5">
                {(['todos', 'serios', 'calificados', 'interesados', 'curiosos'] as const).map(f => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors capitalize ${
                      filtro === f
                        ? 'bg-gold-500 text-navy-950'
                        : 'bg-navy-800 border border-white/10 text-slate hover:text-paper'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-navy-800 border border-white/10 overflow-hidden">
              {leadsFiltrados.map((lead, i) => {
                const cfg = scoreCfg(lead.score)
                return (
                  <div key={lead.id}
                    className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== leadsFiltrados.length - 1 ? 'border-b border-white/10' : ''} hover:bg-white/[0.02] transition-colors`}>
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <span className="text-[13px] font-black text-paper-dim">{lead.nombre.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-paper truncate">{lead.nombre}</p>
                      <p className="text-[11px] text-slate mt-0.5 truncate">{lead.contacto} · {lead.canal}</p>
                    </div>
                    <div className="hidden sm:flex flex-1 max-w-[120px]">
                      <ScoreBar score={lead.score} />
                    </div>
                    <span className={`text-[10px] md:text-[11px] font-bold px-2 md:px-2.5 py-1 rounded-full shrink-0 ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Paquete de transparencia */}
          <div>
            <h2 className="text-[13px] font-bold text-slate tracking-[0.12em] uppercase mb-4">Paquete de Transparencia · Enviado a leads serios</h2>
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { doc: 'Reporte de valoración completo',    enviado: true  },
                  { doc: 'Ficha legal y normativa',           enviado: true  },
                  { doc: 'Análisis de mercado y comparables', enviado: true  },
                  { doc: 'Contrato de promesa de compraventa', enviado: false },
                ].map(d => (
                  <div key={d.doc} className={`flex items-center gap-3 p-3.5 rounded-xl border ${d.enviado ? 'border-gold-500/40 bg-gold-500/[0.06]' : 'border-white/10 bg-navy-950/60'}`}>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${d.enviado ? 'bg-gold-500' : 'bg-white/10'}`}>
                      {d.enviado
                        ? <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 4v6M4 7h6" stroke="#8b96ab" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      }
                    </div>
                    <p className={`text-[12px] font-medium ${d.enviado ? 'text-paper' : 'text-slate'}`}>{d.doc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA cierre */}
          <div className="bg-gold-500/[0.06] border-l-2 border-gold-500 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[15px] font-bold text-gold-400 mb-1">Lead listo para firmar · {topLead.nombre}</p>
              <p className="text-[13px] text-paper-dim">Score {topLead.score}/100 · Notifica al broker para iniciar el cierre.</p>
            </div>
            <button className="flex items-center justify-center gap-2 bg-gold-500 text-navy-950 px-6 py-3.5 font-plex-mono text-[13px] tracking-[0.02em] hover:bg-gold-400 transition-colors shrink-0">
              Notificar al broker
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

        </div>
      </main>
      </div>
    </div>
  )
}
