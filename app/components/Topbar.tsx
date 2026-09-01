'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'propietario' | 'broker' | 'inversionista' | 'broker_maestro'

const HOME_POR_ROL: Record<Rol, string> = {
  propietario: '/dashboard',
  broker: '/portal-broker',
  inversionista: '/portal-inversion',
  broker_maestro: '/panel',
}

// Navegación visible en el Topbar por rol — mismo componente y misma forma para los cuatro,
// para que la barra se sienta consistente en toda la plataforma (antes cada rol tenía a lo más
// un link suelto, o ninguno). El Broker Maestro ve enlaces a las cuatro áreas (incluidas las
// vistas propias de propietario/inversionista/broker) porque es quien supervisa todo el
// ecosistema — los demás roles solo ven lo suyo.
const NAV_POR_ROL: Record<Rol, { href: string; label: string }[]> = {
  propietario: [
    { href: '/dashboard', label: 'Mis activos' },
    { href: '/activo/nuevo', label: 'Registrar activo' },
  ],
  broker: [
    { href: '/portal-broker', label: 'Mi portal' },
  ],
  inversionista: [
    { href: '/portal-inversion', label: 'Mi portal' },
  ],
  broker_maestro: [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/prospectos-broker', label: 'Prospección' },
    { href: '/dashboard', label: 'Vista propietario' },
    { href: '/portal-inversion', label: 'Vista inversionista' },
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
    <header className="bg-navy-900/90 backdrop-blur-sm border-b border-white/10 sticky top-0 z-20">
      <div className="px-4 md:px-6 py-3 flex items-center gap-3 md:gap-5">
        <Link href={home} className="flex items-center gap-2.5 shrink-0 group">
          <svg width="26" height="26" viewBox="0 0 30 30" fill="none" className="shrink-0">
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#c9a227" strokeWidth="1.4"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="1.4" opacity="0.55"/>
          </svg>
          <span className="font-fraunces font-semibold text-[16px] text-paper tracking-tight group-hover:text-gold-400 transition-colors">
            SMT<span className="text-gold-400 group-hover:text-paper transition-colors">BROKER</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {nav.map(n => {
            const active = pathname === n.href
            return (
              <Link key={n.href} href={n.href}
                className={`font-plex-mono text-[11.5px] tracking-[0.03em] px-2.5 py-1.5 transition-colors ${
                  active ? 'text-gold-400 bg-gold-500/10' : 'text-slate hover:text-paper'
                }`}>
                {n.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {userName && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-navy-700 border border-gold-500/30 flex items-center justify-center shrink-0">
                <span className="font-plex-mono text-[11px] font-medium text-gold-400">{initial}</span>
              </div>
              <span className="hidden sm:inline text-[13px] text-paper-dim">{userName}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 font-plex-mono text-[11px] tracking-[0.04em] text-slate hover:text-gold-400 border border-white/15 hover:border-gold-500 px-2.5 md:px-3 py-1.5 transition-colors"
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
                className={`font-plex-mono text-[11px] tracking-[0.03em] px-2.5 py-1.5 whitespace-nowrap transition-colors ${
                  active ? 'text-gold-400 bg-gold-500/10' : 'text-slate hover:text-paper'
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
