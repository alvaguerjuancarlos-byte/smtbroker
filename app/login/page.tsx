'use client'

// Piloto del rediseño navy/dorado (ver smtbroker-landing.html en Documents — mismo lenguaje
// visual: Fraunces + IBM Plex, navy oscuro, dorado, trama de blueprint). Layout intencionalmente
// asimétrico (no la tarjeta centrada tradicional que usa el resto del sitio hoy) — panel de marca
// + panel de acceso, con el motivo de borde dorado desfasado que ya usa `.panel` en la landing.
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
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans relative overflow-hidden">
      {/* Trama de blueprint — mismo motivo que la landing */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(244,240,230,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.09) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative min-h-screen grid lg:grid-cols-[1.15fr_0.85fr]">

        {/* Panel de marca */}
        <div className="relative flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-16 lg:py-0 overflow-hidden">
          {/* Marca decorativa, sangrada fuera del lienzo */}
          <svg
            className="absolute -bottom-24 -left-24 w-[420px] h-[420px] opacity-[0.07] pointer-events-none"
            viewBox="0 0 30 30" fill="none"
          >
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#ddc06a" strokeWidth="0.6"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="0.6"/>
          </svg>

          <span className="font-plex-mono text-[11px] tracking-[0.22em] uppercase text-gold-400">
            Acceso · Plataforma
          </span>
          <h1 className="font-fraunces font-medium text-[clamp(32px,4.2vw,52px)] leading-[1.08] tracking-[-0.01em] mt-4 max-w-[13ch]">
            Bienvenido<br /><span className="italic font-normal text-gold-400">de vuelta.</span>
          </h1>
          <p className="text-[15px] text-paper-dim max-w-[42ch] mt-5 leading-relaxed">
            Diagnóstico legal y de mercado, certificación de brokers, y el resto del ecosistema SMTBROKER — todo en un mismo lugar.
          </p>

          <div className="hidden sm:flex items-center gap-3 mt-14 pt-6 border-t border-white/10">
            <span className="font-plex-mono text-[10px] tracking-[0.14em] uppercase text-slate">Fase 1a</span>
            <span className="text-slate">·</span>
            <span className="font-plex-mono text-[10px] tracking-[0.14em] uppercase text-slate">Monterrey, NL, México</span>
          </div>
        </div>

        {/* Panel de acceso */}
        <div className="relative flex items-center justify-center px-6 py-16 lg:py-0 bg-navy-900/60 lg:border-l lg:border-white/10">
          <div className="relative w-full max-w-[380px] before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
            <div className="bg-navy-800 border border-white/10 p-8 sm:p-10">
              <span className="font-plex-mono text-[10px] tracking-[0.16em] uppercase text-slate">Iniciar sesión</span>
              <h2 className="font-fraunces text-[24px] font-medium mt-1.5 mb-7">Entra a tu cuenta</h2>

              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="font-plex-mono text-[10.5px] tracking-[0.1em] uppercase text-slate">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    required
                    className="w-full px-4 py-3 bg-navy-950/60 border border-white/15 text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-plex-mono text-[10.5px] tracking-[0.1em] uppercase text-slate">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 bg-navy-950/60 border border-white/15 text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-900/60 px-4 py-3">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                      <circle cx="8" cy="8" r="7" stroke="#f3a3a3" strokeWidth="1.3"/>
                      <path d="M8 5v3.5M8 10.5v.5" stroke="#f3a3a3" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <p className="text-[12px] text-[#f3a3a3] leading-snug">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.04em] font-medium hover:bg-gold-400 hover:-translate-y-px transition-all disabled:opacity-60 disabled:hover:translate-y-0 mt-1"
                >
                  {loading ? 'Ingresando…' : 'Iniciar sesión →'}
                </button>
              </form>
            </div>

            <p className="text-center text-[13px] text-slate mt-7">
              ¿No tienes cuenta?{' '}
              <a href="/bienvenida" className="text-gold-400 font-medium hover:text-gold-100 transition-colors">
                Solicitar acceso
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
