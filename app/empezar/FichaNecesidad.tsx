'use client'

// Ficha de necesidad del comprador (Documento Maestro V8, Parte 1, §19.1–19.2; decisiones de JC del
// 10-nov-2026). Un paso por pantalla, en este orden:
//   tipo → características (dependen del tipo) → ubicación → presupuesto (+ forma de pago, para
//   cuándo y para qué) → resultados de la búsqueda directa y los dos caminos.
// La cuenta se pide AL FINAL, cuando el cliente ya vio sus primeros resultados (§19.5, regla 1).
// Con sesión (un comprador que crea otra búsqueda, /buscar) se salta la cuenta y se guarda directo.
// V9 (§23): la ubicación tiene hasta 3 zonas, cada una con su municipio; los resultados se muestran
// por zona, con "lo que rinde tu dinero" en cada una.
import { useState } from 'react'
import { BandaPaso, Avance } from '../components/Banda'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Field, inputCls } from '../components/FormField'
import {
  TIPOS_NECESIDAD, CARACTERISTICAS, ESTADOS_MX, MUNICIPIOS_NL, FORMAS_PAGO, PLAZOS, PROPOSITOS,
  millones, rindeDinero, MAX_ZONAS, MEJORES_POR_ZONA, type TipoNecesidad, type MercadoZona,
} from '@/lib/necesidad'

type Paso = 'tipo' | 'caract' | 'ubicacion' | 'presupuesto' | 'buscar'
const PASOS: Paso[] = ['tipo', 'caract', 'ubicacion', 'presupuesto', 'buscar']

interface Resultados {
  zonas: { municipio: string; nombre: string | null; colonias: string[]; mercado: MercadoZona | null }[]
  plataforma: { activoId: string; nombre: string; municipio: string; precio_total: number | null; superficie: number | null; certificada: boolean; zona: number; puntaje: number; razones: string[] }[]
  portales: { url: string; titulo: string; fuente: string; zona: number }[]
}

