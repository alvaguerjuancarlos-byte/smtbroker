'use client'

// Puerta de entrada pública — rediseño navy/dorado (ver /login). Antes tenía una 4ª tarjeta
// explícita "Broker Maestro — Acceso privado": exponer un rol administrativo por su nombre en
// una página pública no tiene caso. Ahora ese acceso vive detrás del link discreto "Iniciar
// sesión" del header (mismo /login para cualquier rol, incluido el Broker Maestro) — un
// "paraguas" silencioso en vez de un letrero.
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Field, inputCls } from '../components/FormField'
import { AvisoSimplificado } from '../components/AvisoSimplificado'
import { Marca } from '@/app/components/Marca'

type Rol = 'propietario' | 'inversionista' | 'broker' | null

const ROLES = [
  {
    id:     'propietario' as Rol,
    titulo: 'Soy propietario',
    sub:    'Quiero vender un activo',
    desc:   'Diagnóstico de mercado con IA, certificación legal y un asesor verificado de tu zona que te representa.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    accent: 'var(--c-acento)',
    chip:   'border-gold-500/40 text-acento bg-gold-500/10',
    // Sin menciones a pagos ni promesas que hoy son visión (hallazgo del recorrido guiado, 2026-10-07).
    beneficios: ['Precio de salida con comparables reales', 'Certificación legal de tu propiedad', 'Eliges a un asesor verificado'],
  },
  {
    id:     'inversionista' as Rol,
    titulo: 'Quiero comprar',
    sub:    'Busco una propiedad',
    desc:   'Describe una vez lo que buscas y recibe las propiedades que coinciden, con su diagnóstico de mercado.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    accent: 'var(--c-violeta)',
    chip:   'border-[#4F46E5]/40 text-violeta bg-[#4F46E5]/10',
    beneficios: ['Coincidencias con puntaje y razones', 'Propiedades con diagnóstico de mercado', 'Inventario con certificación legal'],
  },
  {
    id:     'broker' as Rol,
    titulo: 'Soy asesor inmobiliario',
    sub:    'Quiero ser aliado SMT Match',
    desc:   'Certifica tu portafolio con diagnóstico IA y registra lo que buscan tus clientes. Tú eres la pieza clave del ecosistema.',
    icono: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    accent: 'var(--c-aviso)',
    chip:   'border-[#D97706]/40 text-aviso bg-[#D97706]/10',
    beneficios: ['Oportunidades de propietarios de tu zona', 'Tus clientes siguen siendo tuyos', 'Niveles Plata, Oro y Platino'],
  },
]

// Las mismas cuatro puertas que el paso 1 de /empezar (app/empezar/Recorrido.tsx).
const PUERTAS = [
  { id: 'comprar', titulo: 'Comprar', texto: 'Dinos qué buscas y ves opciones que coinciden.' },
  { id: 'rentar', titulo: 'Rentar', texto: 'Con la renta que puedes pagar al mes.' },
  { id: 'vender', titulo: 'Vender', texto: 'Precio realista y personas que buscan algo como lo tuyo.' },
  { id: 'poner_renta', titulo: 'Poner en renta', texto: 'Renta realista y quién busca rentar en tu zona.' },
]

const PASOS = [
  { titulo: 'Dinos qué buscas', texto: 'Tipo de propiedad, hasta tres zonas y tu presupuesto. Toma un par de minutos, y puedes hacerlo platicando.' },
  { titulo: 'Compara con certeza', texto: 'En tu tablero ves lo que encontramos, lo que te proponen asesores verificados y lo que hay en los portales, con su precio contra el mercado.' },
  { titulo: 'Conecta directo', texto: 'Cuando una te gusta, te conectamos con quien la ofrece: los dos reciben nombre, teléfono y WhatsApp. La visita y la negociación las acuerdan ustedes.' },
]

const CAMINOS = [
  { titulo: 'Por mi cuenta', texto: 'La plataforma busca, revisa y te conecta. Si quieres, los asesores te proponen opciones sin conocer tus datos.' },
  { titulo: 'Con un asesor', texto: 'Eliges un asesor verificado de tu zona. Recibe tu búsqueda completa, suma sus opciones y te acompaña hasta el cierre.' },
]

