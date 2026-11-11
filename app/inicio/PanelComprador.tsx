'use client'

// Panel de quien compra (ver app/inicio/page.tsx), Documento Maestro V8, Parte 1:
//   - Tus búsquedas (§19.1, §19.5): cada ficha con sus dos caminos (búsqueda directa y publicada a
//     brokers), su vigencia de 30 días y cuántas propuestas lleva; pausar, renovar y crear otra
//     (hasta 3 activas, en /buscar).
//   - Tu bandeja (§19.4): todas las opciones en un solo lugar, con su etiqueta de origen.
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
  zonas: { nombre: string; municipio: string; precioM2: number | null; comparables: number; rinde: { m2: number; faltaPct: number | null } | null }[]
}
interface Opcion {
  clave: string; origen: 'broker' | 'certificada' | 'particular' | 'portal'; titulo: string; tipo: string | null
  municipio: string | null; precio: number | null; superficie: number | null; url?: string; fuente?: string
  broker?: { nombre: string; nivel: string }; certificada?: boolean; activoId?: string; necesidadId?: string
  opcionId?: string; anuncioId?: string; lectura?: string | null; colonia?: string | null
  zona?: number; puntaje?: number; razones?: string[]; operacion?: 'compra' | 'renta'; detalleRenta?: string[]
}
interface Datos { conBroker: boolean; necesidades: Busqueda[]; bandeja: Opcion[]; analizados: string[] }

const verde = 'var(--c-verde)'
const tarjeta = 'bg-tarjeta border p-4 md:p-5 flex flex-col gap-2.5 rounded-xl'
const etiqueta = 'font-sans text-[14px]'

