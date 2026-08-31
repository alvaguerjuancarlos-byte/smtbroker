'use client'

// Página de destino de los links de invitación y de reset de password (ver
// app/api/invitar-broker/route.ts y lib/emailTemplates — ambas plantillas apuntan aquí con
// ?token_hash=...&type=invite|recovery en vez del link de auto-verificación de Supabase).
//
// Por qué NO se verifica el token_hash automáticamente al cargar: Gmail (y otros clientes de
// correo/escáneres de seguridad) visitan los links dentro de un correo apenas llega, para
// revisarlos por phishing. Si esta página llamara a verifyOtp() en un useEffect, ese escaneo
// automático consumiría el token de un solo uso antes de que la persona le diera clic — y el
// link real le fallaría con "invalid or expired". Por eso se exige un clic manual en un botón:
// un escáner automatizado carga la página pero no hace clic en botones.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Estado = 'revisando' | 'porConfirmar' | 'confirmando' | 'listo' | 'invalido'

export default function EstablecerPasswordPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>('revisando')
  const [tokenHash, setTokenHash] = useState('')
  const [tipo, setTipo] = useState<'invite' | 'recovery'>('recovery')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const check = async () => {
      // Caso link viejo (#access_token=... de un ConfirmationURL de Supabase, ya procesado
      // por supabase-js al cargar) — sigue soportado para no romper invitaciones ya enviadas.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setEstado('listo'); return }

      const params = new URLSearchParams(window.location.search)
      const th = params.get('token_hash')
      const ty = params.get('type')
      if (th && (ty === 'invite' || ty === 'recovery')) {
        setTokenHash(th)
        setTipo(ty)
        setEstado('porConfirmar')
        return
      }

      setEstado('invalido')
    }
    check()
  }, [])

  const handleConfirmar = async () => {
    setEstado('confirmando')
    setError('')
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
    if (err) {
      setError(err.message)
      setEstado('invalido')
      return
    }
    setEstado('listo')
  }

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

  if (estado === 'revisando') {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Revisando enlace…</p>
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
          {estado === 'invalido' && (
            <>
              <h2 className="text-[18px] font-bold text-[#111827] mb-1">Enlace inválido o expirado</h2>
              <p className="text-[13px] text-[#8EA0BC] mb-6">
                Este enlace ya no es válido (los enlaces expiran después de un tiempo o de un solo uso). Pide que te envíen uno nuevo.
              </p>
              <a href="/login" className="block text-center w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors">
                Ir a iniciar sesión
              </a>
            </>
          )}

          {(estado === 'porConfirmar' || estado === 'confirmando') && (
            <>
              <h2 className="text-[18px] font-bold text-[#111827] mb-1">Confirma tu enlace</h2>
              <p className="text-[13px] text-[#8EA0BC] mb-6">
                Por seguridad, confirma manualmente para continuar (esto evita que un escáner de correo lo abra por ti).
              </p>
              <button
                onClick={handleConfirmar}
                disabled={estado === 'confirmando'}
                className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {estado === 'confirmando' ? 'Confirmando…' : 'Confirmar y continuar'}
              </button>
            </>
          )}

          {estado === 'listo' && (
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
