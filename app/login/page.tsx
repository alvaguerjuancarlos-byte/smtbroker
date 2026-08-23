'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : authError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#C9A84C] flex items-center justify-center mb-4 shadow-lg shadow-[#C9A84C]/20">
            <svg width="24" height="24" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M9 2V16M2 6L16 12M16 6L2 12" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-black text-[#111827] tracking-tight">SMTBROKER</h1>
          <p className="text-[11px] text-[#8EA0BC] tracking-[0.14em] uppercase mt-0.5">Plataforma IA de ventas inmobiliarias</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#DDE3EC] shadow-sm p-8">
          <h2 className="text-[18px] font-bold text-[#111827] mb-1">Iniciar sesión</h2>
          <p className="text-[13px] text-[#8EA0BC] mb-6">Accede a tu cuenta para continuar.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#DDE3EC] bg-[#F5F7FA] text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#DDE3EC] bg-[#F5F7FA] text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.4"/>
                  <path d="M8 5v3.5M8 10.5v.5" stroke="#DC2626" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <p className="text-[12px] text-[#991B1B] leading-snug">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </button>

          </form>
        </div>

        {/* Register link */}
        <p className="text-center text-[13px] text-[#8EA0BC] mt-5">
          ¿No tienes cuenta?{' '}
          <a href="/bienvenida" className="text-[#C9A84C] font-semibold hover:text-[#0F1F3D] transition-colors">
            Solicitar acceso
          </a>
        </p>

      </div>
    </div>
  )
}