// §19.4: la etiqueta dice de dónde viene cada opción.
const ORIGEN: Record<Opcion['origen'], { texto: string; color: string }> = {
  broker: { texto: 'Propuesta por broker verificado', color: 'var(--c-oro)' },
  certificada: { texto: 'Certificada por SMTBROKER', color: verde },
  particular: { texto: 'Particular', color: 'var(--c-gris)' },
  portal: { texto: 'De portal · no certificada', color: 'var(--c-gris)' },
}

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
      body: JSON.stringify(o.activoId ? { activoId: o.activoId, necesidadId: o.necesidadId } : { anuncioId: o.anuncioId }),
    })
    const j = await r.json().catch(() => ({}))
    setAnalizando(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo analizar'); return }
    router.push(`/analisis#${id}`)
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
  const enZona = (nid: string, k: number) => datos.bandeja.filter((o) => o.necesidadId === nid && o.zona === k).sort(porPuntaje)
  const conZona = activas.filter((n) => n.zonas?.length)
  const otras = datos.bandeja.filter((o) => !conZona.some((n) => n.id === o.necesidadId && o.zona != null && o.zona >= 0))
  const alternar = (clave: string) => setAbiertas((x) => { const y = new Set(x); if (y.has(clave)) y.delete(clave); else y.add(clave); return y })

  const verOpcion = (o: Opcion) => (
    <div key={o.clave} className="border-t border-linea pt-2.5 flex flex-col gap-1" data-opcion={o.clave}>
      <span className="font-sans text-[13px]" style={{ color: ORIGEN[o.origen].color }}>
        {ORIGEN[o.origen].texto}{o.origen === 'broker' && o.broker ? ` · ${o.broker.nombre}${o.broker.nivel ? ` (${o.broker.nivel})` : ''}` : ''}{o.origen === 'broker' && o.certificada ? ' · certificada' : ''}
      </span>
      {o.url
        ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-[17px] underline underline-offset-2 decoration-linea-fuerte">{o.titulo}</a>
        : <span className="text-[17px]">{o.titulo}</span>}
      <span className="text-[15px] text-tenue">
        {[o.precio ? dinero(o.precio, o.operacion) : null, o.superficie ? `${o.superficie.toLocaleString('es-MX')} m²` : null, o.colonia || o.municipio, o.fuente].filter(Boolean).join(' · ') || 'Abre el anuncio para ver los detalles'}
      </span>
      {o.puntaje != null && o.origen !== 'portal' && (
        <span className="text-[14px] text-tinta-2"><b className="font-semibold" style={{ color: verde }}>{o.puntaje} %</b>{o.razones?.length ? ` · ${o.razones.join(' · ')}` : ''}</span>
      )}
      {o.origen === 'portal' && accionesAnuncio(o)}
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

  const tarjetaBroker = porSuCuenta && (
    <div className={`${tarjeta} ${conBroker ? '' : 'border-linea'}`} style={conBroker ? { borderColor: verde } : undefined}>
      <span className={etiqueta} style={{ color: conBroker ? verde : undefined }}>{conBroker ? 'Elige tu broker verificado' : '¿Quieres que un broker te acompañe?'}</span>
      <p className="text-[17px]">Con un broker verificado accedes a toda la red y te acompaña en visitas, negociación y cierre.</p>
      <a href="/portal-inversion?broker=1" className={conBroker ? 'font-sans text-[16px] font-medium px-4 py-3 text-center text-white' : 'font-sans text-[15px]'}
        style={conBroker ? { background: verde } : { color: verde }}>{conBroker ? 'Ver brokers de mi zona' : 'Ver brokers de mi zona →'}</a>
    </div>
  )

  if (datos.necesidades.length === 0) {
    return (
      <>
        <EncabezadoPantalla ancho="max-w-[860px]" titulo={`Hola${nombre ? `, ${nombre}` : ''}.`}
          subtitulo="Cuéntanos qué buscas y ponemos a trabajar a la plataforma y a los brokers verificados." />
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
        subtitulo="Smart Bróker ya está buscando por ti. Aquí llega todo lo que encontramos y lo que te proponen los brokers." />

      {conBroker && tarjetaBroker}

      {/* V8 Parte 3: las propiedades que pidió ver ("Quiero verla") y en qué va cada una */}
      <ListaConexiones titulo="Propiedades que pediste ver" vacio="" ocultarVacia />

      <div className="flex items-center justify-between gap-2">
        <span className={`${etiqueta} text-tenue`}>Tus búsquedas</span>
        {activas.length < MAX_NECESIDADES_ACTIVAS && <a href="/buscar" className="font-sans text-[15px]" style={{ color: verde }}>+ Nueva búsqueda</a>}
      </div>
      {datos.necesidades.map((n) => (
        <div key={n.id} className={tarjeta} style={{ borderColor: n.vigente ? verde : 'var(--c-linea)', opacity: n.vigente ? 1 : 0.75 }}>
          <p className="text-[18px] font-medium">{n.resumen}</p>
          {n.detalle.length > 0 && <p className="text-[15px] text-tenue">{n.detalle.join(' · ')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {([['busqueda_directa', 'Búsqueda directa'], ['publicada_brokers', 'Publicada a brokers']] as const).map(([k, t]) => (
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
              {n.publicada_brokers ? ` · ${n.propuestas} ${n.propuestas === 1 ? 'propuesta' : 'propuestas'} de brokers` : ''}
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

      <div className="flex flex-col gap-3" data-bandeja>
        <span className={`${etiqueta} text-tenue`}>Tu bandeja · {datos.bandeja.length}</span>
        {datos.bandeja.length === 0 && conZona.length === 0 && (
          <p className="text-[16px] text-tinta-2">Todavía no hay opciones. Te avisamos en cuanto un broker te proponga algo o aparezca una coincidencia.</p>
        )}
        {conZona.map((n) => (
          <div key={n.id} className="flex flex-col gap-2" data-bandeja-busqueda={n.id}>
            {conZona.length > 1 && <span className="text-[16px] font-medium text-tinta-2">{n.resumen}</span>}
            <div className={`grid grid-cols-1 gap-3 ${COLUMNAS[n.zonas.length] ?? ''}`}>
              {n.zonas.map((z, k) => {
                const lista = enZona(n.id, k)
                const clave = `${n.id}:${k}`
                const visibles = abiertas.has(clave) ? lista : lista.slice(0, MEJORES_POR_ZONA)
                return (
                  <div key={k} className={`${tarjeta} border-linea`} data-zona-bandeja={k}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-display text-[20px] font-medium">{z.nombre}</span>
                      <span className="text-[15px] text-tenue">
                        {lista.length} {lista.length === 1 ? 'opción' : 'opciones'}{z.precioM2 ? ` · ~$${z.precioM2.toLocaleString('es-MX')}/m²${n.operacion === 'renta' ? ' al mes' : ''} (${z.comparables} comparables)` : ''}
                      </span>
                      {z.rinde && (
                        <span className="text-[15px] text-tinta-2">
                          {n.operacion === 'renta' ? 'Con tu renta' : 'Con tu presupuesto'}, ~{z.rinde.m2.toLocaleString('es-MX')} m²
                          {z.rinde.faltaPct != null && z.rinde.faltaPct > 0 && <span className="text-aviso"> · {z.rinde.faltaPct} % abajo de lo que pides aquí</span>}
                        </span>
                      )}
                    </div>
                    {lista.length === 0
                      ? <p className="text-[15px] text-tenue border-t border-linea pt-2.5">Aún no hay opciones en {z.nombre}.</p>
                      : visibles.map(verOpcion)}
                    {lista.length > MEJORES_POR_ZONA && (
                      <button onClick={() => alternar(clave)} className="w-fit font-sans text-[15px]" style={{ color: verde }}>
                        {abiertas.has(clave) ? 'Ver solo las 3 mejores' : `Ver las ${lista.length} →`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {otras.length > 0 && (
          <div className={`${tarjeta} border-linea`} data-otras-opciones>
            <span className={`${etiqueta} text-tenue`}>{conZona.length ? 'Otras opciones' : 'Tus opciones'} · {otras.length}</span>
            {otras.map(verOpcion)}
          </div>
        )}
        <p className="text-[15px] text-tenue">Marca &quot;Me interesa&quot; y recibe el análisis: precio contra mercado, plusvalía y si cumple lo que buscas. Quien la ofrece no se entera.{datos.analizados.length > 0 && <> · <a href="/analisis" className="underline underline-offset-2" style={{ color: verde }}>Ver mi comparativo ({datos.analizados.length})</a></>}</p>
      </div>

      {porSuCuenta && (
        <div className={`${tarjeta} border-linea`}>
          <span className={`${etiqueta} text-tenue`}>¿Viste algo en otro portal?</span>
          <p className="text-[17px]">Pega la liga y le pedimos al anunciante que la certifique.</p>
          <a href="/portal-inversion#radar" className="font-sans text-[15px]" style={{ color: verde }}>Abrir mi Radar →</a>
        </div>
      )}

      {!conBroker && tarjetaBroker}
    </>
  )
}
