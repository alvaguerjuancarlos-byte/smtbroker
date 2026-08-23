'use client'

// Página de destino del link de invitación (ver app/api/invitar-broker/route.ts, redirectTo).
// Supabase ya deja la sesión activa al abrir el link de invite — aquí solo se pide la
// contraseña definitiva. Mismo lenguaje visual que /login.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function EstablecerPasswordPage() {
  const router = useRouter()
  const [checandoSesion, setCheckandoSesion] = useState(true)
  const [tieneSesion, setTieneSesion] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setTieneSesion(!!session)
      setCheckandoSesion(false)
    }
    check()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirmar) { setError('Las contraseñas no coinciden.'); return }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) { setError(err.message); return }
    router.push('/dashboard')
  }

  if (checandoSesion) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Verificando invitación…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

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

        <div className="bg-white rounded-2xl border border-[#DDE3EC] shadow-sm p-8">
          {!tieneSesion ? (
            <>
              <h2 className="text-[18px] font-bold text-[#111827] mb-1">Enlace inválido o expirado</h2>
              <p className="text-[13px] text-[#8EA0BC] mb-6">
                Este enlace de invitación ya no es válido (las invitaciones expiran después de un tiempo). Pide al Broker Maestro que te envíe una nueva desde el panel.
              </p>
              <a href="/login" className="block text-center w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors">
                Ir a iniciar sesión
              </a>
            </>
          ) : (
            <>
              <h2 className="text-[18px] font-bold text-[#111827] mb-1">Crea tu contraseña</h2>
              <p className="text-[13px] text-[#8EA0BC] mb-6">Último paso para activar tu cuenta.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-[#DDE3EC] bg-[#F5F7FA] text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-[#DDE3EC] bg-[#F5F7FA] text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
                    <p className="text-[12px] text-[#991B1B] leading-snug">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? 'Guardando…' : 'Activar cuenta'}
                </button>
              </form>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
