'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Rol = 'propietario' | 'inversionista' | 'broker' | null

const ROL_MAESTRO = {
  titulo:   'Broker Maestro',
  sub:      'Acceso privado',
  desc:     'Rol reservado al director del ecosistema. Gestiona propietarios, inversionistas, brokers aliados y operaciones desde el panel de control.',
  beneficios: ['Panel de control completo', 'Gestión de todo el ecosistema', 'Acceso a métricas globales'],
}

const ROLES = [
  {
    id:       'propietario' as Rol,
    titulo:   'Soy propietario',
    sub:      'Quiero vender un activo',
    desc:     'Valuación, marketing y cierre gestionados por IA. Tú solo esperas al comprador calificado.',
    icono: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color:    'text-[#C9A84C]',
    bg:       'bg-[#FBF5E6]',
    border:   'border-[#C9A84C]',
    highlight:'bg-[#C9A84C]',
    beneficios: ['Reporte de valoración gratuito', 'Campaña de marketing automatizada', 'Solo pagas al cerrar'],
  },
  {
    id:       'inversionista' as Rol,
    titulo:   'Soy inversionista',
    sub:      'Busco oportunidades de compra',
    desc:     'Accede a activos calificados con due diligence completo antes de invertir un peso.',
    icono: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color:    'text-[#3730A3]',
    bg:       'bg-[#EEF2FF]',
    border:   'border-[#3730A3]',
    highlight:'bg-[#3730A3]',
    beneficios: ['Activos pre-analizados y valuados', 'Due diligence legal incluido', 'Alertas de nuevas oportunidades'],
  },
  {
    id:       'broker' as Rol,
    titulo:   'Soy broker',
    sub:      'Quiero ser aliado SMTBROKER',
    desc:     'Potencia tu cartera con tecnología IA. Trae operaciones y nosotros ponemos la plataforma.',
    icono: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color:    'text-[#D97706]',
    bg:       'bg-[#FEF3C7]',
    border:   'border-[#D97706]',
    highlight:'bg-[#D97706]',
    beneficios: ['Plataforma IA sin costo inicial', 'Comisión compartida por cierre', 'Soporte del Broker Maestro'],
  },
]

