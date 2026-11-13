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
import { Marca } from '@/app/components/Marca'

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
      'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
    backgroundSize: '56px 56px',
  }

  if (estado === 'revisando') {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center relative">
        <div className="absolute inset-0 pointer-events-none" style={gridBg} />
        <p className="relative text-tenue text-[17px] font-sans">Revisando enlace…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 pointer-events-none" style={gridBg} />

      <div className="relative w-full max-w-[400px]">

        <div className="flex flex-col items-center mb-8">
          <h1><Marca texto={21} /></h1>
          <p className="font-sans text-[13px] text-tenue mt-1.5">Compra, vende o renta con certeza</p>
        </div>

        <div className="relative before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
          <div className="bg-tarjeta border border-linea p-8 rounded-xl">
          {estado === 'invalido' && (
            <>
              <h2 className="font-display text-[20px] font-medium text-tinta mb-1">Enlace inválido o expirado</h2>
              <p className="text-[16px] text-tenue mb-6">
                Este enlace ya no es válido (los enlaces expiran después de un tiempo o de un solo uso). Pide que te envíen uno nuevo.
              </p>
              <a href="/login" className="block text-center w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] hover:bg-gold-400 transition-colors rounded-lg">
                Ir a iniciar sesión
              </a>
            </>
          )}

          {(estado === 'porConfirmar' || estado === 'confirmando') && (
            <>
              <h2 className="font-display text-[20px] font-medium text-tinta mb-1">Confirma tu enlace</h2>
              <p className="text-[16px] text-tenue mb-6">
                Por seguridad, confirma manualmente para continuar (esto evita que un escáner de correo lo abra por ti).
              </p>
              <button
                onClick={handleConfirmar}
                disabled={estado === 'confirmando'}
                className="w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed rounded-lg"
              >
                {estado === 'confirmando' ? 'Confirmando…' : 'Confirmar y continuar'}
              </button>
            </>
          )}

          {estado === 'listo' && (
            <>
              <h2 className="font-display text-[20px] font-medium text-tinta mb-1">Crea tu contraseña</h2>
              <p className="text-[16px] text-tenue mb-6">Último paso para activar tu cuenta.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[13px] text-tenue">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full px-4 py-3 border border-linea bg-fondo/60 text-[17px] text-tinta placeholder-tenue-2 focus:outline-none focus:border-gold-500 transition-colors rounded-lg"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[13px] text-tenue">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    className="w-full px-4 py-3 border border-linea bg-fondo/60 text-[17px] text-tinta placeholder-tenue-2 focus:outline-none focus:border-gold-500 transition-colors rounded-lg"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-error-suave border border-error-linea px-4 py-3 rounded-lg">
                    <p className="text-[15px] text-error leading-snug">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1 rounded-lg"
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
