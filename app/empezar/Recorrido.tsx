'use client'

// Recorrido guiado del cliente (Documento Maestro V7.2; maqueta aprobada por JC el 1-nov-2026):
//   1. ¿Qué quieres hacer?        vender | comprar
//   2. Tus datos                  cuenta (correo y contraseña), WhatsApp y la propiedad o la búsqueda
//   3. (V10 §24.1: el "cómo" pasó a ser el paso 2, antes de la ficha; ver abajo)
// El registro es inmediato (app/api/registro-cliente). Al terminar llega a su panel (/inicio), donde
// Smart Bróker le entrega lo que preparó: el precio realista y la invitación a certificar (quien
// vende) o afinar su búsqueda (quien compra). JC, 1-nov: el precio inmediato en el recorrido "se
// sentía raro"; la certificación pasó de paso a invitación en el panel.
//
// V8 (Documento Maestro §19, JC 10-nov-2026): quien compra ya no llena "tus datos" ni elige camino
// aquí: captura su ficha de necesidad en FichaNecesidad.tsx (tipo, características, ubicación,
// presupuesto), ve los primeros resultados y al final crea su cuenta. Quien vende sigue igual.
//
// V9 (§22): las dos puertas cubren rentas. "Quiero comprar o rentar" abre la ficha, cuyo primer paso
// es elegir la operación. "Quiero vender o rentar mi propiedad" pide en venta, en renta o las dos, con
// precio y/o renta mensual.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Field, inputCls } from '../components/FormField'
import FichaNecesidad from './FichaNecesidad'
import ChatEntrada from './ChatEntrada'
import { REGLAS_VENDER, AMENIDADES_PROPIEDAD, cuantos, type FichaPropiedad } from '@/lib/chatPropiedad'
import { BandaPaso, Avance, MarcaBarra } from '../components/Banda'

// V10 §24.1 (16-nov-2026): la entrada pregunta primero QUÉ (comprar, rentar, vender, poner en renta)
// y luego CÓMO (por mi cuenta / con un asesor), con dos tarjetas del mismo peso: ninguna es "la
// recomendada". El cómo se elige ANTES de la ficha; al terminar, quien eligió asesor va directo a
// elegir uno de su zona (/inicio?camino=broker) y quien va por su cuenta, a su panel. Se retiró la
// pantalla "¿Cómo quieres avanzar?" que aparecía después de crear la cuenta con "muy recomendable".
// Internamente `quiere` sigue siendo el lado (comprar = busca, vender = ofrece) que espera
// app/api/registro-cliente; la operación (compra/renta, venta/renta) llega ya puesta a la ficha.
export type Opcion = 'comprar' | 'rentar' | 'vender' | 'poner_renta'
type Quiere = 'vender' | 'comprar'
type Paso = 'que' | 'como' | 'datos'
type Camino = 'cuenta' | 'asesor'

const OPCIONES: { id: Opcion; titulo: string; texto: string }[] = [
  { id: 'comprar', titulo: 'Comprar', texto: 'Dinos qué buscas y ves opciones que coinciden.' },
  { id: 'rentar', titulo: 'Rentar', texto: 'Con la renta que puedes pagar al mes.' },
  { id: 'vender', titulo: 'Vender', texto: 'Precio realista de mercado y personas que buscan algo como lo tuyo.' },
  { id: 'poner_renta', titulo: 'Poner en renta', texto: 'Renta realista y personas que buscan rentar en tu zona.' },
]
const ladoDe = (o: Opcion): Quiere => (o === 'comprar' || o === 'rentar' ? 'comprar' : 'vender')
const ETIQUETA: Record<Opcion, string> = { comprar: 'Comprar', rentar: 'Rentar', vender: 'Vender', poner_renta: 'Poner en renta' }

const PRESUPUESTOS = ['Menos de $2M', '$2M – $5M', '$5M – $15M', '$15M – $50M', 'Más de $50M']
const TIPOS = ['Casa', 'Departamento', 'Terreno', 'Local comercial', 'Oficina', 'Bodega']
const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const cls = inputCls(false, 'oscuro')

