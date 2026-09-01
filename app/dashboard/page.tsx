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
  if (status === 'valoracion')  return { label: 'En valoración', chip: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10' }
  if (status === 'marketing')   return { label: 'En marketing',  chip: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10' }
  if (status === 'leads')       return { label: 'Leads activos', chip: 'border-gold-500/40 text-gold-400 bg-gold-500/10' }
  if (status === 'cerrado')     return { label: 'Cerrado',       chip: 'border-white/15 text-slate bg-white/5' }
  return { label: 'Ingresado', chip: 'border-white/15 text-slate bg-white/5' }
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
        .select('nombre, rol')
        .eq('id', user.id)
        .single()

      // Inversionista y broker tienen su propio portal — este dashboard está armado para el
      // propietario ("mis activos"), no le sirve de nada a alguien que no posee ningún activo.
      const HOME_POR_ROL: Record<string, string> = { inversionista: '/portal-inversion', broker: '/portal-broker' }
      const rolUsuario = (profile as { rol: string | null } | null)?.rol
      if (rolUsuario && HOME_POR_ROL[rolUsuario]) {
        router.push(HOME_POR_ROL[rolUsuario])
        return
      }

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
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando…</p>
      </div>
    )
  }

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
      <Topbar userName={userName} rol="propietario" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Bienvenida */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-fraunces text-[26px] md:text-[30px] font-medium text-paper leading-tight">
                Hola, {firstName}
              </h1>
              <p className="text-[14px] text-slate mt-1.5">Gestiona tus activos inmobiliarios</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/panel')}
                className="flex items-center gap-2 font-plex-mono text-[11.5px] tracking-[0.03em] text-paper-dim px-4 md:px-5 py-2.5 md:py-3 border border-white/15 hover:border-gold-500 hover:text-gold-400 transition-colors"
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
                className="flex items-center gap-2 bg-gold-500 text-navy-950 font-plex-mono text-[11.5px] tracking-[0.03em] px-4 md:px-5 py-2.5 md:py-3 hover:bg-gold-400 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="#070f1c" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span className="hidden sm:inline">Registrar activo</span>
                <span className="sm:hidden">Registrar</span>
              </button>
            </div>
          </div>

          {/* Resumen de fases */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              { fase: '01', label: 'Diagnóstico', desc: 'Valuación + due diligence', chip: 'border-gold-500/40 text-gold-400 bg-gold-500/10' },
              { fase: '02', label: 'Marketing',   desc: 'Media kit + captación de leads', chip: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10' },
              { fase: '03', label: 'Cierre',      desc: 'Lead scoring + entrega al broker', chip: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10' },
            ].map(f => (
              <div key={f.fase} className="bg-navy-800 border border-white/10 p-5">
                <span className={`font-plex-mono text-[10px] font-medium px-2 py-0.5 border ${f.chip}`}>Fase {f.fase}</span>
                <p className="font-fraunces text-[16px] font-medium text-paper mt-3">{f.label}</p>
                <p className="text-[12px] text-slate mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Lista de activos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-fraunces text-[17px] font-medium text-paper">Mis activos</h2>
              <span className="text-[12px] text-slate">{activos.length} {activos.length === 1 ? 'activo' : 'activos'}</span>
            </div>

            {activos.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 px-8 py-14 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-navy-950/60 border border-white/10 flex items-center justify-center mb-1">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#5f6a80" strokeWidth="1.5" fill="none"/>
                    <path d="M9 21V12h6v9" stroke="#5f6a80" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-medium text-paper">Sin activos registrados</p>
                <p className="text-[13px] text-slate max-w-[260px]">
                  Registra tu primer activo para iniciar el proceso de valoración y venta.
                </p>
                <button
                  onClick={() => router.push('/activo/nuevo')}
                  className="mt-2 text-[13px] font-medium text-gold-400 hover:text-gold-100 transition-colors"
                >
                  Registrar activo →
                </button>
              </div>
            ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {activos.map((a, i) => {
                  const { label, chip } = statusCfg(a.status)
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-white/10' : ''} hover:bg-white/[0.02] transition-colors cursor-pointer`}
                      onClick={() => router.push(`/activo/${a.id}`)}
                    >
                      <div className="w-9 h-9 bg-navy-950/60 border border-white/10 flex items-center justify-center shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#8b96ab" strokeWidth="1.5" fill="none"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-paper truncate">{a.nombre}</p>
                        <p className="text-[11px] text-slate mt-0.5 truncate">{a.tipo} · {a.municipio}, {a.estado} · {formatDate(a.created_at)}</p>
                      </div>
                      <span className={`font-plex-mono text-[10px] font-medium px-2.5 py-1 border shrink-0 ${chip}`}>{label}</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-dim shrink-0">
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
    </div>
  )
}
