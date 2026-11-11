'use client'

// Panel del cliente (Documento Maestro V7.2; maqueta aprobada por JC el 1-nov-2026): adonde llega al
// terminar el recorrido guiado (/empezar). "Lo que Smart Bróker prepara para ti":
//   - quien vende: su precio realista (el Agente de Mercado lo calcula aquí la primera vez y avisa
//     por correo), la invitación a certificar, su página de venta y, si va por su cuenta, el broker;
//   - quien compra: afinar su búsqueda (detalles), lo que coincide, su Radar y, si va por su
//     cuenta, el broker.
// ?camino=broker (eligió "con un broker verificado" en el recorrido) pone primero elegir broker.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { homePorRol } from '@/lib/roles'
import Topbar from '../components/Topbar'
import PanelVendedor from './PanelVendedor'
import PanelComprador from './PanelComprador'

const GRID_BG = {
  backgroundImage:
    'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function InicioPage() {
  const router = useRouter()
  const [rol, setRol] = useState<'propietario' | 'inversionista' | null>(null)
  const [nombre, setNombre] = useState('')
  const [uid, setUid] = useState('')
  const [conBroker, setConBroker] = useState(false)

  useEffect(() => {
    const init = async () => {
      setConBroker(new URLSearchParams(window.location.search).get('camino') === 'broker')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('usuarios').select('rol, nombre').eq('id', user.id).maybeSingle()
      const u = data as { rol: string | null; nombre: string | null } | null
      if (u?.rol !== 'propietario' && u?.rol !== 'inversionista') { router.push(homePorRol(u?.rol ?? null)); return }
      setUid(user.id)
      setNombre((u.nombre || '').split(' ')[0])
      setRol(u.rol)
    }
    init()
  }, [router])

  if (!rol) {
    return <div className="min-h-screen bg-fondo flex items-center justify-center"><p className="text-tenue text-[17px] font-sans">Cargando…</p></div>
  }

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative flex flex-col flex-1">
        <Topbar rol={rol} />
        <main className="flex-1 px-4 md:px-6 pb-10">
          <div className="w-full max-w-[860px] mx-auto flex flex-col gap-4">
            {rol === 'propietario'
              ? <PanelVendedor uid={uid} nombre={nombre} conBroker={conBroker} />
              : <PanelComprador uid={uid} nombre={nombre} conBroker={conBroker} />}
          </div>
        </main>
      </div>
    </div>
  )
}
