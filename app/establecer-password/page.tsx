'use client'

// Página de destino de los links de invitación y de reset de password (ver
// app/api/invitar-usuario/route.ts y las plantillas de Supabase — ambas apuntan aquí con
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

  const gridBg = {
    backgroundImage:
      'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
    backgroundSize: '56px 56px',
  }

  if (estado === 'revisando') {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center relative">
        <div className="absolute inset-0 pointer-events-none" style={gridBg} />
        <p className="relative text-slate text-[14px] font-plex-mono">Revisando enlace…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 pointer-events-none" style={gridBg} />

      <div className="relative w-full max-w-[400px]">

        <div className="flex flex-col items-center mb-8">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" className="mb-3">
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#c9a227" strokeWidth="1.4"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="1.4" opacity="0.55"/>
          </svg>
          <h1 className="font-fraunces font-semibold text-[19px] tracking-tight">SMT<span className="text-gold-400">BROKER</span></h1>
          <p className="font-plex-mono text-[10px] text-slate tracking-[0.14em] uppercase mt-0.5">Plataforma IA de ventas inmobiliarias</p>
        </div>

        <div className="relative before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
          <div className="bg-navy-800 border border-white/10 p-8">
          {estado === 'invalido' && (
            <>
              <h2 className="font-fraunces text-[18px] font-medium text-paper mb-1">Enlace inválido o expirado</h2>
              <p className="text-[13px] text-slate mb-6">
                Este enlace ya no es válido (los enlaces expiran después de un tiempo o de un solo uso). Pide que te envíen uno nuevo.
              </p>
              <a href="/login" className="block text-center w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.03em] hover:bg-gold-400 transition-colors">
                Ir a iniciar sesión
              </a>
            </>
          )}

          {(estado === 'porConfirmar' || estado === 'confirmando') && (
            <>
              <h2 className="font-fraunces text-[18px] font-medium text-paper mb-1">Confirma tu enlace</h2>
              <p className="text-[13px] text-slate mb-6">
                Por seguridad, confirma manualmente para continuar (esto evita que un escáner de correo lo abra por ti).
              </p>
              <button
                onClick={handleConfirmar}
                disabled={estado === 'confirmando'}
                className="w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.03em] hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {estado === 'confirmando' ? 'Confirmando…' : 'Confirmar y continuar'}
              </button>
            </>
          )}

          {estado === 'listo' && (
            <>
              <h2 className="font-fraunces text-[18px] font-medium text-paper mb-1">Crea tu contraseña</h2>
              <p className="text-[13px] text-slate mb-6">Último paso para activar tu cuenta.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full px-4 py-3 border border-white/15 bg-navy-950/60 text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    className="w-full px-4 py-3 border border-white/15 bg-navy-950/60 text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-950/20 border border-red-900/60 px-4 py-3">
                    <p className="text-[12px] text-[#f3a3a3] leading-snug">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.03em] hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? 'Guardando…' : 'Activar cuenta'}
                </button>
              </form>
            </>
          )}
          </div>
        </div>

      </div>
    </div>
  )
}
