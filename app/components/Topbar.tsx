'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Topbar({ userName }: { userName?: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = userName ? userName.charAt(0).toUpperCase() : '?'

  return (
    <header className="bg-white border-b border-[#DDE3EC] px-4 md:px-6 py-3 flex items-center gap-2 md:gap-3 sticky top-0 z-20">
      <div className="w-8 h-8 rounded-lg bg-[#C9A84C] flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" stroke="white" strokeWidth="1.5" fill="none"/>
          <path d="M9 2V16M2 6L16 12M16 6L2 12" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
        </svg>
      </div>
      <Link href="/dashboard" className="text-[15px] font-bold text-[#111827] tracking-tight hover:text-[#C9A84C] transition-colors shrink-0">
        SMTBROKER
      </Link>
      <span className="hidden md:inline text-[#DDE3EC] text-sm">|</span>
      <span className="hidden md:inline text-[12px] text-[#8EA0BC]">Plataforma IA de ventas inmobiliarias</span>

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
