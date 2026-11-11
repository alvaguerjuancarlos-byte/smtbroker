'use client'

// Nueva búsqueda de un comprador que ya tiene cuenta (Documento Maestro V8, §19.5: hasta 3 activas).
// Misma ficha que el registro (app/empezar/FichaNecesidad.tsx), sin pedir la cuenta.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { homePorRol } from '@/lib/roles'
import FichaNecesidad from '../empezar/FichaNecesidad'

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function BuscarPage() {
  const router = useRouter()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/empezar?quiere=comprar'); return }
      const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).maybeSingle()
      const rol = (data as { rol: string | null } | null)?.rol ?? null
      if (rol !== 'inversionista') { router.push(homePorRol(rol)); return }
      setListo(true)
    }
    init()
  }, [router])

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative w-full max-w-[460px] mx-auto px-5 py-6 flex flex-col gap-6">
        {listo
          ? <FichaNecesidad conSesion onAtras={() => router.push('/inicio')} pasoBase={0} totalPasos={5} />
          : <p className="text-slate text-[14px] font-plex-mono py-10 text-center">Cargando…</p>}
      </div>
    </div>
  )
}
