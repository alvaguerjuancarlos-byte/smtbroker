'use client'

// Ficha de necesidad del comprador (Documento Maestro V8, Parte 1, §19.1–19.2; decisiones de JC del
// 10-nov-2026). Un paso por pantalla, en este orden:
//   tipo → características (dependen del tipo) → ubicación → presupuesto (+ forma de pago, para
//   cuándo y para qué) → resultados de la búsqueda directa y los dos caminos.
// La cuenta se pide AL FINAL, cuando el cliente ya vio sus primeros resultados (§19.5, regla 1).
// Con sesión (un comprador que crea otra búsqueda, /buscar) se salta la cuenta y se guarda directo.
import { useState } from 'react'
import { BandaPaso, Avance } from '../components/Banda'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Field, inputCls } from '../components/FormField'
import {
  TIPOS_NECESIDAD, CARACTERISTICAS, ESTADOS_MX, MUNICIPIOS_NL, FORMAS_PAGO, PLAZOS, PROPOSITOS,
  millones, type TipoNecesidad,
} from '@/lib/necesidad'

type Paso = 'tipo' | 'caract' | 'ubicacion' | 'presupuesto' | 'buscar'
const PASOS: Paso[] = ['tipo', 'caract', 'ubicacion', 'presupuesto', 'buscar']

interface Resultados {
  plataforma: { activoId: string; nombre: string; municipio: string; precio_total: number | null; superficie: number | null; certificada: boolean }[]
  portales: { url: string; titulo: string; fuente: string }[]
}

const verde = 'var(--c-verde)'
const cls = inputCls(false, 'oscuro')
const boton = 'font-sans text-[16px] font-medium px-4 py-3.5 text-center transition-colors disabled:opacity-60'
const soloDigitos = (v: string) => v.replace(/\D/g, '')
const conComas = (v: string) => (v ? Number(v).toLocaleString('es-MX') : '')

