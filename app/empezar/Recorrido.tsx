'use client'

// Recorrido guiado del cliente (Documento Maestro V7.2; maqueta aprobada por JC el 1-nov-2026):
//   1. ¿Qué quieres hacer?        vender | comprar
//   2. Tus datos                  cuenta (correo y contraseña), WhatsApp y la propiedad o la búsqueda
//   3. ¿Cómo quieres avanzar?     con un broker verificado (muy recomendable) o por su cuenta
// El registro es inmediato (app/api/registro-cliente). Al terminar llega a su panel (/inicio), donde
// Smart Bróker le entrega lo que preparó: el precio realista y la invitación a certificar (quien
// vende) o afinar su búsqueda (quien compra). JC, 1-nov: el precio inmediato en el recorrido "se
// sentía raro"; la certificación pasó de paso a invitación en el panel.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Field, inputCls } from '../components/FormField'

type Quiere = 'vender' | 'comprar'
type Paso = 'que' | 'datos' | 'camino'

const PRESUPUESTOS = ['Menos de $2M', '$2M – $5M', '$5M – $15M', '$15M – $50M', 'Más de $50M']
const TIPOS = ['Casa', 'Departamento', 'Terreno', 'Local comercial', 'Oficina', 'Bodega']
const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const cls = inputCls(false, 'oscuro')

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function Recorrido({ inicial }: { inicial: Quiere | null }) {
  const router = useRouter()
  const [quiere, setQuiere] = useState<Quiere | null>(inicial)
  const [paso, setPaso] = useState<Paso>(inicial ? 'datos' : 'que')
  const [f, setF] = useState({
    nombre: '', email: '', password: '', telefono: '',
    tipo: 'Casa', superficie: '', municipio: '', colonia: '', precio: '',
    busca: '', zona: '', presupuesto: PRESUPUESTOS[2],
  })
  const [trampa, setTrampa] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaExiste, setYaExiste] = useState(false)

  // Quien ya tiene sesión no se registra de nuevo.
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && paso === 'que') router.replace('/dashboard')
    }
    init()
  }, [router, paso])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const totalPasos = 3
  const numPaso = { que: 1, datos: 2, camino: 3 }[paso]
  const acento = quiere === 'comprar' ? 'bg-[#7fd1b9]' : 'bg-gold-500'

  const elegir = (q: Quiere) => { setQuiere(q); setPaso('datos'); setError(null) }

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quiere) return
    setEnviando(true); setError(null); setYaExiste(false)
    const r = await fetch('/api/registro-cliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quiere, nombre: f.nombre, email: f.email, password: f.password, telefono: f.telefono, sitio_web: trampa,
        propiedad: { tipo: f.tipo, superficie: f.superficie, municipio: f.municipio, colonia: f.colonia, precio: f.precio },
        busqueda: { busca: f.busca, zona: f.zona, presupuesto: f.presupuesto },
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setEnviando(false); setError(j.error ?? 'No se pudo crear tu cuenta'); setYaExiste(!!j.yaExiste); return }
    const { data: s, error: eLogin } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password })
    setEnviando(false)
    if (eLogin || !s.session) { setError('Tu cuenta quedó creada. Inicia sesión para continuar.'); setYaExiste(true); return }

    setPaso('camino')
  }

  const terminar = (conBroker: boolean) => router.push(conBroker ? '/inicio?camino=broker' : '/inicio')

  const boton = 'font-plex-mono text-[13px] font-medium px-4 py-3.5 text-center transition-colors disabled:opacity-60'

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative w-full max-w-[460px] mx-auto px-5 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          {paso === 'datos' && !inicial ? (
            <button onClick={() => setPaso('que')} className="font-plex-mono text-[12px] text-gold-400 py-3">← Atrás</button>
          ) : (
            <a href="/bienvenida" className="font-plex-mono text-[12px] text-gold-400 py-3">SMTBROKER</a>
          )}
          <a href="/login" className="font-plex-mono text-[12px] text-gold-400 py-3">Iniciar sesión</a>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {Array.from({ length: totalPasos }, (_, i) => (
              <div key={i} className={`flex-1 h-1 ${i < numPaso ? acento : 'bg-[#24314a]'}`} />
            ))}
          </div>
          <span className="font-plex-mono text-[11px] text-slate tracking-[0.08em]">
            PASO {numPaso} DE {totalPasos}{quiere ? ` · ${quiere === 'vender' ? 'VENDER' : 'COMPRAR'}` : ''}
          </span>
        </div>

        {paso === 'que' && (
          <>
            <div className="flex flex-col gap-2.5">
              <h1 className="font-display text-[32px] font-medium leading-tight">¿Qué quieres hacer?</h1>
              <p className="text-[15px] text-paper-dim">Vende o compra con certeza. Te acompañamos paso a paso.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => elegir('vender')} className="text-left bg-navy-800 border border-gold-500 p-5 flex gap-4 hover:bg-navy-800/80">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-gold-400 shrink-0" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[20px] font-medium">Quiero vender</span>
                  <span className="text-[13.5px] text-paper-dim">Precio realista de mercado, certificación y compradores reales.</span>
                </span>
              </button>
              <button onClick={() => elegir('comprar')} className="text-left bg-navy-800 border border-white/15 p-5 flex gap-4 hover:border-[#7fd1b9]/60">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7fd1b9" strokeWidth="1.6" className="shrink-0" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[20px] font-medium">Quiero comprar</span>
                  <span className="text-[13.5px] text-paper-dim">Dinos qué buscas una sola vez y te llegan opciones que coinciden.</span>
                </span>
              </button>
            </div>
            <p className="text-[13px] text-slate text-center">¿Eres broker? <a href="/bienvenida?broker=1" className="text-gold-400 underline underline-offset-2">Regístrate aquí</a></p>
          </>
        )}

        {paso === 'datos' && quiere && (
          <form onSubmit={registrar} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[28px] font-medium leading-tight">{quiere === 'vender' ? 'Cuéntanos de tu propiedad' : '¿Qué estás buscando?'}</h1>
              <p className="text-[14px] text-paper-dim">{quiere === 'vender' ? 'Con esto, Smart Bróker empieza a analizar tu propiedad.' : 'Dínoslo una sola vez y te avisamos de lo que coincida.'}</p>
            </div>
            <div className="flex flex-col gap-3.5">
              <Field label="Nombre" required tema="oscuro"><input value={f.nombre} onChange={set('nombre')} required autoComplete="name" className={cls} /></Field>
              <Field label="WhatsApp" required tema="oscuro"><input value={f.telefono} onChange={set('telefono')} required inputMode="tel" autoComplete="tel" placeholder="81 1234 5678" className={cls} /></Field>
              {quiere === 'vender' ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Tipo" required tema="oscuro">
                      <select value={f.tipo} onChange={set('tipo')} className={cls}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
                    </Field>
                    <Field label="Superficie m²" tema="oscuro"><input value={f.superficie} onChange={set('superficie')} inputMode="numeric" className={cls} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Colonia" tema="oscuro"><input value={f.colonia} onChange={set('colonia')} className={cls} /></Field>
                    <Field label="Municipio" required tema="oscuro"><input value={f.municipio} onChange={set('municipio')} required placeholder="San Pedro Garza García" className={cls} /></Field>
                  </div>
                  <Field label="Precio que buscas (MXN)" required tema="oscuro"><input value={f.precio} onChange={set('precio')} required inputMode="numeric" placeholder="19,500,000" className={cls} /></Field>
                </>
              ) : (
                <>
                  <Field label="Qué buscas" required tema="oscuro"><input value={f.busca} onChange={set('busca')} required placeholder="Departamento, 3 recámaras" className={cls} /></Field>
                  <Field label="Zona" required tema="oscuro"><input value={f.zona} onChange={set('zona')} required placeholder="San Pedro Garza García" className={cls} /></Field>
                  <Field label="Presupuesto" required tema="oscuro">
                    <select value={f.presupuesto} onChange={set('presupuesto')} className={cls}>{PRESUPUESTOS.map((p) => <option key={p}>{p}</option>)}</select>
                  </Field>
                </>
              )}
              <Field label="Correo" required tema="oscuro"><input type="email" value={f.email} onChange={set('email')} required autoComplete="email" className={cls} /></Field>
              <Field label="Crea una contraseña" required tema="oscuro"><input type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className={cls} /></Field>
              <input value={trampa} onChange={(e) => setTrampa(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="sitio_web" />
            </div>
            <p className="text-[12px] text-slate">Usamos tu WhatsApp solo para avisarte {quiere === 'vender' ? 'de interesados y del avance' : 'de opciones que coinciden'}. <a href="/aviso-privacidad" target="_blank" className="text-gold-400 underline underline-offset-2">Aviso de privacidad</a></p>
            {error && (
              <p className="text-[13px] text-[#f3a3a3]">{error}{yaExiste && <> · <a href="/login" className="text-gold-400 underline underline-offset-2">Iniciar sesión</a></>}</p>
            )}
            <button disabled={enviando} className={`${boton} ${quiere === 'vender' ? 'bg-gold-500 hover:bg-gold-400' : 'bg-[#7fd1b9] hover:bg-[#9ddcc9]'} text-navy-950`}>
              {enviando ? 'Creando tu cuenta…' : 'Continuar →'}
            </button>
          </form>
        )}

        {paso === 'camino' && quiere && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[28px] font-medium leading-tight">{quiere === 'vender' ? '¿Cómo quieres vender?' : '¿Cómo quieres buscar?'}</h1>
              <p className="text-[14px] text-paper-dim">Puedes cambiar de opinión cuando quieras.</p>
            </div>
            <div className={`bg-navy-800 border ${quiere === 'vender' ? 'border-gold-500' : 'border-[#7fd1b9]'} p-5 flex flex-col gap-2.5`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-display text-[19px] font-medium">Con un broker verificado</span>
                <span className={`font-plex-mono text-[10px] text-navy-950 px-2 py-1 tracking-[0.06em] ${quiere === 'vender' ? 'bg-gold-500' : 'bg-[#7fd1b9]'}`}>MUY RECOMENDABLE</span>
              </div>
              <p className="text-[13.5px] text-paper-dim">
                {quiere === 'vender'
                  ? 'Tu broker presenta tu propiedad a los compradores de toda la red, filtra a los interesados, negocia y te acompaña hasta el cierre.'
                  : 'Accedes a toda la red: las propiedades de particulares y de todos los brokers de la plataforma. Tu broker te acompaña en visitas, negociación y cierre.'}
              </p>
              <p className="text-[12.5px] text-slate">Te sugerimos brokers verificados de tu zona, con su desempeño a la vista.</p>
              <button onClick={() => terminar(true)} className={`${boton} mt-1 text-navy-950 ${quiere === 'vender' ? 'bg-gold-500 hover:bg-gold-400' : 'bg-[#7fd1b9] hover:bg-[#9ddcc9]'}`}>Ver brokers de mi zona</button>
            </div>
            <div className="bg-navy-800 border border-white/15 p-5 flex flex-col gap-2.5">
              <span className="font-display text-[19px] font-medium">Por mi cuenta</span>
              <p className="text-[13.5px] text-paper-dim">
                {quiere === 'vender'
                  ? 'Tu propiedad aparece en el Radar de los compradores directos y la ven todos los brokers de la plataforma. Tú atiendes a los interesados.'
                  : 'Buscas en el Radar de mercado: propiedades de particulares y anuncios de otros portales. ¿Viste algo en otro lado? Pega la liga y le pedimos al anunciante que la certifique.'}
              </p>
              {quiere === 'comprar' && <p className="text-[12.5px] text-slate">Las propiedades que traen los brokers solo se ven con broker.</p>}
              <button onClick={() => terminar(false)} className={`${boton} mt-1 border border-white/15 text-paper hover:border-white/30`}>{quiere === 'vender' ? 'Continuar por mi cuenta' : 'Buscar por mi cuenta'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
