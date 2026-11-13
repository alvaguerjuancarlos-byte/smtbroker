'use client'

// Piloto del rediseño navy/dorado (ver smtbroker-landing.html en Documents — mismo lenguaje
// visual: Fraunces + IBM Plex, navy oscuro, dorado, trama de blueprint). Layout intencionalmente
// asimétrico (no la tarjeta centrada tradicional que usa el resto del sitio hoy) — panel de marca
// + panel de acceso, con el motivo de borde dorado desfasado que ya usa `.panel` en la landing.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Marca } from '@/app/components/Marca'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  // "¿Olvidaste tu contraseña?" (2026-10-07, antes del piloto): sin esto, cada olvido de un broker
  // terminaba en Operación enviando la recuperación a mano desde el dashboard de Supabase.
  const [modo, setModo]         = useState<'login' | 'recuperar' | 'enviado'>('login')

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

  // Supabase manda el correo con la plantilla "Reset password", cuyo enlace usa {{ .RedirectTo }}:
  // aquí se fija en /establecer-password (que exige un clic manual, por el escaneo de Gmail). Se
  // muestra el mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: recError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/establecer-password`,
    })
    setLoading(false)
    if (recError && /rate|seconds|too many/i.test(recError.message)) {
      setError('Ya enviamos un correo hace poco. Espera un minuto antes de pedir otro.')
      return
    }
    setModo('enviado')
  }

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans relative overflow-hidden">
      {/* Trama de blueprint — mismo motivo que la landing */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative min-h-screen grid lg:grid-cols-[1.15fr_0.85fr]">

        {/* Panel de marca */}
        <div className="tema-oscuro bg-superficie text-tinta relative flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-16 lg:py-0 overflow-hidden">
          {/* Marca decorativa, sangrada fuera del lienzo */}
          <svg
            className="absolute -bottom-24 -left-24 w-[420px] h-[420px] opacity-[0.07] pointer-events-none"
            viewBox="0 0 30 30" fill="none"
          >
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#ddc06a" strokeWidth="0.6"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="0.6"/>
          </svg>

          <div className="flex items-center gap-3 mb-14">
            <div>
              <Marca texto={21} />
              <span className="block font-sans text-[13px] text-tenue -mt-0.5">BY MINDBRIDGE</span>
            </div>
          </div>

          <span className="font-sans text-[14px] text-acento">
            Acceso · Plataforma
          </span>
          <h1 className="font-display font-medium text-[clamp(32px,4.2vw,52px)] leading-[1.08] tracking-[-0.01em] mt-4 max-w-[13ch]">
            Bienvenido<br /><span className="italic font-normal text-acento">de vuelta.</span>
          </h1>
          <p className="text-[18px] text-tinta-2 max-w-[42ch] mt-5 leading-relaxed">
            Diagnóstico legal y de mercado, certificación de brokers, y el resto del ecosistema Ciertix — todo en un mismo lugar.
          </p>

          <div className="hidden sm:flex items-center gap-3 mt-14 pt-6 border-t border-linea">
            <span className="font-sans text-[13px] text-tenue">Fase 1a</span>
            <span className="text-tenue">·</span>
            <span className="font-sans text-[13px] text-tenue">Monterrey, NL, México</span>
          </div>
        </div>

        {/* Panel de acceso */}
        <div className="relative flex items-center justify-center px-6 py-16 lg:py-0 bg-superficie/60 lg:border-l lg:border-linea">
          <div className="relative w-full max-w-[380px] before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
            <div className="bg-tarjeta border border-linea p-8 sm:p-10 rounded-xl">
              {modo === 'enviado' ? (
                <div className="flex flex-col gap-4">
                  <span className="font-sans text-[13px] text-tenue">Recuperar contraseña</span>
                  <h2 className="font-display text-[28px] font-medium">Revisa tu correo</h2>
                  <p className="text-[16px] text-tinta-2 leading-relaxed">
                    Si <b className="text-tinta">{email.trim()}</b> tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.
                  </p>
                  <button type="button" onClick={() => { setModo('login'); setError('') }}
                    className="font-sans text-[15px] text-acento hover:text-acento-2 text-left">← Volver a iniciar sesión</button>
                </div>
              ) : modo === 'recuperar' ? (
                <form onSubmit={handleRecuperar} className="flex flex-col gap-5">
                  <div>
                    <span className="font-sans text-[13px] text-tenue">Recuperar contraseña</span>
                    <h2 className="font-display text-[28px] font-medium mt-1.5">¿Olvidaste tu contraseña?</h2>
                    <p className="text-[16px] text-tinta-2 mt-2">Escribe tu correo y te enviamos un enlace para crear una nueva.</p>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    required
                    className="w-full px-4 py-3 bg-fondo/60 border border-linea text-[17px] text-tinta placeholder-tenue-2 focus:outline-none focus:border-gold-500 transition-colors rounded-lg"
                  />
                  {error && <p className="text-[15px] text-error">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] font-medium hover:bg-gold-400 transition-all disabled:opacity-60 rounded-lg">
                    {loading ? 'Enviando…' : 'Enviar enlace'}
                  </button>
                  <button type="button" onClick={() => { setModo('login'); setError('') }}
                    className="font-sans text-[15px] text-tenue hover:text-tinta text-left">← Volver a iniciar sesión</button>
                </form>
              ) : (<>
              <span className="font-sans text-[13px] text-tenue">Iniciar sesión</span>
              <h2 className="font-display text-[28px] font-medium mt-1.5 mb-7">Entra a tu cuenta</h2>

              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[13px] text-tenue">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    required
                    className="w-full px-4 py-3 bg-fondo/60 border border-linea text-[17px] text-tinta placeholder-tenue-2 focus:outline-none focus:border-gold-500 transition-colors rounded-lg"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[13px] text-tenue">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 bg-fondo/60 border border-linea text-[17px] text-tinta placeholder-tenue-2 focus:outline-none focus:border-gold-500 transition-colors rounded-lg"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-error-suave border border-error-linea px-4 py-3 rounded-lg">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                      <circle cx="8" cy="8" r="7" stroke="#f3a3a3" strokeWidth="1.3"/>
                      <path d="M8 5v3.5M8 10.5v.5" stroke="#f3a3a3" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <p className="text-[15px] text-error leading-snug">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] font-medium hover:bg-gold-400 hover:-translate-y-px transition-all disabled:opacity-60 disabled:hover:translate-y-0 mt-1 rounded-lg"
                >
                  {loading ? 'Ingresando…' : 'Iniciar sesión →'}
                </button>
                <button type="button" onClick={() => { setModo('recuperar'); setError('') }}
                  className="font-sans text-[15px] text-tenue hover:text-acento transition-colors -mt-1">
                  ¿Olvidaste tu contraseña?
                </button>
              </form>
              </>)}
            </div>

            <p className="text-center text-[16px] text-tenue mt-7">
              ¿No tienes cuenta?{' '}
              <a href="/bienvenida" className="text-acento font-medium hover:text-acento-2 transition-colors">
                Solicitar acceso
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
