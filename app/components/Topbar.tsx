'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { HOME_POR_ROL, type Rol } from '@/lib/roles'
import { Marca } from './Marca'

// Navegación visible en el Topbar por rol — mismo componente y misma forma para los cuatro,
// para que la barra se sienta consistente en toda la plataforma (antes cada rol tenía a lo más
// un link suelto, o ninguno). Operación MindBridge (rol interno 'broker_maestro', ver
// lib/roles.ts) ve enlaces a todas las áreas porque supervisa la plataforma — los demás roles solo
// ven lo suyo.
const NAV_POR_ROL: Record<Rol, { href: string; label: string }[]> = {
  propietario: [
    { href: '/inicio', label: 'Inicio' },
    { href: '/dashboard', label: 'Mis activos' },
    { href: '/activo/nuevo', label: 'Registrar activo' },
  ],
  broker: [
    { href: '/portal-broker', label: 'Mi portal' },
    { href: '/activo/nuevo', label: 'Cargar propiedad' },
  ],
  inversionista: [
    { href: '/inicio', label: 'Inicio' },
    { href: '/portal-inversion', label: 'Mi portal' },
  ],
  broker_maestro: [
    { href: '/panel', label: 'Operación' },
    { href: '/panel/prospectos-broker', label: 'Prospección' },
    { href: '/dashboard', label: 'Vista propietario' },
    { href: '/portal-inversion', label: 'Vista comprador' },
    { href: '/portal-broker', label: 'Vista broker' },
  ],
}

export default function Topbar({ userName, rol }: { userName?: string; rol?: Rol }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = userName ? userName.charAt(0).toUpperCase() : '?'
  const home = rol ? HOME_POR_ROL[rol] : '/dashboard'
  const nav = rol ? NAV_POR_ROL[rol] : []

  return (
    <header className="tema-oscuro bg-superficie border-b border-linea sticky top-0 z-20">
      <div className="px-4 md:px-6 py-3 flex items-center gap-3 md:gap-5">
        <Link href={home} className="flex items-center gap-2.5 shrink-0 group">
          <Marca texto={18} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {nav.map(n => {
            const active = pathname === n.href
            return (
              <Link key={n.href} href={n.href}
                className={`font-sans text-[14px] px-2.5 py-1.5 transition-colors ${
                  active ? 'text-acento bg-gold-500/10' : 'text-tenue hover:text-tinta'
                }`}>
                {n.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {userName && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-sutil border border-gold-500/30 flex items-center justify-center shrink-0">
                <span className="font-sans text-[14px] font-medium text-acento">{initial}</span>
              </div>
              <span className="hidden sm:inline text-[16px] text-tinta-2">{userName}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 font-sans text-[14px] text-tenue hover:text-acento border border-linea hover:border-gold-500 px-2.5 md:px-3 py-1.5 transition-colors rounded-lg"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden sm:inline">SALIR</span>
          </button>
        </div>
      </div>

      {/* Nav en móvil — misma lista, debajo del renglón principal */}
      {nav.length > 0 && (
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2.5 overflow-x-auto">
          {nav.map(n => {
            const active = pathname === n.href
            return (
              <Link key={n.href} href={n.href}
                className={`font-sans text-[14px] px-2.5 py-1.5 whitespace-nowrap transition-colors ${
                  active ? 'text-acento bg-gold-500/10' : 'text-tenue hover:text-tinta'
                }`}>
                {n.label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
