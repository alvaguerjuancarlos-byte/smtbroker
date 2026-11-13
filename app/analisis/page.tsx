'use client'

// Análisis y comparativo del comprador (Documento Maestro V8, Parte 2, §20). Llega aquí al marcar
// "Me interesa" en su bandeja (/inicio). Por propiedad:
//   - precio contra mercado (semáforo, rango y margen de negociación), plusvalía a 3 y 5 años
//     (proyección), cumplimiento de su ficha y solidez del dato (§20.1);
//   - lo que depende del tipo y del propósito: costo total, mensualidad, uso de suelo, rendimiento
//     por renta (§20.2);
//   - lo legal: sello si está certificada o "no revisada legalmente" con el botón para pedirla (§20.3).
//   - "Quiero verla" (V8 Parte 3, §21.1): abre la conexión con quien la ofrece y revela su nombre.
//   - Un anuncio de portal (opción 2, 10-nov-2026) se analiza igual, marcado "De portal · no
//     certificada", con su liga original; en vez de "Quiero verla", se invita al anunciante a certificar.
// Con dos o más, el comparativo lado a lado (§20.4). Todo sale de app/api/analisis.
// V9 (§22.4): un análisis de una ficha de renta muestra renta contra mercado, costo de entrada y
// costo mensual, sin plusvalía; lo legal es la certificación de renta.
import { EncabezadoPantalla } from '../components/Banda'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../components/Topbar'
import { millones, rentaTexto } from '@/lib/necesidad'
import type { ResultadoAnalisis } from '@/lib/analisisServidor'

type Resultado = ResultadoAnalisis & { topeMensual?: string; certificacionPedidaAt?: string; origen?: { portal: string; url: string; lectura: string | null } }
interface Fila { id: string; activo_id: string | null; anuncio_id: string | null; resultado: Resultado; created_at: string }
const clave = (f: Fila) => (f.activo_id ?? f.anuncio_id)!