const inputCls = "w-full px-4 py-3 rounded-xl border border-[#DDE3EC] bg-[#F5F7FA] text-[14px] text-[#111827] placeholder-[#BFC9D8] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-all"

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
    // propietario
    tipoActivo: '',
    municipio:  '',
    // inversionista
    presupuesto: '',
    intereses:   '',
    // broker
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
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
        <div className="w-full max-w-[480px] text-center flex flex-col items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl ${rolActivo.bg} flex items-center justify-center`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke={rolActivo.highlight.replace('bg-[','').replace(']','')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[24px] font-black text-[#111827]">¡Solicitud recibida!</h1>
            <p className="text-[14px] text-[#8EA0BC] mt-2 leading-relaxed">
              Hemos recibido tu registro como <strong className={rolActivo.color}>{rolActivo.titulo.toLowerCase()}</strong>. El Broker Maestro revisará tu solicitud y te contactará en menos de 24 horas.
            </p>
          </div>
          <button onClick={() => router.push('/login')}
            className="text-[13px] font-semibold text-[#C9A84C] hover:text-[#0F1F3D] transition-colors">
            Ir al inicio de sesión →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">

      {/* Header público */}
      <header className="bg-white border-b border-[#DDE3EC] px-4 md:px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#C9A84C] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" stroke="white" strokeWidth="1.5" fill="none"/>
            <path d="M9 2V16M2 6L16 12M16 6L2 12" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
          </svg>
        </div>
        <span className="text-[15px] font-bold text-[#111827]">SMTBROKER</span>
        <div className="ml-auto">
          <button onClick={() => router.push('/login')}
            className="text-[13px] font-semibold text-[#8EA0BC] hover:text-[#111827] transition-colors">
            Ya tengo cuenta →
          </button>
        </div>
      </header>

      <main className="px-4 md:px-6 py-8 md:py-12">
        <div className="w-full max-w-[760px] mx-auto flex flex-col gap-8 md:gap-10">

          {/* Hero */}
          <div className="text-center">
            <span className="inline-block text-[11px] font-bold tracking-[0.14em] uppercase bg-[#FBF5E6] text-[#0F1F3D] px-3 py-1 rounded-full mb-4">
              Plataforma IA de ventas inmobiliarias
            </span>
            <h1 className="text-[26px] md:text-[32px] font-black text-[#111827] leading-tight">
              Únete al ecosistema<br />SMTBROKER
            </h1>
            <p className="text-[14px] md:text-[15px] text-[#8EA0BC] mt-3 max-w-[480px] mx-auto leading-relaxed">
              Conectamos propietarios, inversionistas y brokers con tecnología de agentes IA para cerrar operaciones más rápido y con mayor rentabilidad.
            </p>
          </div>

          {/* Selección de rol */}
          <div>
            <p className="text-[13px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em] text-center mb-5">¿Cómo quieres participar?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ROLES.map(r => (
                <button key={r.id} onClick={() => { setRol(r.id); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    rol === r.id
                      ? `${r.border} bg-white shadow-md`
                      : 'border-[#DDE3EC] bg-white hover:border-[#BFC9D8] hover:shadow-sm'
                  }`}>
                  <div className={`w-12 h-12 rounded-xl ${r.bg} flex items-center justify-center mb-4 ${r.color}`}>
                    {r.icono}
                  </div>
                  <p className="text-[15px] font-bold text-[#111827] mb-0.5">{r.titulo}</p>
                  <p className="text-[12px] text-[#8EA0BC] mb-4">{r.sub}</p>
                  <p className="text-[12px] text-[#4B5E7A] leading-relaxed mb-4">{r.desc}</p>
                  <div className="flex flex-col gap-1.5">
                    {r.beneficios.map(b => (
                      <div key={b} className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l2.5 2.5 5.5-5" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[11px] text-[#4B5E7A]">{b}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}

              {/* Tarjeta bloqueada — Broker Maestro */}
              <button onClick={() => router.push('/login')}
                className="p-5 rounded-2xl border-2 border-dashed border-[#BFC9D8] bg-white hover:border-[#111827] hover:shadow-sm text-left transition-all group relative overflow-hidden">
                <div className="absolute top-3 right-3">
                  <div className="w-6 h-6 rounded-md bg-[#111827] flex items-center justify-center">
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="white" strokeWidth="1.3" fill="none"/>
                      <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#111827] flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5Z" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
                  </svg>
                </div>
                <p className="text-[15px] font-bold text-[#111827] mb-0.5">{ROL_MAESTRO.titulo}</p>
                <p className="text-[12px] text-[#8EA0BC] mb-4">{ROL_MAESTRO.sub}</p>
                <p className="text-[12px] text-[#4B5E7A] leading-relaxed mb-4">{ROL_MAESTRO.desc}</p>
                <div className="flex flex-col gap-1.5">
                  {ROL_MAESTRO.beneficios.map(b => (
                    <div key={b} className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l2.5 2.5 5.5-5" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-[11px] text-[#4B5E7A]">{b}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-[#EDF1F7]">
                  <p className="text-[11px] font-bold text-[#111827] group-hover:text-[#C9A84C] transition-colors">
                    Iniciar sesión →
                  </p>
                </div>
              </button>

            </div>
          </div>

          {/* Formulario — aparece al seleccionar rol */}
          {rol && rolActivo && (
            <div ref={formRef}>
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#DDE3EC] p-5 md:p-8 flex flex-col gap-5 md:gap-6">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${rolActivo.bg} mb-3`}>
                  <span className={`text-[11px] font-bold ${rolActivo.color}`}>{rolActivo.titulo}</span>
                </div>
                <h2 className="text-[18px] md:text-[20px] font-black text-[#111827]">Completa tu registro</h2>
                <p className="text-[13px] text-[#8EA0BC] mt-1">El Broker Maestro revisará tu solicitud y te dará acceso.</p>
              </div>

              {/* Campos comunes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Nombre completo *</label>
                  <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                    placeholder="Tu nombre" required className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Teléfono *</label>
                  <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                    placeholder="+52 33 0000 0000" required className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Correo electrónico *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="correo@ejemplo.com" required className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Contraseña *</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder="Mínimo 8 caracteres" required minLength={8} className={inputCls} />
                </div>
              </div>

              {/* Campos por rol */}
              {rol === 'propietario' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Tipo de activo</label>
                    <select value={form.tipoActivo} onChange={e => set('tipoActivo', e.target.value)} className={inputCls}>
                      <option value="">Selecciona…</option>
                      {['Terreno','Casa','Departamento','Local comercial','Edificio','Bodega','Otro'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Municipio del activo</label>
                    <input type="text" value={form.municipio} onChange={e => set('municipio', e.target.value)}
                      placeholder="Ej. Guadalajara" className={inputCls} />
                  </div>
                </div>
              )}

              {rol === 'inversionista' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Presupuesto estimado</label>
                    <select value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} className={inputCls}>
                      <option value="">Selecciona…</option>
                      {['Menos de $2M','$2M – $5M','$5M – $15M','$15M – $50M','Más de $50M'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Tipo de activos de interés</label>
                    <input type="text" value={form.intereses} onChange={e => set('intereses', e.target.value)}
                      placeholder="Ej. Terrenos, Edificios" className={inputCls} />
                  </div>
                </div>
              )}

              {rol === 'broker' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Años de experiencia</label>
                    <select value={form.experiencia} onChange={e => set('experiencia', e.target.value)} className={inputCls}>
                      <option value="">Selecciona…</option>
                      {['Menos de 1 año','1–3 años','3–5 años','5–10 años','Más de 10 años'].map(x => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Zona de operación</label>
                    <input type="text" value={form.zona} onChange={e => set('zona', e.target.value)}
                      placeholder="Ej. GDL, CDMX, MTY" className={inputCls} />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
                  <p className="text-[12px] text-[#991B1B]">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className={`w-full py-3.5 rounded-xl text-white text-[14px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${rolActivo.highlight} hover:opacity-90`}>
                {loading ? 'Enviando solicitud…' : 'Solicitar acceso →'}
              </button>

            </form>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
