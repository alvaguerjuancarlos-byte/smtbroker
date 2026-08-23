'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../components/Topbar'

interface Activo {
  id: string
  nombre: string
  tipo: string
  municipio: string
  estado: string
  status: string
  created_at: string
}

const statusCfg = (status: string) => {
  if (status === 'valoracion')  return { label: 'En valoración',   badge: 'bg-[#FEF3C7] text-[#92600A]' }
  if (status === 'marketing')   return { label: 'En marketing',    badge: 'bg-[#EEF2FF] text-[#3730A3]' }
  if (status === 'leads')       return { label: 'Leads activos',   badge: 'bg-[#FBF5E6] text-[#0F1F3D]' }
  if (status === 'cerrado')     return { label: 'Cerrado',         badge: 'bg-[#F3F4F6] text-[#374151]' }
  return { label: 'Ingresado', badge: 'bg-[#F3F4F6] text-[#6B7280]' }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export default function DashboardPage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [activos,  setActivos]  = useState<Activo[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', user.id)
        .single()

      setUserName((profile as { nombre: string } | null)?.nombre || user.email || 'Usuario')

      const { data } = await supabase
        .from('activos')
        .select('id, nombre, tipo, municipio, estado, status, created_at')
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)

      setActivos((data as Activo[]) || [])
      setLoading(false)
    }
    init()
  }, [router])

  const firstName = userName.split(' ')[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar userName={userName} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Bienvenida */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-[24px] md:text-[28px] font-black text-[#111827] leading-tight">
                Hola, {firstName}
              </h1>
              <p className="text-[14px] text-[#8EA0BC] mt-1">Gestiona tus activos inmobiliarios</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/panel')}
                className="flex items-center gap-2 text-[13px] md:text-[14px] font-semibold text-[#111827] px-4 md:px-5 py-2.5 md:py-3 rounded-xl border border-[#DDE3EC] bg-white hover:border-[#C9A84C] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                  <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
                <span className="hidden sm:inline">Panel maestro</span>
                <span className="sm:hidden">Panel</span>
              </button>
              <button
                onClick={() => router.push('/activo/nuevo')}
                className="flex items-center gap-2 bg-[#C9A84C] text-white text-[13px] md:text-[14px] font-semibold px-4 md:px-5 py-2.5 md:py-3 rounded-xl hover:bg-[#0F1F3D] transition-colors shadow-sm shadow-[#C9A84C]/20"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span className="hidden sm:inline">Registrar activo</span>
                <span className="sm:hidden">Registrar</span>
              </button>
            </div>
          </div>

          {/* Resumen de fases */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              { fase: '01', label: 'Diagnóstico', desc: 'Valuación + due diligence', color: 'bg-[#FBF5E6] text-[#0F1F3D]' },
              { fase: '02', label: 'Marketing',   desc: 'Media kit + captación de leads', color: 'bg-[#EEF2FF] text-[#3730A3]' },
              { fase: '03', label: 'Cierre',      desc: 'Lead scoring + entrega al broker', color: 'bg-[#FEF3C7] text-[#92600A]' },
            ].map(f => (
              <div key={f.fase} className="bg-white rounded-2xl border border-[#DDE3EC] p-5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.color}`}>Fase {f.fase}</span>
                <p className="text-[15px] font-bold text-[#111827] mt-3">{f.label}</p>
                <p className="text-[12px] text-[#8EA0BC] mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Lista de activos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#111827]">Mis activos</h2>
              <span className="text-[12px] text-[#8EA0BC]">{activos.length} {activos.length === 1 ? 'activo' : 'activos'}</span>
            </div>

            {activos.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] px-8 py-14 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#F5F7FA] border border-[#DDE3EC] flex items-center justify-center mb-1">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#BFC9D8" strokeWidth="1.5" fill="none"/>
                    <path d="M9 21V12h6v9" stroke="#BFC9D8" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[#111827]">Sin activos registrados</p>
                <p className="text-[13px] text-[#8EA0BC] max-w-[260px]">
                  Registra tu primer activo para iniciar el proceso de valoración y venta.
                </p>
                <button
                  onClick={() => router.push('/activo/nuevo')}
                  className="mt-2 text-[13px] font-semibold text-[#C9A84C] hover:text-[#0F1F3D] transition-colors"
                >
                  Registrar activo →
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                {activos.map((a, i) => {
                  const { label, badge } = statusCfg(a.status)
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-[#EDF1F7]' : ''} hover:bg-[#FAFBFA] transition-colors cursor-pointer`}
                      onClick={() => router.push(`/activo/${a.id}`)}
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#F5F7FA] border border-[#DDE3EC] flex items-center justify-center shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#8EA0BC" strokeWidth="1.5" fill="none"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#111827] truncate">{a.nombre}</p>
                        <p className="text-[11px] text-[#8EA0BC] mt-0.5 truncate">{a.tipo} · {a.municipio}, {a.estado} · {formatDate(a.created_at)}</p>
                      </div>
                      <span className={`text-[10px] md:text-[11px] font-bold px-2 md:px-2.5 py-1 rounded-full shrink-0 ${badge}`}>{label}</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#BFC9D8] shrink-0">
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
