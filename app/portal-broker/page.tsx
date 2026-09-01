'use client'

// Home propio para el rol "broker" — antes caían al /dashboard de propietario ("Mis activos",
// vacío porque un broker no posee nada). Mismo criterio que /portal-inversion: contenido mínimo
// y honesto, sin inventar un motor de matches/referidos que todavía no existe.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../components/Topbar'

export default function PortalBrokerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cuenta } = await supabase.from('usuarios').select('nombre').eq('id', user.id).single()
      setUserName((cuenta as { nombre: string } | null)?.nombre || user.email || 'Usuario')

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
      <Topbar userName={userName} rol="broker" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[700px] mx-auto flex flex-col gap-6">

          <div>
            <h1 className="font-fraunces text-[26px] md:text-[30px] font-medium text-paper leading-tight">Hola, {firstName}</h1>
            <p className="text-[14px] text-slate mt-1.5">Bienvenido al ecosistema de brokers aliados de SMTBROKER</p>
          </div>

          <div className="bg-navy-800 border border-white/10 p-6 md:p-8 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mb-1">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="7" r="4" stroke="#ddc06a" strokeWidth="1.6" fill="none"/>
                <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="#ddc06a" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" stroke="#ddc06a" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[15px] font-medium text-paper">Todavía no tienes activos ni matches asignados</p>
            <p className="text-[13px] text-slate max-w-[420px] leading-relaxed">
              El motor que cruza activos con brokers aliados todavía no existe — por ahora, el Broker Maestro te contactará directamente cuando haya una oportunidad para ti.
            </p>
          </div>

        </div>
      </main>
      </div>
    </div>
  )
}