const GRID_BG = {
  backgroundImage:
    'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

export default function Recorrido({ inicial, demo = false }: { inicial: Opcion | null; demo?: boolean }) {
  const router = useRouter()
  const [opcion, setOpcion] = useState<Opcion | null>(inicial)
  const quiere: Quiere | null = opcion ? ladoDe(opcion) : null
  const [camino, setCamino] = useState<Camino | null>(null)
  const [paso, setPaso] = useState<Paso>(inicial ? 'como' : 'que')
  const [f, setF] = useState({
    nombre: '', email: '', password: '', telefono: '',
    tipo: 'Casa', superficie: '', municipio: '', colonia: '', precio: '', operacion: inicial === 'poner_renta' ? 'renta' : 'venta', renta_mensual: '', deposito_meses: '',
    busca: '', zona: '', presupuesto: PRESUPUESTOS[2],
  })
  const [trampa, setTrampa] = useState('')
  // V10 §29.2: quien vende entra por el chat; lo que el chat llena pasa al formulario de siempre.
  const [chatVender, setChatVender] = useState(true)
  const [extras, setExtras] = useState<Pick<FichaPropiedad, 'recamaras' | 'banos' | 'estacionamientos' | 'amenidades' | 'notas'>>({ recamaras: null, banos: null, estacionamientos: null, amenidades: [], notas: [] })
  const aplicarChat = (p: FichaPropiedad) => {
    const t = (v: number | null) => (v == null ? '' : String(Math.round(v)))
    setF((x) => ({
      ...x, tipo: p.tipo ?? x.tipo, municipio: p.municipio ?? x.municipio, colonia: p.colonia ?? x.colonia,
      operacion: p.operacion ?? x.operacion, precio: t(p.precio) || x.precio, renta_mensual: t(p.renta_mensual) || x.renta_mensual, superficie: t(p.superficie) || x.superficie,
    }))
    setExtras({ recamaras: p.recamaras, banos: p.banos, estacionamientos: p.estacionamientos, amenidades: p.amenidades, notas: p.notas })
    setChatVender(false)
  }
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaExiste, setYaExiste] = useState(false)

  // Quien ya tiene sesión no se registra de nuevo.
  // Mundo demo (guion v12, JC 19-nov): se entra PRIMERO (/entrar?mundo=demo) y luego se elige qué hacer,
  // ya con sesión; la ficha se guarda con ella y no se crea cuenta al final.
  const [sesion, setSesion] = useState(false)
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (demo) {
        if (!session) router.replace(`/entrar?mundo=demo${inicial ? `&quiere=${inicial}` : ''}`)
        else setSesion(true)
        return
      }
      if (session && paso === 'que') router.replace('/dashboard')
    }
    init()
  }, [router, paso, demo, inicial])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const totalPasos = 3
  const numPaso = { que: 1, como: 2, datos: 3 }[paso]

  const elegir = (o: Opcion) => {
    setOpcion(o); setPaso('como'); setError(null)
    if (ladoDe(o) === 'vender') setF((x) => ({ ...x, operacion: o === 'poner_renta' ? 'renta' : 'venta' }))
  }
  const elegirCamino = async (c: Camino) => {
    setError(null)
    if (demo && sesion && quiere) {
      // La cuenta demo nueva queda como comprador o propietario según lo que eligió.
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const r = await fetch('/api/entrada-demo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ accion: 'rol', quiere }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo continuar'); return }
      // Con sesión, la propiedad se carga en la pantalla de siempre de los propietarios.
      if (quiere === 'vender') { router.push('/activo/nuevo'); return }
    }
    setCamino(c); setPaso('datos'); setChatVender(true)
  }
  const destino = () => (camino === 'asesor' ? '/inicio?camino=broker' : '/inicio')

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quiere) return
    setEnviando(true); setError(null); setYaExiste(false)
    const r = await fetch('/api/registro-cliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quiere, nombre: f.nombre, email: f.email, password: f.password, telefono: f.telefono, sitio_web: trampa,
        propiedad: {
          tipo: f.tipo, superficie: f.superficie, municipio: f.municipio, colonia: f.colonia, precio: f.precio,
          operacion: f.operacion, renta_mensual: f.renta_mensual, renta: { deposito_meses: f.deposito_meses }, ...extras,
        },
        busqueda: { busca: f.busca, zona: f.zona, presupuesto: f.presupuesto },
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setEnviando(false); setError(j.error ?? 'No se pudo crear tu cuenta'); setYaExiste(!!j.yaExiste); return }
    const { data: s, error: eLogin } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password })
    setEnviando(false)
    if (eLogin || !s.session) { setError('Tu cuenta quedó creada. Inicia sesión para continuar.'); setYaExiste(true); return }

    router.push(destino())
  }

  const boton = 'font-sans text-[16px] font-medium px-4 py-3.5 text-center transition-colors disabled:opacity-60'

  const barra = demo ? (
    <>
      <MarcaBarra href="/bienvenida?mundo=demo" />
      {sesion
        ? <span className="font-sans text-[14px] text-tenue">Mundo demo</span>
        : <a href="/entrar?mundo=demo" className="font-sans text-[16px] font-medium text-tinta">Entrar</a>}
    </>
  ) : (
    <>
      <MarcaBarra />
      <a href="/login" className="font-sans text-[16px] font-medium text-tinta">Iniciar sesión</a>
    </>
  )
  const btnAtras = (onClick: () => void) => <button onClick={onClick} className="font-sans text-[16px] text-tinta-2 hover:text-tinta">← Atrás</button>
  const atrasBtn = paso === 'datos' && quiere === 'vender'
    ? btnAtras(() => setChatVender(true))
    : paso === 'como'
    ? btnAtras(() => (inicial ? router.push('/bienvenida') : setPaso('que')))
    : undefined
  const etiquetaPaso = `Paso ${numPaso} de ${totalPasos}${opcion ? ` · ${ETIQUETA[opcion]}` : ''}`
  const colorLado = quiere === 'comprar' ? 'var(--c-verde)' : '#c9a227'
  const tarjetaCls = 'text-left bg-tarjeta border border-linea p-5 flex flex-col gap-1.5 hover:border-linea-fuerte rounded-xl h-full'

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative w-full max-w-[680px] mx-auto px-5 pb-12 flex flex-col gap-6">
        {quiere === 'comprar' && paso === 'datos' ? (
          <FichaNecesidad conSesion={sesion} barra={barra} onAtras={() => setPaso('como')}
            operacionInicial={opcion === 'rentar' ? 'renta' : 'compra'} conAsesor={camino === 'asesor'}
            pasoBase={inicial ? 1 : 2} totalPasos={inicial ? 7 : 8} />
        ) : <>
        {paso === 'que' && (
          <>
            <BandaPaso barra={barra} titulo={'¿Qué quieres hacer?'} subtitulo={'Compra, renta o vende con certeza. Te acompañamos paso a paso.'} atras={atrasBtn}
              avance={<Avance total={totalPasos} hechos={numPaso} color="var(--c-acento)" />} etiqueta={etiquetaPaso} />
            <div className="grid grid-cols-2 gap-3" data-opciones>
              {OPCIONES.map((o) => (
                <button key={o.id} onClick={() => elegir(o.id)} data-opcion={o.id} className={tarjetaCls}>
                  <span className="font-display text-[21px] font-medium text-tinta">{o.titulo}</span>
                  <span className="text-[15px] text-tinta-2">{o.texto}</span>
                </button>
              ))}
            </div>
            <p className="text-[16px] text-tenue text-center">¿Eres asesor inmobiliario? <a href="/bienvenida?broker=1" className="text-acento underline underline-offset-2">Regístrate aquí</a></p>
          </>
        )}

        {/* §24.1: dos tarjetas del mismo tamaño y color, sin "recomendado". Se puede cambiar después. */}
        {paso === 'como' && opcion && (
          <>
            <BandaPaso barra={barra} titulo={'¿Cómo quieres hacerlo?'} subtitulo={'Puedes cambiar de camino cuando quieras.'} atras={atrasBtn}
              avance={<Avance total={totalPasos} hechos={numPaso} color={colorLado} />} etiqueta={etiquetaPaso} />
            <div className="grid grid-cols-2 gap-3" data-como>
              <button onClick={() => elegirCamino('cuenta')} data-camino="cuenta" className={tarjetaCls}>
                <span className="font-display text-[21px] font-medium text-tinta">Por mi cuenta</span>
                <span className="text-[15px] text-tinta-2">{quiere === 'comprar'
                  ? 'La plataforma busca, certifica y te conecta.'
                  : 'La plataforma certifica tu propiedad, la publica y te conecta con quien busca.'}</span>
              </button>
              <button onClick={() => elegirCamino('asesor')} data-camino="asesor" className={tarjetaCls}>
                <span className="font-display text-[21px] font-medium text-tinta">Con un asesor</span>
                <span className="text-[15px] text-tinta-2">{quiere === 'comprar'
                  ? 'Un asesor verificado te acompaña y suma sus opciones.'
                  : 'Un asesor verificado lleva tu propiedad y te acompaña hasta el cierre.'}</span>
              </button>
            </div>
            {error && <p className="text-[16px] text-error" data-error>{error}</p>}
          </>
        )}

        {paso === 'datos' && quiere === 'vender' && chatVender && (
          <ChatEntrada reglas={REGLAS_VENDER} barra={barra} cargando={false}
            inicial={{ ...REGLAS_VENDER.vacia(), operacion: opcion === 'poner_renta' ? 'renta' : 'venta' }}
            onAtras={() => setPaso('como')} onAMano={aplicarChat} onListo={aplicarChat} />
        )}

        {paso === 'datos' && quiere && !(quiere === 'vender' && chatVender) && (
          <form onSubmit={registrar} className="flex flex-col gap-5">
            <BandaPaso barra={barra} titulo={quiere === 'vender' ? 'Cuéntanos de tu propiedad' : '¿Qué estás buscando?'} subtitulo={quiere === 'vender' ? 'Con esto, SMT Match empieza a analizar tu propiedad.' : 'Dínoslo una sola vez y te avisamos de lo que coincida.'} atras={atrasBtn}
              avance={<Avance total={totalPasos} hechos={numPaso} color={quiere === 'comprar' ? 'var(--c-verde)' : '#c9a227'} />} etiqueta={etiquetaPaso} />
            <div className="flex flex-col gap-3.5">
              <Field label="Nombre" required tema="oscuro"><input value={f.nombre} onChange={set('nombre')} required autoComplete="name" className={cls} /></Field>
              <Field label="WhatsApp" required tema="oscuro"><input value={f.telefono} onChange={set('telefono')} required inputMode="tel" autoComplete="tel" placeholder="81 1234 5678" className={cls} /></Field>
              {quiere === 'vender' ? (
                <>
                  {(extras.recamaras != null || extras.banos != null || extras.estacionamientos != null || extras.amenidades.length > 0 || extras.notas.length > 0) && (
                    <p className="text-[15px] text-tinta-2" data-extras-chat>Del chat: {[
                      extras.recamaras != null && cuantos(extras.recamaras, 'recámara', 'recámaras'), extras.banos != null && cuantos(extras.banos, 'baño', 'baños'),
                      extras.estacionamientos != null && cuantos(extras.estacionamientos, 'estacionamiento', 'estacionamientos'), ...extras.notas,
                      ...extras.amenidades.map((a) => (AMENIDADES_PROPIEDAD.find(([k]) => k === a)?.[1] ?? a).toLowerCase()),
                    ].filter(Boolean).join(' · ')}</p>
                  )}
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
                  <div className="flex flex-col gap-2" data-operacion-activo>
                    <span className="font-sans text-[13px] font-medium text-tenue">¿La vendes o la rentas?</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['venta', 'En venta'], ['renta', 'En renta'], ['ambas', 'Las dos']] as const).map(([id, t]) => (
                        <button key={id} type="button" data-op={id} onClick={() => setF((x) => ({ ...x, operacion: id }))}
                          className={`px-3 py-2.5 text-[16px] border rounded-lg ${f.operacion === id ? 'text-tinta' : 'border-linea text-tinta-2'}`}
                          style={f.operacion === id ? { borderColor: '#c9a227', background: 'rgba(201,162,39,.12)' } : undefined}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {f.operacion !== 'renta' && (
                    <Field label="Precio que buscas (MXN)" required tema="oscuro"><input value={f.precio} onChange={set('precio')} required inputMode="numeric" placeholder="19,500,000" className={cls} name="precio" /></Field>
                  )}
                  {f.operacion !== 'venta' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Renta mensual (MXN)" required tema="oscuro"><input value={f.renta_mensual} onChange={set('renta_mensual')} required inputMode="numeric" placeholder="35,000" className={cls} name="renta_mensual" /></Field>
                      <Field label="Depósito (meses)" tema="oscuro"><input value={f.deposito_meses} onChange={set('deposito_meses')} inputMode="numeric" placeholder="1" className={cls} name="deposito_meses" /></Field>
                    </div>
                  )}
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
            <p className="text-[15px] text-tenue">Usamos tu WhatsApp solo para avisarte {quiere === 'vender' ? 'de interesados y del avance' : 'de opciones que coinciden'}. <a href="/aviso-privacidad" target="_blank" className="text-acento underline underline-offset-2">Aviso de privacidad</a></p>
            {error && (
              <p className="text-[16px] text-error">{error}{yaExiste && <> · <a href="/login" className="text-acento underline underline-offset-2">Iniciar sesión</a></>}</p>
            )}
            <button disabled={enviando} className={`${boton} ${quiere === 'vender' ? 'bg-gold-500 hover:bg-gold-400' : 'bg-verde hover:opacity-90'} text-white rounded-lg`}>
              {enviando ? 'Creando tu cuenta…' : camino === 'asesor' ? 'Crear mi cuenta y elegir asesor →' : 'Continuar →'}
            </button>
          </form>
        )}

        </>}
      </div>
    </div>
  )
}