export default function FichaNecesidad({ conSesion, onAtras, pasoBase, totalPasos, barra }: {
  barra?: React.ReactNode
  conSesion: boolean
  onAtras: () => void
  /** Pasos previos del recorrido (el "¿qué quieres hacer?"), para numerar la barra. */
  pasoBase: number
  totalPasos: number
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>('tipo')
  const [tipo, setTipo] = useState<TipoNecesidad | null>(null)
  const [car, setCar] = useState<Record<string, string | string[]>>({})
  const [ubic, setUbic] = useState({ estado: 'Nuevo León', municipio: '', zona: '', colonia: '' })
  const [colonias, setColonias] = useState<string[]>([])
  const [pres, setPres] = useState({ min: '', max: '' })
  const [formaPago, setFormaPago] = useState<string | null>(null)
  const [plazo, setPlazo] = useState<string | null>(null)
  const [proposito, setProposito] = useState<string | null>(null)
  const [directa, setDirecta] = useState(true)
  const [brokers, setBrokers] = useState(true)
  const [cuenta, setCuenta] = useState({ nombre: '', telefono: '', email: '', password: '' })
  const [trampa, setTrampa] = useState('')
  const [resultados, setResultados] = useState<Resultados | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaExiste, setYaExiste] = useState(false)

  const i = PASOS.indexOf(paso)
  const ir = (p: Paso) => { setError(null); setPaso(p) }
  const atras = () => (i === 0 ? onAtras() : ir(PASOS[i - 1]))

  const necesidad = () => ({
    tipo, estado: ubic.estado, municipio: ubic.municipio, zona: ubic.zona, colonias,
    caracteristicas: Object.fromEntries(Object.entries(car).filter(([, v]) => (Array.isArray(v) ? v.length : v !== ''))),
    presupuesto_min: pres.min || null, presupuesto_max: pres.max, forma_pago: formaPago, plazo, proposito,
    busqueda_directa: directa, publicada_brokers: brokers,
  })

  const buscar = async () => {
    if (!pres.max) { setError('Escribe tu presupuesto máximo'); return }
    if (pres.min && Number(pres.min) > Number(pres.max)) { setError('El mínimo es mayor que el máximo'); return }
    setCargando(true); setError(null)
    const r = await fetch('/api/necesidades/buscar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(necesidad()) })
    const j = await r.json().catch(() => ({}))
    setCargando(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo buscar'); return }
    setResultados(j as Resultados)
    ir('buscar')
  }

  const terminar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true); setError(null); setYaExiste(false)
    if (conSesion) {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const r = await fetch('/api/necesidades', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(necesidad()) })
      const j = await r.json().catch(() => ({}))
      setCargando(false)
      if (!r.ok) { setError(j.error ?? 'No se pudo guardar tu búsqueda'); return }
      router.push('/inicio')
      return
    }
    const r = await fetch('/api/registro-cliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiere: 'comprar', ...cuenta, sitio_web: trampa, necesidad: necesidad() }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setCargando(false); setError(j.error ?? 'No se pudo crear tu cuenta'); setYaExiste(!!j.yaExiste); return }
    const { data: s, error: eLogin } = await supabase.auth.signInWithPassword({ email: cuenta.email.trim().toLowerCase(), password: cuenta.password })
    setCargando(false)
    if (eLogin || !s.session) { setError('Tu cuenta quedó creada. Inicia sesión para continuar.'); setYaExiste(true); return }
    router.push('/inicio')
  }

  const chip = (on: boolean) => `px-3 py-2.5 text-[16px] border transition-colors ${on ? 'text-tinta' : 'border-linea text-tinta-2 hover:border-linea-fuerte'} rounded-lg`
  const estiloOn = (on: boolean) => (on ? { borderColor: verde, background: 'var(--c-verde-suave)' } : undefined)
  // Cada paso abre con la banda azul (nuevo look, estilo C): barra, regresar, avance y título.
  const titulo = (t: string, sub?: string) => (
    <BandaPaso barra={barra} titulo={t} subtitulo={sub}
      atras={<button onClick={atras} className="font-sans text-[16px] text-tinta-2 hover:text-tinta">← Atrás</button>}
      avance={<Avance total={totalPasos} hechos={pasoBase + i + 1} color="var(--c-acento)" />}
      etiqueta={`Paso ${pasoBase + i + 1} de ${totalPasos} · Buscar`} />
  )
  const continuar = (onClick: () => void, texto = 'Continuar →', deshabilitado = false) => (
    <button type="button" onClick={onClick} disabled={deshabilitado || cargando} className={`${boton} text-white`} style={{ background: verde }}>{texto}</button>
  )
  const enPlataforma = resultados?.plataforma.length ?? 0
  const total = enPlataforma + (resultados?.portales.length ?? 0)

  return (
    <>
      {paso === 'tipo' && (
        <>
          {titulo('¿Qué tipo de propiedad buscas?')}
          <div className="grid grid-cols-2 gap-2.5">
            {TIPOS_NECESIDAD.map((t) => (
              <button key={t.id} onClick={() => { if (t.id !== tipo) setCar({}); setTipo(t.id); ir('caract') }}
                className={`${chip(tipo === t.id)} py-4 text-[18px] text-left px-4 bg-tarjeta rounded-xl`} style={estiloOn(tipo === t.id)}>{t.etiqueta}</button>
            ))}
          </div>
        </>
      )}

      {paso === 'caract' && tipo && (
        <>
          {titulo('Características', 'Lo mínimo que necesitas. Deja en blanco lo que no te importe.')}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5">
              {CARACTERISTICAS[tipo].filter((c) => c.tipo === 'numero').map((c) => (
                <Field key={c.clave} label={`${c.etiqueta}${c.unidad ? ` (${c.unidad})` : ''}`} tema="oscuro">
                  <input value={conComas(car[c.clave] as string ?? '')} inputMode="numeric" className={cls}
                    onChange={(e) => setCar((x) => ({ ...x, [c.clave]: soloDigitos(e.target.value) }))} />
                </Field>
              ))}
            </div>
            {CARACTERISTICAS[tipo].filter((c) => c.tipo !== 'numero').map((c) => (
              <div key={c.clave} className="flex flex-col gap-2">
                <span className="font-sans text-[13px] font-medium text-tenue">{c.etiqueta}</span>
                <div className="flex flex-wrap gap-1.5">
                  {c.opciones!.map((o) => {
                    const v = car[c.clave]
                    const on = c.tipo === 'chips' ? Array.isArray(v) && v.includes(o) : v === o
                    return (
                      <button key={o} type="button" className={chip(on)} style={estiloOn(on)} onClick={() => setCar((x) => {
                        if (c.tipo === 'opcion') return { ...x, [c.clave]: on ? '' : o }
                        const a = Array.isArray(x[c.clave]) ? x[c.clave] as string[] : []
                        return { ...x, [c.clave]: on ? a.filter((y) => y !== o) : [...a, o] }
                      })}>{o}</button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {continuar(() => ir('ubicacion'))}
        </>
      )}

      {paso === 'ubicacion' && (
        <>
          {titulo('¿Dónde?', 'Puedes elegir varias colonias o buscar en todo el municipio.')}
          <div className="flex flex-col gap-3.5">
            <Field label="Estado" required tema="oscuro">
              <select value={ubic.estado} onChange={(e) => setUbic((x) => ({ ...x, estado: e.target.value }))} className={cls}>
                {ESTADOS_MX.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Ciudad o municipio" required tema="oscuro">
              <input value={ubic.municipio} onChange={(e) => setUbic((x) => ({ ...x, municipio: e.target.value }))} list="municipios-nl"
                placeholder={ubic.estado === 'Nuevo León' ? 'San Pedro Garza García' : ''} className={cls} />
              {ubic.estado === 'Nuevo León' && <datalist id="municipios-nl">{MUNICIPIOS_NL.map((m) => <option key={m} value={m} />)}</datalist>}
            </Field>
            <Field label="Zona (opcional)" tema="oscuro">
              <input value={ubic.zona} onChange={(e) => setUbic((x) => ({ ...x, zona: e.target.value }))} placeholder="Poniente, Carretera Nacional…" className={cls} />
            </Field>
            <Field label="Colonias (opcional)" tema="oscuro">
              <div className="flex gap-2">
                <input value={ubic.colonia} onChange={(e) => setUbic((x) => ({ ...x, colonia: e.target.value }))} placeholder="Del Valle" className={cls}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarColonia() } }} />
                <button type="button" onClick={agregarColonia} className="px-4 border border-linea text-[16px] text-tinta-2 hover:border-linea-fuerte">Agregar</button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {colonias.length === 0
                ? <span className="text-[16px] text-tenue">Sin colonias: buscamos en todo el municipio.</span>
                : colonias.map((c) => (
                  <button key={c} type="button" onClick={() => setColonias((x) => x.filter((y) => y !== c))} className={chip(true)} style={estiloOn(true)}>{c} ✕</button>
                ))}
            </div>
          </div>
          {error && <p className="text-[16px] text-error">{error}</p>}
          {continuar(() => (ubic.municipio.trim().length < 3 ? setError('Escribe la ciudad o el municipio') : ir('presupuesto')))}
        </>
      )}

      {paso === 'presupuesto' && (
        <>
          {titulo('Presupuesto')}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Desde (MXN)" tema="oscuro">
                <input value={conComas(pres.min)} onChange={(e) => setPres((x) => ({ ...x, min: soloDigitos(e.target.value) }))} inputMode="numeric" placeholder="6,000,000" className={cls} />
              </Field>
              <Field label="Hasta (MXN)" required tema="oscuro">
                <input value={conComas(pres.max)} onChange={(e) => setPres((x) => ({ ...x, max: soloDigitos(e.target.value) }))} inputMode="numeric" placeholder="8,000,000" className={cls} />
              </Field>
            </div>
            {([['¿Cómo pagarías?', FORMAS_PAGO, formaPago, setFormaPago], ['¿Para cuándo?', PLAZOS, plazo, setPlazo], ['¿Para qué la quieres?', PROPOSITOS, proposito, setProposito]] as const).map(([l, ops, v, set]) => (
              <div key={l} className="flex flex-col gap-2">
                <span className="font-sans text-[13px] font-medium text-tenue">{l}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ops.map((o) => <button key={o.id} type="button" className={chip(v === o.id)} style={estiloOn(v === o.id)} onClick={() => set(v === o.id ? null : o.id)}>{o.etiqueta}</button>)}
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-[16px] text-error">{error}</p>}
          {continuar(buscar, cargando ? 'Buscando…' : 'Buscar →')}
        </>
      )}

      {paso === 'buscar' && resultados && (
        <form onSubmit={terminar} className="flex flex-col gap-5">
          {/* Lo de portales son listados (ej. "89 bodegas en venta en Apodaca"), no propiedades: no se suman al conteo. */}
          {titulo(enPlataforma > 0 ? `Encontramos ${enPlataforma} ${enPlataforma === 1 ? 'propiedad' : 'propiedades'} para ti` : total > 0 ? 'Ya buscamos en el mercado' : 'Empezamos a buscar por ti',
            enPlataforma > 0 ? 'Un primer vistazo. Al terminar las ves todas en tu bandeja.'
              : total > 0 ? 'Todavía no hay propiedades publicadas en la plataforma que cumplan. Te dejamos los listados de portales y, con tu necesidad en el panel, los brokers de la zona te traen opciones.'
                : 'Todavía no hay coincidencias publicadas. Con tu necesidad en el panel, los brokers de la zona te traen opciones.')}
          {total > 0 && (
            <div className="bg-tarjeta border border-linea p-4 flex flex-col gap-2.5 rounded-xl">
              {resultados.plataforma.slice(0, 3).map((o) => (
                <div key={o.activoId} className="flex flex-col">
                  <span className="text-[17px]">{o.nombre}</span>
                  <span className="text-[15px] text-tenue">{o.precio_total ? millones(o.precio_total) : 'Sin precio'} · {o.certificada ? 'Certificada por SMTBROKER' : 'Particular'}</span>
                </div>
              ))}
              {resultados.portales.slice(0, 3).map((o) => (
                <div key={o.url} className="flex flex-col">
                  <span className="text-[17px] line-clamp-1">{o.titulo}</span>
                  <span className="text-[15px] text-tenue">De portal ({o.fuente}) · no certificada</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <span className="font-sans text-[13px] font-medium text-tenue">¿Cómo quieres buscar?</span>
            {([
              [directa, setDirecta, 'Búsqueda directa', 'Seguimos buscando en la plataforma y en portales, y te avisamos de lo nuevo.'],
              [brokers, setBrokers, 'Publicar a brokers verificados', 'Tu necesidad aparece, sin tu nombre, en el panel de los brokers de la zona. Te proponen propiedades de su cartera, incluso las que no están en portales.'],
            ] as const).map(([on, set, t, d]) => (
              <button key={t} type="button" onClick={() => set(!on)} className="text-left bg-tarjeta border p-4 flex gap-3 rounded-xl" style={{ borderColor: on ? verde : 'var(--c-linea)' }}>
                <span className="w-5 h-5 shrink-0 border flex items-center justify-center text-[15px] text-navy-950 mt-0.5" style={{ borderColor: verde, background: on ? verde : 'transparent' }}>{on ? '✓' : ''}</span>
                <span className="flex flex-col gap-1">
                  <span className="text-[18px] font-medium">{t}</span>
                  <span className="text-[16px] text-tinta-2">{d}</span>
                </span>
              </button>
            ))}
          </div>

          {!conSesion && (
            <div className="flex flex-col gap-3.5">
              <p className="text-[17px] text-tinta-2">Para guardar tu búsqueda y recibir las propuestas, crea tu cuenta:</p>
              <Field label="Nombre" required tema="oscuro"><input value={cuenta.nombre} onChange={(e) => setCuenta((x) => ({ ...x, nombre: e.target.value }))} required autoComplete="name" className={cls} /></Field>
              <Field label="WhatsApp" required tema="oscuro"><input value={cuenta.telefono} onChange={(e) => setCuenta((x) => ({ ...x, telefono: e.target.value }))} required inputMode="tel" autoComplete="tel" placeholder="81 1234 5678" className={cls} /></Field>
              <Field label="Correo" required tema="oscuro"><input type="email" value={cuenta.email} onChange={(e) => setCuenta((x) => ({ ...x, email: e.target.value }))} required autoComplete="email" className={cls} /></Field>
              <Field label="Crea una contraseña" required tema="oscuro"><input type="password" value={cuenta.password} onChange={(e) => setCuenta((x) => ({ ...x, password: e.target.value }))} required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className={cls} /></Field>
              <input value={trampa} onChange={(e) => setTrampa(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="sitio_web" />
              <p className="text-[15px] text-tenue">Los brokers no ven tu nombre ni tu WhatsApp hasta que tú pidas ver una propiedad. Usamos tu WhatsApp solo para avisarte de opciones nuevas. <a href="/aviso-privacidad" target="_blank" className="text-acento underline underline-offset-2">Aviso de privacidad</a></p>
            </div>
          )}
          {error && <p className="text-[16px] text-error">{error}{yaExiste && <> · <a href="/login" className="text-acento underline underline-offset-2">Iniciar sesión</a></>}</p>}
          <button disabled={cargando || (!directa && !brokers)} className={`${boton} text-white`} style={{ background: verde }}>
            {cargando ? 'Guardando…' : conSesion ? 'Guardar mi búsqueda' : 'Crear mi cuenta y buscar'}
          </button>
        </form>
      )}
    </>
  )

  function agregarColonia() {
    const c = ubic.colonia.trim()
    if (c && !colonias.includes(c)) setColonias((x) => [...x, c].slice(0, 10))
    setUbic((x) => ({ ...x, colonia: '' }))
  }
}