interface ZonaCaptura { estado: string; municipio: string; nombre: string; colonia: string; colonias: string[] }
const zonaVacia = (estado = 'Nuevo León'): ZonaCaptura => ({ estado, municipio: '', nombre: '', colonia: '', colonias: [] })
const nombreDe = (z: { nombre: string | null; colonias: string[]; municipio: string }) => z.nombre || (z.colonias.length ? z.colonias.join(', ') : z.municipio)

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
  const [zonas, setZonas] = useState<ZonaCaptura[]>([zonaVacia()])
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
    tipo,
    zonas: zonas.map((z) => ({ estado: z.estado, municipio: z.municipio, nombre: z.nombre, colonias: z.colonias })),
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
          {titulo('¿Dónde?', 'Hasta tres zonas, aunque estén en municipios distintos. Te mostramos lo mejor de cada una.')}
          <div className="flex flex-col gap-3">
            {zonas.map((z, k) => (
              <div key={k} className="bg-tarjeta border border-linea p-4 md:p-5 flex flex-col gap-3.5 rounded-xl" data-zona={k}>
                <div className="flex items-center justify-between">
                  <span className="font-display text-[19px] font-medium">Zona {k + 1}</span>
                  {k > 0 && <button type="button" onClick={() => setZonas((x) => x.filter((_, j) => j !== k))} className="text-[15px] text-tenue hover:text-tinta">Quitar</button>}
                </div>
                <Field label="Nombre de la zona (opcional)" tema="oscuro">
                  <input value={z.nombre} onChange={(e) => cambiarZona(k, { nombre: e.target.value })} placeholder={['Valle', 'Country', 'Carretera Nacional'][k]} className={cls} name={`zona-${k}-nombre`} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Estado" required tema="oscuro">
                    <select value={z.estado} onChange={(e) => cambiarZona(k, { estado: e.target.value })} className={cls}>
                      {ESTADOS_MX.map((e) => <option key={e}>{e}</option>)}
                    </select>
                  </Field>
                  <Field label="Ciudad o municipio" required tema="oscuro">
                    <input value={z.municipio} onChange={(e) => cambiarZona(k, { municipio: e.target.value })} list="municipios-nl" name={`zona-${k}-municipio`}
                      placeholder={z.estado === 'Nuevo León' ? ['San Pedro Garza García', 'Monterrey', 'Monterrey'][k] : ''} className={cls} />
                  </Field>
                </div>
                <Field label="Colonias (opcional)" tema="oscuro">
                  <div className="flex gap-2">
                    <input value={z.colonia} onChange={(e) => cambiarZona(k, { colonia: e.target.value })} placeholder={['Del Valle', 'Contry', ''][k]} className={cls} name={`zona-${k}-colonia`}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarColonia(k) } }} />
                    <button type="button" onClick={() => agregarColonia(k)} className="px-4 border border-linea text-[16px] text-tinta-2 hover:border-linea-fuerte rounded-lg">Agregar</button>
                  </div>
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {z.colonias.length === 0
                    ? <span className="text-[16px] text-tenue">Sin colonias: buscamos en todo el municipio.</span>
                    : z.colonias.map((c) => (
                      <button key={c} type="button" onClick={() => cambiarZona(k, { colonias: z.colonias.filter((y) => y !== c) })} className={chip(true)} style={estiloOn(true)}>{c} ✕</button>
                    ))}
                </div>
              </div>
            ))}
            {ubic_datalist()}
            {zonas.length < MAX_ZONAS && (
              <button type="button" onClick={() => setZonas((x) => [...x, zonaVacia(x[x.length - 1].estado)])}
                className="border border-dashed border-linea-fuerte p-4 text-[17px] text-tinta-2 hover:text-tinta rounded-xl">
                + Agregar otra zona <span className="text-tenue">({zonas.length} de {MAX_ZONAS})</span>
              </button>
            )}
          </div>
          {error && <p className="text-[16px] text-error">{error}</p>}
          {continuar(() => {
            const mala = zonas.findIndex((z) => z.municipio.trim().length < 3)
            if (mala >= 0) setError(zonas.length > 1 ? `Escribe la ciudad o el municipio de la zona ${mala + 1}` : 'Escribe la ciudad o el municipio')
            else { setZonas((x) => x.map((z) => (z.colonia.trim() ? { ...z, colonias: [...new Set([...z.colonias, z.colonia.trim()])].slice(0, 10), colonia: '' } : z))); ir('presupuesto') }
          })}
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
            enPlataforma > 0 ? 'Un primer vistazo, lo mejor de cada zona. Al terminar las ves todas en tu bandeja.'
              : total > 0 ? 'Todavía no hay propiedades publicadas en la plataforma que cumplan. Te dejamos los listados de portales y, con tu necesidad en el panel, los brokers de la zona te traen opciones.'
                : 'Todavía no hay coincidencias publicadas. Con tu necesidad en el panel, los brokers de la zona te traen opciones.')}
          {/* V9 (§23.2 y §23.4): una columna por zona, con lo que rinde su dinero y sus 3 mejores. */}
          <div className="flex flex-col gap-3" data-resultados-zonas>
            {resultados.zonas.map((z, k) => {
              const plat = resultados.plataforma.filter((o) => o.zona === k)
              const port = resultados.portales.filter((o) => o.zona === k)
              const rinde = rindeDinero(z.mercado?.precioM2, { tipo: tipo!, caracteristicas: limpias(), presupuesto_max: Number(pres.max) })
              return (
                <div key={k} className="bg-tarjeta border border-linea p-4 flex flex-col gap-2.5 rounded-xl" data-zona-resultado={k}>
                  <div className="flex flex-col">
                    <span className="font-display text-[19px] font-medium">{nombreDe(z)}</span>
                    <span className="text-[15px] text-tenue">{plat.length} {plat.length === 1 ? 'propiedad' : 'propiedades'}{z.mercado?.precioM2 ? ` · ~$${z.mercado.precioM2.toLocaleString('es-MX')}/m²` : ''}</span>
                  </div>
                  {rinde && (
                    <p className="text-[15px] text-tinta-2" data-rinde>
                      Te alcanzan ~{rinde.m2.toLocaleString('es-MX')} m²{rinde.faltaPct != null && rinde.faltaPct > 0 ? <span className="text-aviso"> · tu presupuesto está {rinde.faltaPct} % abajo de lo que pides aquí</span> : null}
                    </p>
                  )}
                  {plat.length + port.length === 0 && <p className="text-[15px] text-tenue">Aún no hay opciones en {nombreDe(z)}.</p>}
                  {plat.slice(0, MEJORES_POR_ZONA).map((o) => (
                    <div key={o.activoId} className="flex flex-col border-t border-linea pt-2">
                      <span className="text-[17px]">{o.nombre}</span>
                      <span className="text-[15px] text-tenue">{o.precio_total ? millones(o.precio_total) : 'Sin precio'} · {o.puntaje} % · {o.certificada ? 'Certificada' : 'Particular'}</span>
                      {o.razones.length > 0 && <span className="text-[14px] text-tenue">{o.razones.join(' · ')}</span>}
                    </div>
                  ))}
                  {port.slice(0, Math.max(0, MEJORES_POR_ZONA - plat.length)).map((o) => (
                    <div key={o.url} className="flex flex-col border-t border-linea pt-2">
                      <span className="text-[16px] line-clamp-2">{o.titulo}</span>
                      <span className="text-[14px] text-tenue">De portal ({o.fuente}) · no certificada</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

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

  function cambiarZona(k: number, cambio: Partial<ZonaCaptura>) {
    setZonas((x) => x.map((z, j) => (j === k ? { ...z, ...cambio } : z)))
  }

  function agregarColonia(k: number) {
    const z = zonas[k]
    const c = z.colonia.trim()
    cambiarZona(k, { colonia: '', colonias: c && !z.colonias.includes(c) ? [...z.colonias, c].slice(0, 10) : z.colonias })
  }

  function limpias() {
    return Object.fromEntries(Object.entries(car).filter(([, v]) => (Array.isArray(v) ? v.length : v !== ''))
      .map(([k, v]) => [k, Array.isArray(v) ? v : Number(v) || v])) as Record<string, number | string | string[]>
  }

  function ubic_datalist() {
    return <datalist id="municipios-nl">{MUNICIPIOS_NL.map((m) => <option key={m} value={m} />)}</datalist>
  }
}
