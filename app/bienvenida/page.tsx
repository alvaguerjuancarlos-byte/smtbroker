'use client'

// Puerta de entrada pública — rediseño navy/dorado (ver /login). Antes tenía una 4ª tarjeta
// explícita "Broker Maestro — Acceso privado": exponer un rol administrativo por su nombre en
// una página pública no tiene caso. Ahora ese acceso vive detrás del link discreto "Iniciar
// sesión" del header (mismo /login para cualquier rol, incluido el Broker Maestro) — un
// "paraguas" silencioso en vez de un letrero.
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Field, inputCls } from '../components/FormField'

type Rol = 'propietario' | 'inversionista' | 'broker' | null

const ROLES = [
  {
    id:     'propietario' as Rol,
    titulo: 'Soy propietario',
    sub:    'Quiero vender un activo',
    desc:   'Valuación, marketing y cierre gestionados por IA. Tú solo esperas al comprador calificado.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    accent: '#ddc06a',
    chip:   'border-gold-500/40 text-gold-400 bg-gold-500/10',
    beneficios: ['Reporte de valoración gratuito', 'Campaña de marketing automatizada', 'Solo pagas al cerrar'],
  },
  {
    id:     'inversionista' as Rol,
    titulo: 'Soy inversionista',
    sub:    'Busco oportunidades de compra',
    desc:   'Accede a activos calificados con due diligence completo antes de invertir un peso.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    accent: '#a5a1f5',
    chip:   'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10',
    beneficios: ['Activos pre-analizados y valuados', 'Due diligence legal incluido', 'Alertas de nuevas oportunidades'],
  },
  {
    id:     'broker' as Rol,
    titulo: 'Soy broker',
    sub:    'Quiero ser aliado SMTBROKER',
    desc:   'Potencia tu cartera con tecnología IA. Trae operaciones y nosotros ponemos la plataforma.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    accent: '#e8b568',
    chip:   'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10',
    beneficios: ['Plataforma IA sin costo inicial', 'Comisión compartida por cierre', 'Soporte del Broker Maestro'],
  },
]

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function BienvenidaPage() {
  const router  = useRouter()
  const [rol,       setRol]       = useState<Rol>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [enviado,   setEnviado]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const [form, setForm] = useState({
    nombre:    '',
    email:     '',
    telefono:  '',
    password:  '',
    empresa:   '',
    tipoActivo: '',
    municipio:  '',
    presupuesto: '',
    intereses:   '',
    experiencia: '',
    zona:        '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const rolActivo = ROLES.find(r => r.id === rol)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rol) return
    setError('')
    setLoading(true)

    const datos: Record<string, string> = {}
    if (rol === 'propietario')  { datos.tipoActivo = form.tipoActivo; datos.municipio = form.municipio }
    if (rol === 'inversionista') { datos.presupuesto = form.presupuesto; datos.intereses = form.intereses }
    if (rol === 'broker')       { datos.experiencia = form.experiencia; datos.zona = form.zona }

    const { error: err } = await supabase
      .from('solicitudes')
      .insert({
        nombre:   form.nombre,
        email:    form.email,
        telefono: form.telefono,
        rol,
        empresa:  form.empresa,
        datos,
        status:   'pendiente',
      })

    if (err) {
      setError('Error al enviar la solicitud. Intenta de nuevo.')
      setLoading(false)
      return
    }

    setEnviado(true)
    setLoading(false)
  }

  // ── Pantalla de éxito ───────────────────────────────────────────────────────
  if (enviado && rolActivo) {
    return (
      <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
        <div className="relative w-full max-w-[480px] text-center flex flex-col items-center gap-5">
          <div className="w-14 h-14 border flex items-center justify-center" style={{ borderColor: rolActivo.accent }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke={rolActivo.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="font-fraunces text-[26px] font-medium text-paper">¡Solicitud recibida!</h1>
            <p className="text-[14px] text-slate mt-2 leading-relaxed">
              Hemos recibido tu registro como <strong style={{ color: rolActivo.accent }}>{rolActivo.titulo.toLowerCase()}</strong>. El Broker Maestro revisará tu solicitud y te contactará en menos de 24 horas.
            </p>
          </div>
          <button onClick={() => router.push('/login')}
            className="font-plex-mono text-[12px] text-gold-400 hover:text-gold-100 transition-colors">
            Ir al inicio de sesión →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />

      <div className="relative">
        {/* Header público */}
        <header className="px-4 md:px-8 py-5 flex items-center gap-3">
          <svg width="26" height="26" viewBox="0 0 30 30" fill="none" className="shrink-0">
            <path d="M15 2 L27 10 L15 18 L3 10 Z" stroke="#c9a227" strokeWidth="1.4"/>
            <path d="M15 12 L27 20 L15 28 L3 20 Z" stroke="#f4f0e6" strokeWidth="1.4" opacity="0.55"/>
          </svg>
          <span className="font-fraunces font-semibold text-[16px] tracking-tight">SMT<span className="text-gold-400">BROKER</span></span>
          <div className="ml-auto">
            <button onClick={() => router.push('/login')}
              className="font-plex-mono text-[11.5px] text-slate hover:text-gold-400 border border-white/15 hover:border-gold-500 px-3.5 py-2 transition-colors">
              Iniciar sesión
            </button>
          </div>
        </header>

        <main className="px-4 md:px-8 py-8 md:py-14">
          <div className="w-full max-w-[880px] mx-auto flex flex-col gap-12 md:gap-16">

            {/* Hero */}
            <div className="max-w-[620px]">
              <span className="font-plex-mono text-[11px] tracking-[0.22em] uppercase text-gold-400">Plataforma IA de ventas inmobiliarias</span>
              <h1 className="font-fraunces font-medium text-[clamp(30px,4.4vw,46px)] leading-[1.1] tracking-[-0.01em] mt-4">
                Únete al ecosistema<br /><span className="italic font-normal text-gold-400">SMTBROKER.</span>
              </h1>
              <p className="text-[15px] text-paper-dim mt-5 max-w-[52ch] leading-relaxed">
                Conectamos propietarios, inversionistas y brokers con tecnología de agentes IA para cerrar operaciones más rápido y con mayor rentabilidad.
              </p>
            </div>

            {/* Selección de rol */}
            <div>
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.14em] mb-5">¿Cómo quieres participar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {ROLES.map(r => {
                  const sel = rol === r.id
                  return (
                    <button key={r.id} onClick={() => { setRol(r.id); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}
                      className={`p-5 border text-left transition-all bg-navy-800 ${sel ? 'border-gold-500' : 'border-white/10 hover:border-white/25'}`}>
                      <div className="w-11 h-11 border flex items-center justify-center mb-4" style={{ borderColor: r.accent, color: r.accent }}>
                        {r.icono}
                      </div>
                      <p className="text-[15px] font-medium text-paper mb-0.5">{r.titulo}</p>
                      <p className="text-[12px] text-slate mb-3">{r.sub}</p>
                      <p className="text-[12px] text-paper-dim leading-relaxed mb-4">{r.desc}</p>
                      <div className="flex flex-col gap-1.5 pt-3 border-t border-white/10">
                        {r.beneficios.map(b => (
                          <p key={b} className="text-[11px] text-slate">— {b}</p>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Formulario — aparece al seleccionar rol */}
            {rol && rolActivo && (
              <div ref={formRef} className="relative before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
              <form onSubmit={handleSubmit} className="bg-navy-800 border border-white/10 p-5 md:p-8 flex flex-col gap-5 md:gap-6">
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 border mb-3 ${rolActivo.chip}`}>
                    <span className="font-plex-mono text-[11px] font-medium">{rolActivo.titulo}</span>
                  </div>
                  <h2 className="font-fraunces text-[19px] md:text-[21px] font-medium text-paper">Completa tu registro</h2>
                  <p className="text-[13px] text-slate mt-1">El Broker Maestro revisará tu solicitud y te dará acceso.</p>
                </div>

                {/* Campos comunes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nombre completo" required tema="oscuro">
                    <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                      placeholder="Tu nombre" required className={inputCls(false, 'oscuro')} />
                  </Field>
                  <Field label="Teléfono" required tema="oscuro">
                    <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                      placeholder="+52 33 0000 0000" required className={inputCls(false, 'oscuro')} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Correo electrónico" required tema="oscuro">
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      placeholder="correo@ejemplo.com" required className={inputCls(false, 'oscuro')} />
                  </Field>
                  <Field label="Contraseña" required tema="oscuro">
                    <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                      placeholder="Mínimo 8 caracteres" required minLength={8} className={inputCls(false, 'oscuro')} />
                  </Field>
                </div>

                {/* Campos por rol */}
                {rol === 'propietario' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tipo de activo" tema="oscuro">
                      <select value={form.tipoActivo} onChange={e => set('tipoActivo', e.target.value)} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-navy-900">Selecciona…</option>
                        {['Terreno','Casa','Departamento','Local comercial','Edificio','Bodega','Otro'].map(t => <option key={t} className="bg-navy-900">{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Municipio del activo" tema="oscuro">
                      <input type="text" value={form.municipio} onChange={e => set('municipio', e.target.value)}
                        placeholder="Ej. Guadalajara" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                )}

                {rol === 'inversionista' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Presupuesto estimado" tema="oscuro">
                      <select value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-navy-900">Selecciona…</option>
                        {['Menos de $2M','$2M – $5M','$5M – $15M','$15M – $50M','Más de $50M'].map(p => <option key={p} className="bg-navy-900">{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Tipo de activos de interés" tema="oscuro">
                      <input type="text" value={form.intereses} onChange={e => set('intereses', e.target.value)}
                        placeholder="Ej. Terrenos, Edificios" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                )}

                {rol === 'broker' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Años de experiencia" tema="oscuro">
                      <select value={form.experiencia} onChange={e => set('experiencia', e.target.value)} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-navy-900">Selecciona…</option>
                        {['Menos de 1 año','1–3 años','3–5 años','5–10 años','Más de 10 años'].map(x => <option key={x} className="bg-navy-900">{x}</option>)}
                      </select>
                    </Field>
                    <Field label="Zona de operación" tema="oscuro">
                      <input type="text" value={form.zona} onChange={e => set('zona', e.target.value)}
                        placeholder="Ej. GDL, CDMX, MTY" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/60 px-4 py-3">
                    <p className="text-[12px] text-[#f3a3a3]">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.03em] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-gold-400">
                  {loading ? 'Enviando solicitud…' : 'Solicitar acceso →'}
                </button>

              </form>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