const verde = 'var(--c-verde)'
const GRID_BG = {
  backgroundImage:
    'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}
const SEMAFORO = {
  arriba: { texto: 'Arriba del mercado', color: 'var(--c-rojo)' },
  en_linea: { texto: 'En línea con el mercado', color: verde },
  abajo: { texto: 'Abajo del mercado', color: 'var(--c-oro)' },
} as const
const ICONO = { cumple: '✓', no_cumple: '✕', por_confirmar: '?' } as const
const COLOR_CRITERIO = { cumple: verde, no_cumple: 'var(--c-rojo)', por_confirmar: 'var(--c-gris)' } as const

const etiqueta = 'font-sans text-[14px] text-tenue'
const bloque = 'border-t border-linea pt-3 flex flex-col gap-1.5'
const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const enRenta = (r: Resultado) => r.operacion === 'renta'
/** Precio o renta de lo analizado: "$7.6M" o "$28,000 al mes". */
const cuanto = (r: Resultado) => enRenta(r) ? (r.activo.renta_mensual ? rentaTexto(r.activo.renta_mensual) : null) : (r.activo.precio_total ? millones(r.activo.precio_total) : null)
const montoDe = (r: Resultado) => (enRenta(r) ? r.activo.renta_mensual : r.activo.precio_total) ?? null

export default function AnalisisPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch('/api/analisis', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); setFilas([]); return }
    setFilas(j.analisis as Fila[])
  }, [])
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await cargar()
    }
    init()
  }, [cargar, router])
  // Al llegar desde "Me interesa" (/analisis#<activoId>), baja a esa propiedad.
  useEffect(() => {
    if (!filas?.length || !window.location.hash) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [filas])

  // "Quiero verla": crea la conexión (o abre la que ya existe) y lleva a la conversación.
  const quieroVerla = async (f: Fila) => {
    setOcupado(f.id + 'ver'); setError(null)
    const r = await fetch('/api/conexiones', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify({ activoId: f.activo_id }) })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo conectar'); return }
    router.push(`/conexion/${j.id}`)
  }

  const accion = async (f: Fila, tipo: 'quitar' | 'actualizar' | 'certificar') => {
    setOcupado(f.id + tipo); setError(null)
    const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }
    const r = tipo === 'quitar'
      ? await fetch(`/api/analisis/${f.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ descartar: true }) })
      : tipo === 'certificar'
        ? await fetch(`/api/analisis/${f.id}`, { method: 'POST', headers: h, body: JSON.stringify({ accion: 'pedir_certificacion' }) })
        : await fetch('/api/analisis', { method: 'POST', headers: h, body: JSON.stringify(f.activo_id ? { activoId: f.activo_id, actualizar: true } : { anuncioId: f.anuncio_id, actualizar: true }) })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo completar'); return }
    await cargar()
  }

  const comparar = (filas ?? []).length >= 2

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative flex flex-col flex-1">
        <Topbar rol="inversionista" />
        <main className="flex-1 px-4 md:px-6 pb-10">
          <div className="w-full max-w-[980px] mx-auto flex flex-col gap-4">
            <EncabezadoPantalla ancho="max-w-[980px]" titulo="Tu análisis"
              subtitulo="Contra el mercado, lo que te cuesta y si cumple lo que buscas. Quien ofrece la propiedad no se entera de que la analizaste.">
              <a href="/inicio" className="font-sans text-[16px] text-tinta-2 hover:text-tinta w-fit -order-1">← Mi bandeja</a>
            </EncabezadoPantalla>
            {error && <p className="text-[16px] text-error">{error}</p>}
            {filas === null ? <p className="text-tenue text-[16px] font-sans">Cargando…</p>
              : filas.length === 0 ? (
                <div className="bg-tarjeta border border-linea p-5 flex flex-col gap-2 rounded-xl">
                  <p className="text-[17px]">Todavía no analizas ninguna propiedad.</p>
                  <a href="/inicio" className="font-sans text-[15px]" style={{ color: verde }}>Marca &quot;Me interesa&quot; en tu bandeja →</a>
                </div>
              ) : null}

            {comparar && filas && (
              <div className="bg-tarjeta border border-linea p-4 md:p-5 flex flex-col gap-2 rounded-xl">
                <span className={etiqueta}>Comparativo · {filas.length} de 5</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-[15px] border-collapse min-w-[520px]">
                    <thead>
                      <tr>
                        <th className="text-left font-normal text-tenue py-1.5 pr-3" />
                        {filas.map((f) => <th key={f.id} className="text-left font-medium py-1.5 pr-3 align-bottom"><a href={`#${clave(f)}`} className="hover:underline">{f.resultado.activo.nombre}</a></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['Precio o renta', (r: Resultado) => cuanto(r) ?? '—'],
                        ['Por m²', (r: Resultado) => montoDe(r) && r.activo.superficie ? `${pesos(montoDe(r)! / r.activo.superficie)}${enRenta(r) ? ' al mes' : ''}` : '—'],
                        ['Contra mercado', (r: Resultado) => r.mercado.semaforo.estado ? SEMAFORO[r.mercado.semaforo.estado].texto.replace(' del mercado', '').replace(' con el mercado', '') : 'Sin dato'],
                        ['Plusvalía 5 años', (r: Resultado) => r.plusvalia ? `+${r.plusvalia.horizontes[1].pct} %` : enRenta(r) ? 'No aplica' : '—'],
                        ['Para entrar', (r: Resultado) => r.porTipo?.costoRenta ? pesos(r.porTipo.costoRenta.entrada) : '—'],
                        ['Cumple tu ficha', (r: Resultado) => r.cumplimiento ? `${r.cumplimiento.cumple} de ${r.cumplimiento.verificables}` : '—'],
                        ['Rendimiento por renta', (r: Resultado) => r.porTipo?.renta?.rendimiento ? `${r.porTipo.renta.rendimiento.capRatePct} %` : '—'],
                        ['Legal', (r: Resultado) => r.legal.certificada ? (enRenta(r) ? 'Certificada para renta' : 'Certificada') : 'Sin revisar'],
                      ] as [string, (r: Resultado) => string][]).map(([l, f]) => (
                        <tr key={l} className="border-t border-linea">
                          <td className="text-tenue py-2 pr-3 whitespace-nowrap">{l}</td>
                          {filas.map((x) => <td key={x.id} className="py-2 pr-3">{f(x.resultado)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {filas?.map((f) => {
              const r = f.resultado
              const sem = r.mercado.semaforo
              const p = r.mercado.precio
              return (
                <div key={f.id} id={clave(f)} className="bg-tarjeta border p-4 md:p-5 flex flex-col gap-3 scroll-mt-32 rounded-xl" style={{ borderColor: 'rgba(127,209,185,0.5)' }}>
                  <div className="flex flex-col gap-0.5">
                    {r.origen && <span className="font-sans text-[13px] text-[#8a93a3]">De portal ({r.origen.portal}) · no certificada{r.origen.lectura === 'capturado' ? ' · datos que escribiste' : ''}</span>}
                    <h2 className="font-display text-[23px] font-medium leading-tight">{r.activo.nombre}</h2>
                    <span className="text-[15px] text-tenue">
                      {[enRenta(r) ? 'En renta' : null, cuanto(r), r.activo.superficie ? `${r.activo.superficie.toLocaleString('es-MX')} m²` : null, [r.activo.colonia, r.activo.municipio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                    {r.origen && <a href={r.origen.url} target="_blank" rel="noopener noreferrer" className="font-sans text-[15px] w-fit" style={{ color: verde }}>Ver el anuncio original →</a>}
                  </div>

                  <div className={bloque}>
                    <span className={etiqueta}>{enRenta(r) ? 'Renta contra mercado' : 'Precio contra mercado'}</span>
                    {sem.estado && <span className="font-display text-[21px]" style={{ color: SEMAFORO[sem.estado].color }}>{SEMAFORO[sem.estado].texto}</span>}
                    <p className="text-[16px] text-tinta-2">{sem.texto}</p>
                    {sem.margenNegociacionMXN != null && <p className="text-[16px]">Margen de negociación de referencia: <b>{pesos(sem.margenNegociacionMXN)}{enRenta(r) ? ' al mes' : ''}</b></p>}
                    {p.precioPromedioM2Zona != null && <p className="text-[15px] text-tenue">{enRenta(r) ? `Renta por m² de la zona (mediana): ${pesos(p.precioPromedioM2Zona)} al mes` : `Precio/m² de la zona (mediana): ${pesos(p.precioPromedioM2Zona)}`}</p>}
                  </div>

                  {r.plusvalia && (
                    <div className={bloque}>
                      <span className={etiqueta}>Plusvalía · proyección</span>
                      <div className="grid grid-cols-2 gap-2">
                        {r.plusvalia.horizontes.map((h) => (
                          <div key={h.anios} className="bg-fondo/60 px-3 py-2.5">
                            <p className="font-sans text-[13px] text-tenue">En {h.anios} años</p>
                            <p className="font-display text-[22px]" style={{ color: 'var(--c-oro)' }}>+{h.pct} %</p>
                            <p className="text-[14px] text-tenue">rango {h.min} % a {h.max} %</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[15px] text-tenue">≈{r.plusvalia.tasaAnual} % anual compuesto. {r.plusvalia.nota} Fuente: {r.plusvalia.fuente}.{r.plusvalia.regional ? ` Contexto: ${r.plusvalia.regional.fuente}, ${r.plusvalia.regional.anual} % el último año.` : ''}</p>
                    </div>
                  )}

                  {r.cumplimiento && (
                    <div className={bloque}>
                      <span className={etiqueta}>¿Cumple lo que buscas? · {r.cumplimiento.cumple} de {r.cumplimiento.verificables}</span>
                      {r.cumplimiento.criterios.map((c) => (
                        <p key={c.criterio} className="text-[16px] flex gap-2">
                          <span className="w-4 shrink-0 text-center" style={{ color: COLOR_CRITERIO[c.estado] }}>{ICONO[c.estado]}</span>
                          <span><b className="font-medium">{c.criterio}:</b> <span className="text-tinta-2">{c.detalle}</span></span>
                        </p>
                      ))}
                    </div>
                  )}

                  {r.porTipo && (r.porTipo.costoTotal || r.porTipo.mensualidad || r.porTipo.usoSuelo || r.porTipo.renta || r.porTipo.costoRenta) && (
                    <div className={bloque}>
                      <span className={etiqueta}>Para tu decisión</span>
                      {r.porTipo.costoRenta && (
                        <div className="flex flex-col gap-1" data-costo-renta>
                          <p className="text-[16px]"><b className="font-medium">Para entrar:</b> {pesos(r.porTipo.costoRenta.entrada)} <span className="text-tenue">(depósito de {r.porTipo.costoRenta.depositoMeses} {r.porTipo.costoRenta.depositoMeses === 1 ? 'mes' : 'meses'} {pesos(r.porTipo.costoRenta.deposito)} + primer mes {pesos(r.porTipo.costoRenta.primerMes)}{r.porTipo.costoRenta.poliza ? ` + póliza jurídica ~${pesos(r.porTipo.costoRenta.poliza)}` : ''})</span></p>
                          <p className="text-[16px]"><b className="font-medium">Cada mes:</b> {pesos(r.porTipo.costoRenta.mensual)} <span className="text-tenue">{r.porTipo.costoRenta.mantenimiento === 0 ? '(mantenimiento incluido)' : r.porTipo.costoRenta.mantenimiento ? `(renta + mantenimiento de ${pesos(r.porTipo.costoRenta.mantenimiento)})` : '(renta; sin dato de mantenimiento)'}</span></p>
                          {r.porTipo.costoRenta.nota && <p className="text-[15px] text-tenue">{r.porTipo.costoRenta.nota}</p>}
                        </div>
                      )}
                      {r.porTipo.costoTotal && (
                        <p className="text-[16px]"><b className="font-medium">Costo total de compra:</b> {pesos(r.porTipo.costoTotal.totalMin)} a {pesos(r.porTipo.costoTotal.totalMax)}. <span className="text-tenue">{r.porTipo.costoTotal.nota}</span></p>
                      )}
                      {r.porTipo.mensualidad && (
                        <p className="text-[16px]"><b className="font-medium">Mensualidad estimada:</b> {pesos(r.porTipo.mensualidad.mensualidad)} (enganche {pesos(r.porTipo.mensualidad.enganche)}). <span className="text-tenue">{r.porTipo.mensualidad.supuestos}</span></p>
                      )}
                      {r.porTipo.usoSuelo && (
                        r.porTipo.usoSuelo.disponible
                          ? <p className="text-[16px]"><b className="font-medium">Uso de suelo:</b> {[r.porTipo.usoSuelo.uso, r.porTipo.usoSuelo.descripcion].filter(Boolean).join(' · ')}{r.porTipo.usoSuelo.cus != null ? ` · CUS ${r.porTipo.usoSuelo.cus}` : ''}{r.porTipo.usoSuelo.nivelesMax != null ? ` · hasta ${r.porTipo.usoSuelo.nivelesMax} niveles` : ''}. <span className="text-tenue">Fuente: {r.porTipo.usoSuelo.fuente}.</span></p>
                          : <p className="text-[16px]"><b className="font-medium">Uso de suelo:</b> <span className="text-tinta-2">{r.porTipo.usoSuelo.texto}</span></p>
                      )}
                      {/terreno/i.test(r.activo.tipo) && <p className="text-[15px] text-tenue">¿Qué conviene construir aquí? SMT Land analiza el mejor proyecto para este terreno.</p>}
                      {r.porTipo.renta && (
                        r.porTipo.renta.rendimiento
                          ? <p className="text-[16px]"><b className="font-medium">Si la rentas:</b> {pesos(r.porTipo.renta.rendimiento.rentaMensual)} al mes de referencia → <b>{r.porTipo.renta.rendimiento.capRatePct} % anual</b> (recuperas la inversión en ~{r.porTipo.renta.rendimiento.aniosRecuperar} años). <span className="text-tenue">Estimación con {r.porTipo.renta.precio.comparablesUsados} comparables de renta.</span>
                              {r.porTipo.renta.rendimiento.capRatePct > 15 && <span style={{ color: 'var(--c-oro)' }}> Ojo: un rendimiento tan alto suele indicar que el precio está muy abajo del mercado o que las rentas encontradas no son comparables. Revísalo antes de decidir.</span>}</p>
                          : <p className="text-[16px]"><b className="font-medium">Si la rentas:</b> <span className="text-tinta-2">{r.porTipo.renta.texto}</span></p>
                      )}
                    </div>
                  )}
                  {r.topeMensual && <p className="text-[15px] text-tenue">{r.topeMensual}</p>}

                  <div className={bloque}>
                    <span className={etiqueta}>Legal</span>
                    {r.legal.certificada ? (
                      <>
                        <span className="text-[17px]" style={{ color: verde }}>✓ {enRenta(r) ? 'Certificada para renta por Ciertix' : 'Certificada por Ciertix'}</span>
                        {'resumen' in r.legal && r.legal.resumen && <p className="text-[16px] text-tinta-2">{r.legal.resumen}</p>}
                      </>
                    ) : (
                      <>
                        <span className="text-[17px] text-tinta-2">{r.origen ? 'Anuncio de portal: no revisado legalmente' : 'No revisada legalmente'}</span>
                        {r.certificacionPedidaAt
                          ? <p className="text-[15px] text-tenue">{r.origen ? 'Pediste que el anunciante la certifique. Ciertix lo invita una sola vez; si acepta, te avisamos y podrás verla con las reglas de siempre.' : 'Pediste la certificación. Le avisamos a quien la ofrece; la plataforma se encarga.'}</p>
                          : <button onClick={() => accion(f, 'certificar')} disabled={!!ocupado} className="w-fit px-3 py-2 text-[15px] font-sans border disabled:opacity-60 rounded-lg" style={{ borderColor: verde, color: verde }}>
                              {ocupado === f.id + 'certificar' ? 'Enviando…' : r.origen ? 'Pedir que el anunciante la certifique' : 'Pedir que se certifique'}
                            </button>}
                      </>
                    )}
                  </div>

                  <div className={bloque}>
                    <span className={etiqueta}>Qué tan sólido es · {r.solidez.nivel}</span>
                    <p className="text-[15px] text-tenue">
                      {[r.solidez.comparablesVenta != null ? `${r.solidez.comparablesVenta} comparable${r.solidez.comparablesVenta === 1 ? '' : 's'} de venta` : null, r.solidez.comparablesRenta != null ? `${r.solidez.comparablesRenta} ${r.solidez.comparablesVenta != null ? 'de renta' : `comparable${r.solidez.comparablesRenta === 1 ? '' : 's'} de renta`}` : null].filter(Boolean).join(' y ')} de tamaño parecido · datos del {new Date(r.solidez.fechaDatos).toLocaleDateString('es-MX')}
                      {r.solidez.fuentes.length > 0 ? ` · fuentes: ${r.solidez.fuentes.join(', ')}` : ''}
                    </p>
                  </div>

                  {f.activo_id && <div className={bloque}>
                    <button onClick={() => quieroVerla(f)} disabled={!!ocupado} className="w-full font-sans text-[16px] font-medium px-4 py-3 text-white disabled:opacity-60" style={{ background: verde }}>
                      {ocupado === f.id + 'ver' ? 'Conectando…' : 'Quiero verla'}
                    </button>
                    <p className="text-[15px] text-tenue">Te conectamos con quien la ofrece para conversar y agendar la visita. Solo entonces sabrá tu nombre.</p>
                  </div>}

                  <div className="flex gap-4 flex-wrap pt-1">
                    <button onClick={() => accion(f, 'actualizar')} disabled={!!ocupado} className="font-sans text-[15px] disabled:opacity-60" style={{ color: verde }}>
                      {ocupado === f.id + 'actualizar' ? 'Actualizando… (hasta 1 min)' : 'Actualizar análisis'}
                    </button>
                    <button onClick={() => accion(f, 'quitar')} disabled={!!ocupado} className="font-sans text-[15px] text-tenue hover:text-tinta disabled:opacity-60">Quitar del comparativo</button>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}
