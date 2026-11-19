'use client'

// Panel de quien compra (ver app/inicio/page.tsx), Documento Maestro V8, Parte 1:
//   - Tus búsquedas (§19.1, §19.5): cada ficha con sus dos caminos (búsqueda directa y publicada a
//     brokers), su vigencia de 30 días y cuántas propuestas lleva; pausar, renovar y crear otra
//     (hasta 3 activas, en /buscar).
//   - V10 §24.3 (18-nov-2026): el TABLERO DE DECISIÓN reemplaza a la bandeja mezclada: tres bandas fijas
//     (Encontradas por SMT Match · Propuestas por asesores · En portales sin certificar), de más certeza a
//     menos y nunca revueltas; dentro de cada banda una columna por zona con las 3 mejores (en celular
//     las zonas se recorren de lado); interruptor de propuestas en la banda 2; lo de su asesor primero.
//   - Su Radar (pegar ligas de otros portales) y, si va por su cuenta, el broker.
//   - V8 Parte 2 (§20): "Me interesa" en cada propiedad de la bandeja dispara su análisis y lleva a
//     /analisis (comparativo). Un anuncio de portal se analiza cuando tiene precio y m²: la plataforma
//     lee esa página a petición del comprador o, si el portal no lo permite, él los escribe (opción 2,
//     10-nov-2026). Las páginas de resultados no se analizan.
//   - V9 (§23.4): la bandeja se muestra POR ZONA de cada búsqueda vigente: una columna por zona con lo
//     que rinde su dinero (§23.2) y las 3 mejores opciones; "Ver todas" abre el resto. Una zona sin
//     opciones queda en blanco. Lo que no cae en ninguna zona va al final, en "Otras opciones".
// Todo sale de app/api/necesidades (GET), que arma la bandeja en el servidor.
import { EncabezadoPantalla } from '../components/Banda'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { dinero, MAX_NECESIDADES_ACTIVAS, MEJORES_POR_ZONA } from '@/lib/necesidad'
import ListaConexiones from '../components/ListaConexiones'

interface Busqueda {
  id: string; operacion: 'compra' | 'renta'; resumen: string; detalle: string[]; activa: boolean; vigente: boolean; vence_at: string
  busqueda_directa: boolean; publicada_brokers: boolean; propuestas: number
  camino?: 'por_mi_cuenta' | 'con_asesor'
  zonas: { nombre: string; municipio: string; precioM2: number | null; comparables: number; rinde: { m2: number; faltaPct: number | null } | null }[]
}
interface Opcion {
  clave: string; origen: 'broker' | 'certificada' | 'particular' | 'portal'; titulo: string; tipo: string | null
  municipio: string | null; precio: number | null; superficie: number | null; url?: string; fuente?: string
  broker?: { nombre: string; nivel: string; deTuAsesor?: boolean }; certificada?: boolean; activoId?: string; necesidadId?: string
  red?: { nombre: string; nivel: string; deTuAsesor: boolean }
  opcionId?: string; anuncioId?: string; lectura?: string | null; colonia?: string | null
  zona?: number; puntaje?: number; razones?: string[]; operacion?: 'compra' | 'renta'; detalleRenta?: string[]
  foto?: string | null; pedida?: boolean; invitacion?: string
}
interface Datos { conBroker: boolean; necesidades: Busqueda[]; bandeja: Opcion[]; analizados: string[] }

const verde = 'var(--c-verde)'
const tarjeta = 'bg-tarjeta border p-4 md:p-5 flex flex-col gap-2.5 rounded-xl'
const etiqueta = 'font-sans text-[14px]'

// §19.4: la etiqueta dice de dónde viene cada opción.
const ORIGEN: Record<Opcion['origen'], { texto: string; color: string }> = {
  broker: { texto: 'Propuesta por asesor verificado', color: 'var(--c-oro)' },
  certificada: { texto: 'Certificada por SMT Match', color: verde },
  particular: { texto: 'Particular', color: 'var(--c-gris)' },
  portal: { texto: 'De portal · no certificada', color: 'var(--c-gris)' },
}

