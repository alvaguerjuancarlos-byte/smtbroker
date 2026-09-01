'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'propietario' | 'broker' | 'inversionista' | 'broker_maestro'

const HOME_POR_ROL: Record<Rol, string> = {
  propietario: '/dashboard',
  broker: '/portal-broker',
  inversionista: '/portal-inversion',
  broker_maestro: '/panel',
}

// Link secundario propio de cada rol — lo que tiene sentido que haga desde el Topbar además de
// volver a su home. Solo broker_maestro y propietario tienen una acción secundaria hoy.
const LINK_SECUNDARIO: Partial<Record<Rol, { href: string; label: string }>> = {
  broker_maestro: { href: '/panel/prospectos-broker', label: 'Prospección' },
  propietario: { href: '/activo/nuevo', label: 'Registrar activo' },
}

// `tema` distingue el rediseño navy/dorado (nuevo, aplicándose pantalla por pantalla — ver
// /login, /panel) del tema claro original (todavía en uso en el resto). Migración incremental:
// sin esto, cambiar este componente rompería visualmente cualquier pantalla no migrada todavía.
export default function Topbar({ userName, rol, tema = 'claro' }: { userName?: string; rol?: Rol; tema?: 'claro' | 'oscuro' }) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = userName ? userName.charAt(0).toUpperCase() : '?'
  const home = rol ? HOME_POR_ROL[rol] : '/dashboard'
  const secundario = rol ? LINK_SECUNDARIO[rol] : undefined

  if (tema === 'oscuro') {
    return (
      <header className="bg-navy-900/90 backdrop-blur-sm border-b border-white/10 px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4 sticky top-0 z-20">
        <Link href={home} className="flex items-center gap-2.5 shrink-0 group">
          <svg width="26" height="26" viewBox="0 0 30 30" fill="none" className="shrink-0">
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#c9a227" strokeWidth="1.4"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="1.4" opacity="0.55"/>
          </svg>
          <span className="font-fraunces font-semibold text-[16px] text-paper tracking-tight group-hover:text-gold-400 transition-colors">
            SMT<span className="text-gold-400 group-hover:text-paper transition-colors">BROKER</span>
          </span>
        </Link>
        <span className="hidden md:inline text-white/15">|</span>
        <span className="hidden md:inline font-plex-mono text-[11px] text-slate tracking-[0.06em]">Plataforma IA de ventas inmobiliarias</span>
        {secundario && (
          <Link href={secundario.href} className="hidden sm:inline font-plex-mono text-[11.5px] tracking-[0.04em] text-gold-400 hover:text-gold-100 transition-colors ml-2">
            {secundario.label} →
          </Link>
        )}

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
      </header>
    )
  }

  return (
    <header className="bg-white border-b border-[#DDE3EC] px-4 md:px-6 py-3 flex items-center gap-2 md:gap-3 sticky top-0 z-20">
      <div className="w-8 h-8 rounded-lg bg-[#C9A84C] flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" stroke="white" strokeWidth="1.5" fill="none"/>
          <path d="M9 2V16M2 6L16 12M16 6L2 12" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
        </svg>
      </div>
      <Link href={home} className="text-[15px] font-bold text-[#111827] tracking-tight hover:text-[#C9A84C] transition-colors shrink-0">
        SMTBROKER
      </Link>
      <span className="hidden md:inline text-[#DDE3EC] text-sm">|</span>
      <span className="hidden md:inline text-[12px] text-[#8EA0BC]">Plataforma IA de ventas inmobiliarias</span>
      {secundario && (
        <Link href={secundario.href} className="hidden sm:inline text-[12.5px] font-semibold text-[#4B5E7A] hover:text-[#C9A84C] transition-colors ml-2">
          {secundario.label}
        </Link>
      )}

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {userName && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#FBF5E6] flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-[#0F1F3D]">{initial}</span>
            </div>
            <span className="hidden sm:inline text-[13px] font-medium text-[#111827]">{userName}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-[12px] text-[#8EA0BC] hover:text-[#111827] border border-[#DDE3EC] px-2.5 md:px-3 py-1.5 rounded-xl transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}