const DUENO = [
  { titulo: 'Tu precio contra el mercado', texto: 'El precio (o la renta) realista de tu zona, calculado con comparables reales, y qué tan lejos está el tuyo.' },
  { titulo: 'Cuántas personas buscan algo como lo tuyo', texto: 'Las búsquedas que tu propiedad cumple hoy en tu zona y con tu precio. Sin datos de nadie: tú decides con quién conectar.' },
  { titulo: 'Quién se interesa', texto: 'Quienes quieren conectar contigo y quienes dejan sus datos en tu página.' },
]

const GRID_BG = {
  backgroundImage:
    'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function BienvenidaPage() {
  const router  = useRouter()
  const [rol,       setRol]       = useState<Rol>(null)
  const formRef = useRef<HTMLDivElement>(null)
  // Entrada discreta del asesor (§24.5): abre su formulario de registro.
  const elegirAsesor = () => { setRol('broker'); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }
  // /bienvenida?broker=1 (el enlace "¿Eres asesor inmobiliario?" de /empezar) llega directo a ese formulario.
  // /bienvenida?mundo=demo (guion v12): "Iniciar sesión" lleva a la entrada simple sin contraseña y las
  // puertas siguen en el mundo demo.
  const esDemo = () => new URLSearchParams(window.location.search).get('mundo') === 'demo'
  const entrar = () => router.push(esDemo() ? '/entrar?mundo=demo' : '/login')
  const conMundo = (ruta: string) => (esDemo() ? `${ruta}${ruta.includes('?') ? '&' : '?'}mundo=demo` : ruta)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('broker') !== '1') return
    const t = setTimeout(elegirAsesor, 0)
    return () => clearTimeout(t)
  }, [])
  const [enviado,   setEnviado]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [sitioWeb,  setSitioWeb]  = useState('') // campo trampa para bots (oculto)

  const [form, setForm] = useState({
    nombre:    '',
    email:     '',
    telefono:  '',
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

    // Por el servidor (app/api/solicitudes) para que Operación reciba el aviso de la solicitud.
    const r = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre, email: form.email, telefono: form.telefono, rol, empresa: form.empresa, datos,
        sitio_web: sitioWeb,
      }),
    }).then(res => res.json()).catch(() => ({ error: 'Error al enviar la solicitud. Intenta de nuevo.' }))

    if (r.error) {
      setError(r.error)
      setLoading(false)
      return
    }

    setEnviado(true)
    setLoading(false)
  }

  // ── Pantalla de éxito ───────────────────────────────────────────────────────
  if (enviado && rolActivo) {
    return (
      <div className="min-h-screen bg-fondo text-tinta font-sans flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
        <div className="relative w-full max-w-[480px] text-center flex flex-col items-center gap-5">
          <div className="w-14 h-14 border flex items-center justify-center" style={{ borderColor: rolActivo.accent }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke={rolActivo.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-[30px] font-medium text-tinta">¡Solicitud recibida!</h1>
            <p className="text-[17px] text-tenue mt-2 leading-relaxed">
              Hemos recibido tu registro como <strong style={{ color: rolActivo.accent }}>{rolActivo.titulo.toLowerCase()}</strong>. Nuestro equipo la revisará y, al aprobarla, te llegará un correo de invitación para crear tu contraseña y entrar. Revisa también la carpeta de spam.
            </p>
          </div>
          <button onClick={() => router.push('/login')}
            className="font-sans text-[15px] text-acento hover:text-acento-2 transition-colors">
            ¿Ya tienes cuenta? Inicia sesión →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />

      <div className="relative">
        {/* Header público */}
        <header className="px-4 md:px-8 py-5 flex items-center gap-3">
          <Marca texto={20} slogan />
          <div className="ml-auto flex items-center gap-3 md:gap-5">
            <button onClick={elegirAsesor} className="hidden sm:inline font-sans text-[14px] text-tenue hover:text-acento">¿Eres asesor inmobiliario?</button>
            <button onClick={entrar} data-iniciar-sesion
              className="font-sans text-[14px] text-tenue hover:text-acento border border-linea hover:border-gold-500 px-3.5 py-2 transition-colors rounded-lg">
              Iniciar sesión
            </button>
          </div>
        </header>

        <main className="px-4 md:px-8 py-8 md:py-14">
          <div className="w-full max-w-[880px] mx-auto flex flex-col gap-12 md:gap-16">

            {/* Hero (V10 §27 "Página pública"): la historia desde el cliente, con la frase larga de la marca (§26). */}
            <div className="max-w-[660px]">
              <h1 className="font-display font-medium text-[clamp(32px,5vw,52px)] leading-[1.08] tracking-[-0.01em]">
                Compra, vende o renta<br />con <span className="marca-ai">certeza</span>.
              </h1>
              <p className="text-[18px] text-tinta-2 mt-5 max-w-[54ch] leading-relaxed">
                Dinos qué buscas o qué ofreces. Te mostramos las opciones que sí cumplen, con su precio real contra el mercado y los papeles revisados, y te conectamos directo con la otra parte.
              </p>
            </div>

            {/* V10 §24.1 y §24.5 (JC, 18-nov-2026): la misma pregunta que la entrada, con las cuatro
                operaciones al mismo nivel (antes "Soy propietario / Quiero comprar" escondía rentar y
                poner en renta). Cada una lleva al paso 2 de /empezar con la operación ya puesta. El
                asesor ya no es una tarjeta más: una sola entrada discreta abajo. */}
            <div>
              <p className="font-sans text-[14px] text-tenue mb-5">¿Qué quieres hacer?</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-puertas>
                {PUERTAS.map((o) => (
                  <button key={o.id} onClick={() => router.push(conMundo(`/empezar?quiere=${o.id}`))} data-puerta={o.id}
                    className="p-5 border border-linea hover:border-linea-fuerte text-left transition-all bg-tarjeta rounded-xl flex flex-col gap-1.5">
                    <span className="text-[19px] font-medium text-tinta">{o.titulo}</span>
                    <span className="text-[15px] text-tinta-2 leading-snug">{o.texto}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Formulario — aparece al seleccionar rol */}
            {rol && rolActivo && (
              <div ref={formRef} className="relative before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2.5 before:translate-y-2.5 before:-z-10">
              <form onSubmit={handleSubmit} className="bg-tarjeta border border-linea p-5 md:p-8 flex flex-col gap-5 md:gap-6 rounded-xl">
                <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={sitioWeb} onChange={e => setSitioWeb(e.target.value)} />
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 border mb-3 ${rolActivo.chip} rounded-lg`}>
                    <span className="font-sans text-[14px] font-medium">{rolActivo.titulo}</span>
                  </div>
                  <h2 className="font-display text-[21px] md:text-[23px] font-medium text-tinta">Completa tu registro</h2>
                  <p className="text-[16px] text-tenue mt-1">Nuestro equipo revisará tu solicitud y te enviará una invitación por correo para crear tu contraseña.</p>
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
                  {/* Sin contraseña aquí (2026-10-07): la solicitud no crea la cuenta; la contraseña se crea
                      al aceptar la invitación que llega cuando Operación aprueba. Antes se pedía y nunca se
                      usaba, y confundía. */}
                </div>

                {/* Campos por rol */}
                {rol === 'propietario' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tipo de activo" tema="oscuro">
                      <select value={form.tipoActivo} onChange={e => set('tipoActivo', e.target.value)} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-superficie">Selecciona…</option>
                        {['Terreno','Casa','Departamento','Local comercial','Edificio','Bodega','Otro'].map(t => <option key={t} className="bg-superficie">{t}</option>)}
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
                        <option value="" className="bg-superficie">Selecciona…</option>
                        {['Menos de $2M','$2M – $5M','$5M – $15M','$15M – $50M','Más de $50M'].map(p => <option key={p} className="bg-superficie">{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Tipo de propiedad que buscas" tema="oscuro">
                      <input type="text" value={form.intereses} onChange={e => set('intereses', e.target.value)}
                        placeholder="Ej. Casa, departamento, terreno" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                )}

                {rol === 'broker' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Años de experiencia" tema="oscuro">
                      <select value={form.experiencia} onChange={e => set('experiencia', e.target.value)} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-superficie">Selecciona…</option>
                        {['Menos de 1 año','1–3 años','3–5 años','5–10 años','Más de 10 años'].map(x => <option key={x} className="bg-superficie">{x}</option>)}
                      </select>
                    </Field>
                    <Field label="Zona de operación" tema="oscuro">
                      <input type="text" value={form.zona} onChange={e => set('zona', e.target.value)}
                        placeholder="Ej. GDL, CDMX, MTY" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                )}

                <AvisoSimplificado contexto="directo" tema="oscuro" />

                {error && (
                  <div className="flex items-center gap-2 bg-error-suave border border-error-linea px-4 py-3 rounded-lg">
                    <p className="text-[15px] text-error">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-gold-500 text-navy-950 font-sans text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-gold-400 rounded-lg">
                  {loading ? 'Enviando solicitud…' : 'Solicitar acceso →'}
                </button>

              </form>
              </div>
            )}

            {/* Cómo funciona (§24.1–24.3), contado desde quien busca */}
            <section className="flex flex-col gap-5" data-como-funciona>
              <h2 className="font-display text-[26px] md:text-[30px] font-medium leading-tight">Cómo funciona</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PASOS.map((x, k) => (
                  <div key={x.titulo} className="p-5 border border-linea bg-tarjeta rounded-xl flex flex-col gap-2">
                    <span className="font-display text-[15px] text-acento">{k + 1}</span>
                    <span className="text-[18px] font-medium text-tinta">{x.titulo}</span>
                    <span className="text-[16px] text-tinta-2 leading-relaxed">{x.texto}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Los dos caminos (§24.1): mismo tamaño, mismo color, ninguno "recomendado". */}
            <section className="flex flex-col gap-5" data-caminos>
              <div>
                <h2 className="font-display text-[26px] md:text-[30px] font-medium leading-tight">Por tu cuenta o con un asesor</h2>
                <p className="text-[17px] text-tinta-2 mt-2">Tú decides, y puedes cambiar cuando quieras.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAMINOS.map((c) => (
                  <div key={c.titulo} className="p-5 border border-linea bg-tarjeta rounded-xl flex flex-col gap-2">
                    <span className="text-[19px] font-medium text-tinta">{c.titulo}</span>
                    <span className="text-[16px] text-tinta-2 leading-relaxed">{c.texto}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Quien vende o pone en renta (§24.2, tablero del dueño) */}
            <section className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-6 md:gap-10 items-start" data-duenos>
              <div>
                <h2 className="font-display text-[26px] md:text-[30px] font-medium leading-tight">¿Vendes o rentas tu propiedad?</h2>
                <p className="text-[17px] text-tinta-2 mt-2 leading-relaxed">Regístrala y en tu tablero ves lo que pasa con ella.</p>
                <button onClick={() => router.push(conMundo('/empezar?quiere=vender'))}
                  className="mt-5 font-sans text-[16px] font-medium px-4 py-3 bg-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg">Registrar mi propiedad</button>
              </div>
              <ul className="flex flex-col gap-3">
                {DUENO.map((d) => (
                  <li key={d.titulo} className="p-4 border border-linea bg-tarjeta rounded-xl">
                    <span className="text-[17px] font-medium text-tinta">{d.titulo}</span>
                    <p className="text-[16px] text-tinta-2 mt-1 leading-relaxed">{d.texto}</p>
                  </li>
                ))}
              </ul>
            </section>

          </div>
        </main>

        {/* Pie: la otra entrada discreta del asesor (§24.5) */}
        <footer className="px-4 md:px-8 py-8 border-t border-linea">
          <div className="w-full max-w-[880px] mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-[15px] text-tenue">
            <span>SMT Match, by MindBridge</span>
            <span className="sm:ml-auto">
              ¿Eres asesor inmobiliario?{' '}
              <button onClick={elegirAsesor} className="text-acento underline underline-offset-2" data-entrada-asesor>Únete a SMT Match</button>
            </span>
            <a href="/aviso-privacidad" className="hover:text-acento">Aviso de privacidad</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