// V10 §24.3: las tres bandas, en este orden fijo (decisión 2 de la V10: también con asesor).
const BANDAS: { id: 1 | 2 | 3; titulo: string; color: string; vacio: string; de: (o: Opcion) => boolean }[] = [
  { id: 1, titulo: 'Encontradas por SMT Match', color: verde, de: (o) => o.origen === 'certificada' || o.origen === 'particular',
    vacio: 'Aún no encontramos propiedades en la plataforma para esta búsqueda; te avisamos cuando aparezcan.' },
  { id: 2, titulo: 'Propuestas por asesores', color: 'var(--c-oro)', de: (o) => o.origen === 'broker',
    vacio: 'Aún no hay propuestas de asesores; te avisamos cuando lleguen.' },
  { id: 3, titulo: 'En portales · sin certificar', color: 'var(--c-gris)', de: (o) => o.origen === 'portal',
    vacio: 'Aún no hay anuncios de portales en tus zonas.' },
]

// Columnas por número de zonas (clases completas para que Tailwind las genere).
const COLUMNAS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }

const diasPara = (fecha: string) => Math.max(0, Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400_000))

export default function PanelComprador({ nombre, conBroker }: { uid: string; nombre: string; conBroker: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [analizando, setAnalizando] = useState<string | null>(null)
  const [captura, setCaptura] = useState<{ clave: string; precio: string; superficie: string } | null>(null)
  const router = useRouter()

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch('/api/necesidades', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar tu búsqueda'); return }
    setDatos(j as Datos)
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const cambiar = async (id: string, cuerpo: Record<string, unknown>) => {
    setOcupado(id); setError(null)
    const r = await fetch(`/api/necesidades/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(cuerpo),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
    await cargar()
  }

  // "Me interesa": el análisis tarda (busca comparables reales); al terminar abre el comparativo.
  const meInteresa = async (o: Opcion) => {
    const id = o.activoId ?? o.anuncioId
    if (!id) return
    if (datos?.analizados.includes(id)) { router.push(`/analisis#${id}`); return }
    setAnalizando(id); setError(null)
    const r = await fetch('/api/analisis', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify(o.activoId ? { activoId: o.activoId, necesidadId: o.necesidadId } : { anuncioId: o.anuncioId, necesidadId: o.necesidadId }),
    })
    const j = await r.json().catch(() => ({}))
    setAnalizando(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo analizar'); return }
    router.push(`/analisis#${id}`)
  }

  // V10 §24.3, banda 3: "Pedir que se certifique" = el "Me interesa" del Radar (§18): Operación invita
  // al anunciante a certificar; si ya hay invitación en curso, solo se suma como interesado.
  const pedirCertificacion = async (o: Opcion) => {
    if (!o.opcionId) return
    setOcupado(o.clave); setError(null)
    const r = await fetch(`/api/radar/${o.opcionId}`, { method: 'POST', headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo pedir la certificación'); return }
    await cargar()
  }

  // Anuncio de portal (opción 2): leer esa página, o escribir lo que vio si el portal no deja.
  const datosAnuncio = async (o: Opcion, cuerpo: Record<string, unknown>) => {
    if (!o.opcionId) return
    setAnalizando(o.clave); setError(null)
    const r = await fetch(`/api/radar/${o.opcionId}/datos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(cuerpo),
    })
    const j = await r.json().catch(() => ({}))
    setAnalizando(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo'); return }
    setCaptura(null)
    await cargar()
  }

  // Lo que se puede hacer con un anuncio de portal, según cómo va su lectura.
  const accionesAnuncio = (o: Opcion) => {
    const completo = !!(o.precio && o.superficie)
    const leyendo = analizando === o.clave
    if (o.lectura === 'listado') {
      return <p className="text-[15px] text-tenue">Es una página de resultados. Abre el anuncio que te guste y pega su liga en tu Radar para leerlo.</p>
    }
    if (captura?.clave === o.clave) {
      return (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="grid grid-cols-2 gap-1.5">
            <input value={captura.precio ? Number(captura.precio).toLocaleString('es-MX') : ''} onChange={(e) => setCaptura({ ...captura, precio: e.target.value.replace(/[^0-9]/g, '') })}
              inputMode="numeric" placeholder="Precio (MXN)" className="px-2.5 py-2 bg-fondo/60 border border-linea text-[16px] text-tinta rounded-lg" />
            <input value={captura.superficie} onChange={(e) => setCaptura({ ...captura, superficie: e.target.value.replace(/[^0-9.]/g, '') })}
              inputMode="numeric" placeholder="m²" className="px-2.5 py-2 bg-fondo/60 border border-linea text-[16px] text-tinta rounded-lg" />
          </div>
          <button onClick={() => datosAnuncio(o, { accion: 'capturar', precio: captura.precio, superficie: captura.superficie })} disabled={leyendo}
            className="w-fit px-3 py-1.5 text-[15px] font-sans border disabled:opacity-60 rounded-lg" style={{ borderColor: verde, color: verde }}>Guardar</button>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
        {o.lectura === 'bloqueado' && <span className="text-[15px] text-tenue">Este portal no deja leer el anuncio.</span>}
        {o.lectura === 'leido' && !completo && <span className="text-[15px] text-tenue">No pudimos leer todo del anuncio.</span>}
        {o.lectura === 'capturado' && <span className="text-[15px] text-tenue">Datos que escribiste tú.</span>}
        {(!o.lectura || o.lectura === 'fallo') && (
          <button onClick={() => datosAnuncio(o, { accion: 'leer' })} disabled={!!analizando} className="font-sans text-[15px] disabled:opacity-60" style={{ color: verde }}>
            {leyendo ? 'Leyendo el anuncio… (hasta 1 min)' : 'Leer el anuncio →'}
          </button>
        )}
        {(o.lectura === 'bloqueado' || o.lectura === 'fallo' || (o.lectura === 'leido' && !completo) || o.lectura === 'capturado') && (
          <button onClick={() => setCaptura({ clave: o.clave, precio: o.precio ? String(o.precio) : '', superficie: o.superficie ? String(o.superficie) : '' })}
            className="font-sans text-[15px]" style={{ color: verde }}>{o.lectura === 'capturado' ? 'Corregir precio y m²' : 'Escribir el precio y los m² que viste'}</button>
        )}
      </div>
    )
  }

  if (!datos) return error ? <p className="text-[16px] text-error">{error}</p> : <p className="text-tenue text-[16px] font-sans">Cargando tu búsqueda…</p>

  const activas = datos.necesidades.filter((n) => n.vigente)
  const porSuCuenta = !datos.conBroker
  // V9: cada búsqueda vigente con sus zonas; dentro de cada zona, de la más cercana a la menos.
  const porPuntaje = (a: Opcion, b: Opcion) => (b.puntaje ?? 0) - (a.puntaje ?? 0)
  // Banda 2: primero lo de su asesor (decisión 2 de la V10), luego por coincidencia.
  const porAsesor = (a: Opcion, b: Opcion) => Number(!!b.broker?.deTuAsesor) - Number(!!a.broker?.deTuAsesor) || porPuntaje(a, b)
  const enZona = (nid: string, k: number) => datos.bandeja.filter((o) => o.necesidadId === nid && o.zona === k).sort(porPuntaje)
  const conZona = activas.filter((n) => n.zonas?.length)
  const otras = datos.bandeja.filter((o) => !conZona.some((n) => n.id === o.necesidadId && o.zona != null && o.zona >= 0))
  const alternar = (clave: string) => setAbiertas((x) => { const y = new Set(x); if (y.has(clave)) y.delete(clave); else y.add(clave); return y })

  // §24.3: precio contra mercado = su precio por m² contra el típico de su zona (el mismo de "lo que
  // rinde tu dinero", §23.2), solo con 3 comparables o más. Es una referencia rápida; el análisis
  // completo sale al marcar "Me interesa" (§20).
  const contraMercado = (o: Opcion) => {
    if (!o.precio || !o.superficie || o.zona == null || o.zona < 0) return null
    const z = datos.necesidades.find((n) => n.id === o.necesidadId)?.zonas?.[o.zona]
    if (!z?.precioM2 || z.comparables < 3) return null
    const pct = Math.round(((o.precio / o.superficie) / z.precioM2 - 1) * 100)
    if (Math.abs(pct) < 5) return { texto: `En línea con el mercado de ${z.nombre}`, color: 'var(--c-tinta-2)' }
    return pct < 0
      ? { texto: `~${-pct} % abajo del mercado de ${z.nombre}`, color: verde }
      : { texto: `~${pct} % arriba del mercado de ${z.nombre}`, color: pct > 15 ? 'var(--c-aviso, #b54708)' : 'var(--c-tinta-2)' }
  }

  // §24.3: la misma tarjeta en las tres bandas; solo cambia la etiqueta de origen.
  const etiquetaDe = (o: Opcion) => o.origen === 'broker'
    ? [o.broker?.deTuAsesor ? 'De tu asesor' : null, o.broker ? `${o.broker.nombre}${o.broker.nivel ? ` · ${o.broker.nivel}` : ''}` : 'Asesor verificado', o.certificada ? 'certificada' : null].filter(Boolean).join(' · ')
    // Banda 1 con asesor: de la cartera de un asesor de la red, nunca "Particular".
    : o.red ? [o.red.deTuAsesor ? 'De tu asesor' : 'De la red', `${o.red.nombre}${o.red.nivel ? ` · ${o.red.nivel}` : ''}`, o.certificada ? 'certificada' : 'sin certificar'].join(' · ')
    : o.origen === 'certificada' ? 'Certificada por SMT Match'
    : o.origen === 'particular' ? 'Particular · sin certificar'
    : `${o.fuente ?? 'Portal'} · sin certificar`
  const verOpcion = (o: Opcion, banda?: number) => (
    <div key={o.clave} className="border-t border-linea pt-2.5 flex flex-col gap-1" data-opcion={o.clave} data-banda-opcion={banda}>
      {o.foto
        ? <img src={o.foto} alt="" loading="lazy" className="w-full h-[132px] object-cover rounded-lg bg-fondo" data-foto />
        : <div className="w-full h-[64px] rounded-lg bg-fondo flex items-center justify-center text-[13px] text-tenue" data-sin-foto>
            {o.origen === 'portal' ? 'La foto está en el portal' : 'Sin fotos todavía'}
          </div>}
      <span className="font-sans text-[13px]" style={{ color: ORIGEN[o.origen].color, fontWeight: o.broker?.deTuAsesor ? 600 : undefined }}>
        {etiquetaDe(o)}
      </span>
      {o.url
        ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-[17px] underline underline-offset-2 decoration-linea-fuerte">{o.titulo}</a>
        : <span className="text-[17px]">{o.titulo}</span>}
      <span className="text-[15px] text-tenue">
        {[o.precio ? dinero(o.precio, o.operacion) : null, o.superficie ? `${o.superficie.toLocaleString('es-MX')} m²` : null, o.colonia || o.municipio, o.fuente].filter(Boolean).join(' · ') || 'Abre el anuncio para ver los detalles'}
      </span>
      {(() => { const m = contraMercado(o); return m && <span className="text-[14px]" style={{ color: m.color }} data-mercado>{m.texto}</span> })()}
      {o.detalleRenta && o.detalleRenta.length > 0 && <span className="text-[14px] text-tenue">{o.detalleRenta.join(' · ')}</span>}
      {(o.puntaje != null || !!o.razones?.length) && o.origen !== 'portal' && (
        <span className="text-[14px] text-tinta-2">{o.puntaje != null && <b className="font-semibold" style={{ color: verde }}>{o.puntaje} %</b>}{o.razones?.length ? `${o.puntaje != null ? ' · ' : ''}${o.razones.join(' · ')}` : ''}</span>
      )}
      {o.origen === 'portal' && accionesAnuncio(o)}
      {o.origen === 'portal' && o.opcionId && (o.pedida || (o.invitacion && o.invitacion !== 'sin_invitar')
        ? <span className="text-[14px] text-tenue" data-certificacion-pedida>
            {o.invitacion === 'aceptada' ? 'El anunciante aceptó certificarla.' : o.invitacion === 'rechazada' || o.invitacion === 'sin_respuesta' ? 'El anunciante no aceptó certificarla.' : 'Pedimos al anunciante que la certifique; te avisamos.'}
          </span>
        : <button onClick={() => pedirCertificacion(o)} disabled={ocupado === o.clave} data-pedir-certificacion
            className="w-fit px-3 py-1.5 text-[15px] font-sans border disabled:opacity-60 rounded-lg" style={{ borderColor: verde, color: verde }}>
            {ocupado === o.clave ? 'Pidiendo…' : 'Pedir que se certifique'}
          </button>)}
      {(o.activoId || (o.anuncioId && o.precio && o.superficie)) && (() => {
        const id = (o.activoId ?? o.anuncioId)!
        return (
          <button onClick={() => meInteresa(o)} disabled={!!analizando} className="w-fit mt-1 px-3 py-2 text-[15px] font-sans border disabled:opacity-60 rounded-lg"
            style={datos.analizados.includes(id) ? { borderColor: verde, color: verde } : { borderColor: verde, background: verde, color: '#ffffff' }}>
            {analizando === id ? 'Analizando… (hasta 1 min)' : datos.analizados.includes(id) ? 'Ver su análisis →' : 'Me interesa'}
          </button>
        )
      })()}
    </div>
  )

  // V10 §24.1: eligió "con un asesor" en la entrada y aún no tiene uno: se le pide elegirlo arriba.
  const pideAsesor = conBroker || datos.necesidades.some((n) => n.camino === 'con_asesor')
  const tarjetaBroker = porSuCuenta && (
    <div className={`${tarjeta} ${pideAsesor ? '' : 'border-linea'}`} style={pideAsesor ? { borderColor: verde } : undefined}>
      <span className={etiqueta} style={{ color: pideAsesor ? verde : undefined }}>{pideAsesor ? 'Elige tu asesor verificado' : '¿Quieres que un asesor te ayude?'}</span>
      <p className="text-[17px]">Con un asesor verificado accedes a toda la red y te acompaña en visitas, negociación y cierre.</p>
      <a href="/portal-inversion?broker=1" className={pideAsesor ? 'font-sans text-[16px] font-medium px-4 py-3 text-center text-white' : 'font-sans text-[15px]'}
        style={pideAsesor ? { background: verde } : { color: verde }}>{pideAsesor ? 'Ver asesores de mi zona' : 'Ver asesores de mi zona →'}</a>
    </div>
  )

  if (datos.necesidades.length === 0) {
    return (
      <>
        <EncabezadoPantalla ancho="max-w-[860px]" titulo={`Hola${nombre ? `, ${nombre}` : ''}.`}
          subtitulo="Cuéntanos qué buscas y ponemos a trabajar a la plataforma y a los asesores verificados." />
        <div className={tarjeta} style={{ borderColor: verde }}>
          <p className="text-[18px]">Describe lo que buscas: tipo, características, ubicación y presupuesto.</p>
          <a href="/buscar" className="font-sans text-[16px] font-medium px-4 py-3 text-center text-white" style={{ background: verde }}>Describir lo que busco</a>
        </div>
        {tarjetaBroker}
      </>
    )
  }

  return (
    <>
      <EncabezadoPantalla ancho="max-w-[860px]" titulo={`Listo${nombre ? `, ${nombre}` : ''}.`}
        subtitulo="SMT Match ya está buscando por ti. Aquí llega todo lo que encontramos y lo que te proponen los asesores." />

      {pideAsesor && tarjetaBroker}

      {/* V10 §25: con quién conectó ("Conectar") y en qué va cada una */}
      <ListaConexiones titulo="Tus conexiones" vacio="" ocultarVacia />

      <div className="flex items-center justify-between gap-2">
        <span className={`${etiqueta} text-tenue`}>Tus búsquedas</span>
        {activas.length < MAX_NECESIDADES_ACTIVAS && <a href="/buscar" className="font-sans text-[15px]" style={{ color: verde }}>+ Nueva búsqueda</a>}
      </div>
      {datos.necesidades.map((n) => (
        <div key={n.id} className={tarjeta} style={{ borderColor: n.vigente ? verde : 'var(--c-linea)', opacity: n.vigente ? 1 : 0.75 }}>
          <p className="text-[18px] font-medium">{n.resumen}</p>
          {n.detalle.length > 0 && <p className="text-[15px] text-tenue">{n.detalle.join(' · ')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {([['busqueda_directa', 'Búsqueda directa'], ['publicada_brokers', 'Propuestas de asesores']] as const).map(([k, t]) => (
              <button key={k} disabled={ocupado === n.id || !n.vigente} onClick={() => cambiar(n.id, { [k]: !n[k] })}
                className="px-3 py-2 text-[15px] border disabled:opacity-60 rounded-lg"
                style={n[k] ? { borderColor: verde, background: 'var(--c-verde-suave)' } : { borderColor: 'var(--c-linea)', color: 'var(--c-gris)' }}>
                {n[k] ? '✓ ' : ''}{t}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap text-[15px] text-tenue">
            <span>
              {n.vigente ? `Vigente ${diasPara(n.vence_at)} días más` : n.activa ? 'Venció' : 'En pausa'}
              {n.publicada_brokers ? ` · ${n.propuestas} ${n.propuestas === 1 ? 'propuesta' : 'propuestas'} de asesores` : ''}
            </span>
            <span className="flex gap-3">
              {n.vigente
                ? <>
                    {diasPara(n.vence_at) <= 7 && <button onClick={() => cambiar(n.id, { accion: 'renovar' })} disabled={ocupado === n.id} style={{ color: verde }}>Renovar</button>}
                    <button onClick={() => cambiar(n.id, { accion: 'pausar' })} disabled={ocupado === n.id} className="text-tenue hover:text-tinta">Pausar</button>
                  </>
                : <button onClick={() => cambiar(n.id, { accion: n.activa ? 'renovar' : 'activar' })} disabled={ocupado === n.id} style={{ color: verde }}>{n.activa ? 'Renovar 30 días' : 'Reactivar'}</button>}
            </span>
          </div>
        </div>
      ))}
      {error && <p className="text-[15px] text-error">{error}</p>}

      {/* V10 §24.3: el tablero de decisión. Tres bandas fijas, de más certeza a menos, que nunca se
          mezclan; dentro de cada banda, una columna por zona con las 3 mejores. */}
      <div className="flex flex-col gap-4" data-tablero>
        {conZona.length === 0 && datos.bandeja.length === 0 && (
          <p className="text-[16px] text-tinta-2">Todavía no hay opciones. Te avisamos en cuanto aparezca una coincidencia o un asesor te proponga algo.</p>
        )}
        {conZona.map((n) => (
          <div key={n.id} className="flex flex-col gap-3" data-tablero-busqueda={n.id}>
            <div className="flex flex-col gap-1">
              <span className="font-display text-[22px] font-medium">Tu tablero{conZona.length > 1 ? ` · ${n.resumen}` : ''}</span>
              {n.zonas.some((z) => z.rinde) && (
                <span className="text-[15px] text-tinta-2" data-rinde>
                  {n.operacion === 'renta' ? 'Lo que rinde tu renta' : 'Lo que rinde tu dinero'}:{' '}
                  {n.zonas.map((z) => `${z.nombre} ${z.rinde ? `~${z.rinde.m2.toLocaleString('es-MX')} m²` : 'sin dato'}`).join(' · ')}
                </span>
              )}
            </div>
            {BANDAS.map((b) => {
              const enBanda = (k: number) => enZona(n.id, k).filter(b.de).sort(b.id === 2 ? porAsesor : porPuntaje)
              const total = n.zonas.reduce((t, _z, k) => t + enBanda(k).length, 0)
              const interruptor = b.id === 1 ? 'busqueda_directa' : b.id === 2 ? 'publicada_brokers' : null
              const encendido = interruptor ? n[interruptor] : true
              return (
                <div key={b.id} className={`${tarjeta} border-linea`} data-banda={b.id}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-sans text-[14px] font-semibold uppercase tracking-wide" style={{ color: b.color }}>{b.id} · {b.titulo}{total ? ` · ${total}` : ''}</span>
                    {b.id === 2 && (
                      <button onClick={() => cambiar(n.id, { publicada_brokers: !n.publicada_brokers })} disabled={ocupado === n.id} data-interruptor-propuestas
                        className="flex items-center gap-2 text-[14px] text-tinta-2 disabled:opacity-60" aria-pressed={n.publicada_brokers}>
                        Recibir propuestas
                        <span className="w-9 h-5 rounded-full relative transition-colors" style={{ background: n.publicada_brokers ? verde : 'var(--c-linea-fuerte)' }}>
                          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: n.publicada_brokers ? '18px' : '2px' }} />
                        </span>
                      </button>
                    )}
                  </div>
                  {total === 0 ? (
                    <p className="text-[15px] text-tenue">
                      {!encendido && interruptor
                        ? <>{b.id === 1 ? 'Apagaste la búsqueda directa.' : 'Apagaste las propuestas de asesores.'}{' '}
                            <button onClick={() => cambiar(n.id, { [interruptor]: true })} disabled={ocupado === n.id} style={{ color: verde }}>{b.id === 1 ? 'Encenderla' : 'Encenderlas'}</button></>
                        : b.vacio}
                      {b.id === 3 && porSuCuenta && <> · <a href="/portal-inversion#radar" style={{ color: verde }}>Pega la liga de un anuncio que viste</a></>}
                    </p>
                  ) : (
                    <div className={`flex gap-3 overflow-x-auto pb-1 md:grid md:overflow-visible ${COLUMNAS[n.zonas.length] ?? ''}`}>
                      {n.zonas.map((z, k) => {
                        const lista = enBanda(k)
                        const clave = `${n.id}:${b.id}:${k}`
                        const visibles = abiertas.has(clave) ? lista : lista.slice(0, MEJORES_POR_ZONA)
                        return (
                          <div key={k} className="min-w-[80%] md:min-w-0 flex flex-col gap-1" data-zona-banda={k}>
                            <span className="text-[14px] font-medium text-tinta-2 uppercase tracking-wide">{z.nombre}</span>
                            {lista.length === 0
                              ? <p className="text-[15px] text-tenue border-t border-linea pt-2.5">Nada aquí todavía.</p>
                              : visibles.map((o) => verOpcion(o, b.id))}
                            {lista.length > MEJORES_POR_ZONA && (
                              <button onClick={() => alternar(clave)} className="w-fit font-sans text-[15px]" style={{ color: verde }}>
                                {abiertas.has(clave) ? 'Ver solo las 3 mejores' : `Ver las ${lista.length} →`}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {otras.length > 0 && (
          <div className={`${tarjeta} border-linea`} data-otras-opciones>
            <span className={`${etiqueta} text-tenue`}>{conZona.length ? 'Fuera de tus zonas' : 'Tus opciones'} · {otras.length}</span>
            {BANDAS.map((b) => {
              const lista = otras.filter(b.de)
              return lista.length > 0 && (
                <div key={b.id} className="flex flex-col gap-1">
                  <span className="font-sans text-[13px] font-semibold uppercase tracking-wide mt-1" style={{ color: b.color }}>{b.titulo}</span>
                  {lista.map((o) => verOpcion(o, b.id))}
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[15px] text-tenue">Marca &quot;Me interesa&quot; en cualquier banda y recibe el análisis: {activas.length > 0 && activas.every((n) => n.operacion === 'renta') ? 'renta contra mercado, lo que pagarías para entrar y cada mes' : 'precio contra mercado, plusvalía'} y si cumple lo que buscas. En el comparativo puedes juntar opciones de bandas distintas. Quien la ofrece no se entera.{datos.analizados.length > 0 && <> · <a href="/analisis" className="underline underline-offset-2" style={{ color: verde }}>Ver mi comparativo ({datos.analizados.length})</a></>}</p>
      </div>

      {!pideAsesor && tarjetaBroker}
    </>
  )
}
