'use client'

import { EncabezadoPantalla } from '../components/Banda'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { statusCfg, formatDate } from '@/lib/estadoActivo'
import Topbar from '../components/Topbar'
import { HOME_POR_ROL } from '@/lib/roles'

interface Activo {
  id: string
  nombre: string
  tipo: string
  municipio: string
  estado: string
  status: string
  created_at: string
}

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

      // Inversionista, broker y broker_maestro tienen su propio home — este dashboard está
      // armado para el propietario ("mis activos"), no le sirve de nada a nadie más (ver
      // lib/roles.ts: antes esta lista vivía por separado aquí y no incluía broker_maestro, que
      // se quedaba viendo esta pantalla vacía en vez de caer en /panel).
      const rolUsuario = (profile as { rol: string | null } | null)?.rol
      if (rolUsuario && rolUsuario !== 'propietario' && rolUsuario in HOME_POR_ROL) {
        router.push(HOME_POR_ROL[rolUsuario as keyof typeof HOME_POR_ROL])
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
      <div className="min-h-screen bg-fondo flex items-center justify-center">
        <p className="text-tenue text-[17px] font-sans">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex flex-col relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="relative flex flex-col flex-1">
      <Topbar userName={userName} rol="propietario" />

      <main className="flex-1 px-4 md:px-6 pb-10">
        <div className="w-full max-w-[1000px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Bienvenida */}
          <EncabezadoPantalla ancho="max-w-[1000px]" titulo={`Hola, ${firstName}`} subtitulo="Gestiona tus activos inmobiliarios"
            derecha={
              <button
                onClick={() => router.push('/activo/nuevo')}
                className="flex items-center gap-2 bg-gold-500 text-navy-950 font-sans text-[17px] font-semibold px-5 py-3 hover:bg-gold-400 transition-colors rounded-lg"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="#070f1c" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span className="hidden sm:inline">Registrar activo</span>
                <span className="sm:hidden">Registrar</span>
              </button>
            } />

          {/* Resumen de fases */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              { fase: '01', label: 'Diagnóstico', desc: 'Valuación + due diligence', chip: 'border-gold-500/40 text-acento bg-gold-500/10' },
              { fase: '02', label: 'Marketing',   desc: 'Media kit + captación de leads', chip: 'border-[#4F46E5]/40 text-violeta bg-[#4F46E5]/10' },
              { fase: '03', label: 'Cierre',      desc: 'Lead scoring + entrega al asesor', chip: 'border-[#D97706]/40 text-aviso bg-[#D97706]/10' },
            ].map(f => (
              <div key={f.fase} className="bg-tarjeta border border-linea p-5 rounded-xl">
                <span className={`font-sans text-[13px] font-medium px-2 py-0.5 border ${f.chip} rounded-lg`}>Fase {f.fase}</span>
                <p className="font-display text-[18px] font-medium text-tinta mt-3">{f.label}</p>
                <p className="text-[15px] text-tenue mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Lista de activos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[19px] font-medium text-tinta">Mis activos</h2>
              <span className="text-[15px] text-tenue">{activos.length} {activos.length === 1 ? 'activo' : 'activos'}</span>
            </div>

            {activos.length === 0 ? (
              <div className="bg-tarjeta border border-linea px-8 py-14 flex flex-col items-center gap-3 text-center rounded-xl">
                <div className="w-14 h-14 bg-fondo/60 border border-linea flex items-center justify-center mb-1">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#5f6a80" strokeWidth="1.5" fill="none"/>
                    <path d="M9 21V12h6v9" stroke="#5f6a80" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[17px] font-medium text-tinta">Sin activos registrados</p>
                <p className="text-[16px] text-tenue max-w-[260px]">
                  Registra tu primer activo para iniciar el proceso de valoración y venta.
                </p>
                <button
                  onClick={() => router.push('/activo/nuevo')}
                  className="mt-2 text-[16px] font-medium text-acento hover:text-acento-2 transition-colors"
                >
                  Registrar activo →
                </button>
              </div>
            ) : (
              <div className="bg-tarjeta border border-linea overflow-hidden rounded-xl">
                {activos.map((a, i) => {
                  const { label, chip } = statusCfg(a.status)
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-linea' : ''} hover:bg-sutil transition-colors cursor-pointer`}
                      onClick={() => router.push(`/activo/${a.id}`)}
                    >
                      <div className="w-9 h-9 bg-fondo/60 border border-linea flex items-center justify-center shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#8b96ab" strokeWidth="1.5" fill="none"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[17px] font-medium text-tinta truncate">{a.nombre}</p>
                        <p className="text-[14px] text-tenue mt-0.5 truncate">{a.tipo} · {a.municipio}, {a.estado} · {formatDate(a.created_at)}</p>
                      </div>
                      <span className={`font-sans text-[13px] font-medium px-2.5 py-1 border shrink-0 ${chip} rounded-lg`}>{label}</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-tenue-2 shrink-0">
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
