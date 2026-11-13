'use client'

// Una conexión entre el comprador y quien ofrece la propiedad (Documento Maestro V8, Parte 3, §21).
// La usan las tres partes con la misma pantalla: el comprador (o su broker), quien ofrece la
// propiedad (broker o dueño) y Operación. Cada quien ve lo que le toca hacer:
//   conversación (§21.3) → visita: el comprador propone 2 o 3 horarios, la otra parte confirma uno
//   y se comparten los teléfonos (§21.4) → "¿cómo te fue?" → intención de oferta no vinculante
//   (§21.5) → cierre: lo reporta quien ofrece y lo confirma el comprador, que califica al broker
//   (§21.7). La plataforma no negocia ni cierra por nadie.
// Todo pasa por app/api/conexiones/[id].
import { EncabezadoPantalla } from '@/app/components/Banda'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRolUsuario } from '@/lib/useRolUsuario'
import Topbar from '../../components/Topbar'
import { millones, rentaTexto, PLAZOS_CONTRATO, GARANTIAS, ENTRADAS } from '@/lib/necesidad'
import { textoSolicitud, type SolicitudRenta } from '@/lib/conexion'

interface Detalle {
  conexion: {
    id: string; estado: string; origen: string; validacion: string; horarios_propuestos: string[]
    visita_at: string | null; visita_confirmada_at: string | null; visita_resultado: string | null
    oferta_monto: number | null; oferta_forma_pago: string | null; oferta_at: string | null
    cierre_precio: number | null; cierre_fecha: string | null; cierre_reportado_at: string | null; cierre_confirmado_at: string | null
    compro_respuesta: string | null; created_at: string; aporte?: Record<string, unknown>
    solicitud_renta: SolicitudRenta | null
  }
  /** V9 (§22.5): en renta, solicitud de renta, contrato firmado y "¿ya rentaste?". */
  operacion: 'compra' | 'renta'
  fichaRenta: { plazo_contrato?: string | null; garantia?: string | null; fecha_entrada?: string | null } | null
  rol: 'comprador' | 'contraparte' | 'broker_comprador' | 'operacion'
  fase: string; textoFase: string
  activo: { id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; superficie: number | null; precio_total: number | null; operacion?: string | null; renta_mensual?: number | null }
  partes: { comprador: string; contraparte: string; contraparteEsBroker: boolean; brokerComprador: string | null }
  telefonos: { comprador: string | null; contraparte: string | null } | null
  referencia: { rangoMinMXN: number | null; rangoMaxMXN: number | null; precioSalidaRecomendadoMXN: number | null; texto: string | null } | null
  mensajes: { id: string; autor: string; mio: boolean; texto: string; created_at: string }[]
  calificacion: { atencion: number; rapidez: number; honestidad: number; comentario: string | null } | null
  puedeCalificar: boolean
}

const verde = 'var(--c-verde)'
const GRID_BG = {
  backgroundImage:
    'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}
const tarjeta = 'bg-tarjeta border border-linea p-4 md:p-5 flex flex-col gap-2.5 rounded-xl'
const etiqueta = 'font-sans text-[14px] text-tenue'
const campo = 'w-full px-3 py-2.5 border border-linea bg-fondo/60 text-[17px] text-tinta focus:outline-none focus:border-gold-500 rounded-lg'
const botonPrimario = 'w-fit font-sans text-[15px] font-medium px-4 py-2.5 text-white disabled:opacity-50'
const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const cuando = (iso: string) => new Date(iso).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
const DIA = 86400_000

export default function ConexionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const rolUsuario = useRolUsuario()
  const [d, setD] = useState<Detalle | null>(null)
  const [ahora, setAhora] = useState(0) // hora de la última carga (no se lee el reloj al dibujar)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [texto, setTexto] = useState('')
  const [horarios, setHorarios] = useState(['', '', ''])
  const [oferta, setOferta] = useState({ monto: '', formaPago: 'contado' })
  const [solicitud, setSolicitud] = useState<{ plazo_contrato: string; garantia: string; fecha_entrada: string } | null>(null)
  const [cierre, setCierre] = useState({ precio: '', fecha: new Date().toISOString().slice(0, 10) })
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState({ atencion: 0, rapidez: 0, honestidad: 0, comentario: '' })
  const caja = useRef<HTMLDivElement>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/conexiones/${id}`, { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
    setD(j as Detalle)
    setAhora(Date.now())
    // La solicitud de renta arranca con lo que ya dijo en su ficha (o con la que ya envió).
    const f = (j as Detalle).conexion.solicitud_renta ?? (j as Detalle).fichaRenta
    setSolicitud((x) => x ?? { plazo_contrato: f?.plazo_contrato ?? '', garantia: f?.garantia ?? '', fecha_entrada: f?.fecha_entrada ?? '' })
  }, [id])
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await cargar()
    }
    init()
    // La conversación se refresca sola mientras la pantalla está abierta.
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)
    return () => clearInterval(t)
  }, [cargar, router])
  // Al último mensaje, moviendo solo el recuadro de la conversación (no la página).
  useEffect(() => { if (caja.current) caja.current.scrollTop = caja.current.scrollHeight }, [d?.mensajes.length])

  const accion = async (cuerpo: Record<string, unknown>) => {
    setOcupado(true); setError(null)
    const r = await fetch(`/api/conexiones/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(cuerpo),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo completar'); return false }
    await cargar()
    return true
  }

  if (!d) {
    return <div className="min-h-screen bg-fondo flex items-center justify-center"><p className={`text-[17px] font-sans ${error ? 'text-error' : 'text-tenue'}`}>{error ?? 'Cargando…'}</p></div>
  }

  const c = d.conexion
  const ladoComprador = d.rol === 'comprador' || d.rol === 'broker_comprador'
  const activa = c.estado === 'activa'
  const renta = d.operacion === 'renta'
  const visitaPasada = !!c.visita_at && new Date(c.visita_at).getTime() <= ahora
  const otraParte = ladoComprador
    ? `${d.partes.contraparte}${d.partes.contraparteEsBroker ? ' (asesor verificado)' : ' (dueño)'}`
    : `${d.partes.comprador}${d.partes.brokerComprador ? `, con su asesor ${d.partes.brokerComprador}` : ''}`
  const volver = d.rol === 'operacion' ? '/panel' : rolUsuario === 'broker' ? '/portal-broker?pestana=conexiones' : '/inicio'

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative flex flex-col flex-1">
        <Topbar rol={rolUsuario ?? undefined} />
        <main className="flex-1 px-4 md:px-6 pb-10">
          <div className="w-full max-w-[860px] mx-auto flex flex-col gap-4">
            <EncabezadoPantalla ancho="max-w-[860px]" titulo={d.activo.nombre}
              subtitulo={d.rol === 'operacion' ? `${d.partes.comprador} → ${d.partes.contraparte}` : `Con ${otraParte}`}>
              <a href={volver} className="font-sans text-[16px] text-tinta-2 hover:text-tinta w-fit -order-1">← Volver</a>
              <span className="font-sans text-[16px] font-semibold -order-1" style={{ color: verde }}>{d.textoFase}</span>
              <p className="text-[18px] text-tinta-2">
                {[renta ? (d.activo.renta_mensual ? rentaTexto(d.activo.renta_mensual) : null) : d.activo.precio_total ? millones(d.activo.precio_total) : null, d.activo.superficie ? `${d.activo.superficie.toLocaleString('es-MX')} m²` : null, [d.activo.colonia, d.activo.municipio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
            </EncabezadoPantalla>
            {error && <p className="text-[16px] text-error">{error}</p>}

            {c.estado === 'por_validar' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Por validar</span>
                {d.rol === 'operacion' ? (
                  <>
                    <p className="text-[16px] text-tinta-2">Validación manual ({c.origen === 'particular' ? 'propiedad de un particular' : 'propiedad de la red que no cumple toda la ficha'}). Revísala antes de ponerlos en contacto.</p>
                    <div className="flex gap-2">
                      <button onClick={() => accion({ accion: 'validar' })} disabled={ocupado} className={botonPrimario} style={{ background: verde }}>Validar</button>
                      <button onClick={() => accion({ accion: 'rechazar' })} disabled={ocupado} className="w-fit font-sans text-[15px] px-4 py-2.5 border border-linea text-tinta-2 rounded-lg">Rechazar</button>
                    </div>
                  </>
                ) : <p className="text-[16px] text-tinta-2">Operación revisa esta conexión antes de abrir la conversación. Te avisamos por correo.</p>}
              </div>
            )}
            {c.estado === 'rechazada' && <div className={tarjeta}><p className="text-[16px] text-tinta-2">Operación no aprobó esta conexión.</p></div>}

            {d.telefonos && (
              <div className={tarjeta} style={{ borderColor: verde }}>
                <span className={etiqueta}>Teléfonos · visita confirmada</span>
                <p className="text-[17px]">{ladoComprador ? d.partes.contraparte : d.partes.brokerComprador ?? d.partes.comprador}: <b>{(ladoComprador ? d.telefonos.contraparte : d.telefonos.comprador) ?? 'sin teléfono registrado'}</b></p>
              </div>
            )}

            {(activa || c.visita_at) && c.estado !== 'por_validar' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Visita</span>
                {c.visita_confirmada_at && c.visita_at ? (
                  <p className="text-[17px]">{visitaPasada ? 'Fue' : 'Confirmada para'} el <b>{cuando(c.visita_at)}</b>.</p>
                ) : c.horarios_propuestos.length ? (
                  d.rol === 'contraparte' ? (
                    <>
                      <p className="text-[16px] text-tinta-2">El comprador propone estos horarios. Elige uno:</p>
                      {c.horarios_propuestos.map((h) => (
                        <button key={h} onClick={() => accion({ accion: 'confirmar_visita', horario: h })} disabled={ocupado}
                          className="text-left px-3 py-2.5 border border-linea hover:border-verde text-[17px] rounded-lg">{cuando(h)} <span className="font-sans text-[14px]" style={{ color: verde }}>· Confirmar</span></button>
                      ))}
                    </>
                  ) : <p className="text-[16px] text-tinta-2">Propusiste: {c.horarios_propuestos.map(cuando).join(' · ')}. Esperando que confirme uno.</p>
                ) : !ladoComprador ? <p className="text-[16px] text-tinta-2">El comprador propondrá horarios para la visita.</p> : null}

                {ladoComprador && activa && !c.visita_confirmada_at && (
                  <>
                    <p className="text-[16px] text-tenue">{c.horarios_propuestos.length ? 'Puedes cambiar tu propuesta:' : 'Propón de 1 a 3 horarios para la visita:'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {horarios.map((h, i) => (
                        <input key={i} type="datetime-local" value={h} onChange={(e) => setHorarios((x) => x.map((y, k) => (k === i ? e.target.value : y)))} className={campo} />
                      ))}
                    </div>
                    <button disabled={ocupado || !horarios.some(Boolean)} className={botonPrimario} style={{ background: verde }}
                      onClick={async () => { if (await accion({ accion: 'proponer_horarios', horarios: horarios.filter(Boolean).map((h) => new Date(h).toISOString()) })) setHorarios(['', '', '']) }}>
                      Proponer horarios
                    </button>
                  </>
                )}

                {d.rol === 'comprador' && visitaPasada && !c.visita_resultado && activa && (
                  <div className="flex flex-col gap-2 border-t border-linea pt-2.5">
                    <p className="text-[17px] font-medium">¿Cómo te fue?</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'me_interesa' })} disabled={ocupado} className="px-3 py-2 border text-[16px] rounded-lg" style={{ borderColor: verde }}>Me interesa</button>
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'quiero_ofertar' })} disabled={ocupado} className="px-3 py-2 border text-[16px] rounded-lg" style={{ borderColor: verde }}>{renta ? 'Quiero rentarla' : 'Quiero ofertar'}</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo: precio, estado, ubicación…" className={campo} />
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'descarto', motivo })} disabled={ocupado} className="px-3 py-2 border border-linea text-[16px] text-tinta-2 shrink-0 rounded-lg">La descarto</button>
                    </div>
                  </div>
                )}
                {c.visita_resultado && <p className="text-[15px] text-tenue">Después de la visita: {c.visita_resultado === 'me_interesa' ? 'le interesa' : c.visita_resultado === 'quiero_ofertar' ? (renta ? 'quiere rentarla' : 'quiere ofertar') : 'la descartó'}.</p>}
              </div>
            )}

            {renta && (c.oferta_at || (ladoComprador && activa && !c.cierre_reportado_at)) && (
              <div className={tarjeta} data-solicitud-renta>
                <span className={etiqueta}>Solicitud de renta · no vinculante</span>
                {c.oferta_at && c.oferta_monto ? (
                  <p className="text-[17px]"><b>{rentaTexto(c.oferta_monto)}</b>{c.solicitud_renta ? ` · ${textoSolicitud(c.solicitud_renta)}` : ''} · enviada el {new Date(c.oferta_at).toLocaleDateString('es-MX')}.</p>
                ) : null}
                {ladoComprador && activa && !c.cierre_reportado_at && solicitud && (
                  <>
                    {d.referencia?.texto && <p className="text-[15px] text-tenue">Tu análisis: {d.referencia.texto}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={oferta.monto ? Number(oferta.monto).toLocaleString('es-MX') : ''} onChange={(e) => setOferta((x) => ({ ...x, monto: e.target.value.replace(/\D/g, '') }))}
                        inputMode="numeric" placeholder={d.activo.renta_mensual ? `Renta que ofreces al mes (pide ${d.activo.renta_mensual.toLocaleString('es-MX')})` : 'Renta que ofreces al mes'} className={campo} name="renta-ofrecida" />
                      <select value={solicitud.plazo_contrato} onChange={(e) => setSolicitud((x) => ({ ...x!, plazo_contrato: e.target.value }))} className={campo} name="plazo">
                        <option value="">Plazo del contrato</option>{PLAZOS_CONTRATO.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                      </select>
                      <select value={solicitud.garantia} onChange={(e) => setSolicitud((x) => ({ ...x!, garantia: e.target.value }))} className={campo} name="garantia">
                        <option value="">Garantía que das</option>{GARANTIAS.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                      </select>
                      <select value={solicitud.fecha_entrada} onChange={(e) => setSolicitud((x) => ({ ...x!, fecha_entrada: e.target.value }))} className={campo} name="entrada">
                        <option value="">¿Cuándo entras?</option>{ENTRADAS.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                      </select>
                    </div>
                    <button onClick={() => accion({ accion: 'oferta', monto: oferta.monto, ...solicitud })} disabled={ocupado || !oferta.monto || !solicitud.plazo_contrato} className={botonPrimario} style={{ background: verde }}>
                      {c.oferta_at ? 'Actualizar solicitud de renta' : 'Enviar solicitud de renta'}
                    </button>
                    <p className="text-[15px] text-tenue">Se envía como dato, no es un contrato. El contrato y la firma van por su cuenta{d.partes.brokerComprador ? ' con tu asesor' : ''}.</p>
                  </>
                )}
              </div>
            )}

            {!renta && (c.oferta_at || (ladoComprador && activa && !c.cierre_reportado_at)) && (
              <div className={tarjeta}>
                <span className={etiqueta}>Intención de oferta · no vinculante</span>
                {c.oferta_at && c.oferta_monto ? (
                  <p className="text-[17px]"><b>{pesos(c.oferta_monto)}</b> de {c.oferta_forma_pago === 'credito' ? 'crédito bancario' : c.oferta_forma_pago === 'infonavit' ? 'Infonavit / Fovissste' : 'contado'} · enviada el {new Date(c.oferta_at).toLocaleDateString('es-MX')}.</p>
                ) : null}
                {ladoComprador && activa && !c.cierre_reportado_at && (
                  <>
                    {d.referencia?.texto && <p className="text-[15px] text-tenue">Tu análisis: {d.referencia.texto}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={oferta.monto ? Number(oferta.monto).toLocaleString('es-MX') : ''} onChange={(e) => setOferta((x) => ({ ...x, monto: e.target.value.replace(/\D/g, '') }))}
                        inputMode="numeric" placeholder="Monto (MXN)" className={campo} />
                      <select value={oferta.formaPago} onChange={(e) => setOferta((x) => ({ ...x, formaPago: e.target.value }))} className={campo}>
                        <option value="contado">Contado</option><option value="credito">Crédito bancario</option><option value="infonavit">Infonavit / Fovissste</option>
                      </select>
                    </div>
                    <button onClick={() => accion({ accion: 'oferta', monto: oferta.monto, formaPago: oferta.formaPago })} disabled={ocupado || !oferta.monto} className={botonPrimario} style={{ background: verde }}>
                      {c.oferta_at ? 'Actualizar intención de oferta' : 'Enviar intención de oferta'}
                    </button>
                    <p className="text-[15px] text-tenue">Se envía como dato, no es un contrato. La negociación, el contrato y la notaría van por su cuenta{d.partes.brokerComprador ? ' con tu asesor' : '; para eso te conviene un asesor verificado'}.</p>
                  </>
                )}
              </div>
            )}

            {(c.cierre_reportado_at || (d.rol === 'contraparte' && activa)) && (
              <div className={tarjeta}>
                <span className={etiqueta}>{renta ? 'Contrato de renta' : 'Cierre'}</span>
                {c.cierre_reportado_at ? (
                  <>
                    <p className="text-[17px]">{renta ? 'Contrato firmado' : 'Cierre reportado'}: <b>{renta ? rentaTexto(c.cierre_precio ?? 0) : pesos(c.cierre_precio ?? 0)}</b> · {c.cierre_fecha}. {c.cierre_confirmado_at ? <span style={{ color: verde }}>Confirmado por {renta ? 'quien renta' : 'el comprador'} ✓</span> : <span className="text-tenue">Falta la confirmación {renta ? 'de quien renta' : 'del comprador'}.</span>}</p>
                    {d.rol === 'comprador' && !c.cierre_confirmado_at && (
                      <button onClick={() => accion({ accion: 'confirmar_cierre' })} disabled={ocupado} className={botonPrimario} style={{ background: verde }}>{renta ? 'Confirmo que firmé el contrato' : 'Confirmo que compré'}</button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[16px] text-tinta-2">{renta ? 'Cuando se firme el contrato, repórtalo aquí. Quien renta lo confirma y queda como renta verificada.' : 'Cuando se firme, repórtalo aquí. El comprador lo confirma y queda como cierre verificado.'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={cierre.precio ? Number(cierre.precio).toLocaleString('es-MX') : ''} onChange={(e) => setCierre((x) => ({ ...x, precio: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={renta ? 'Renta mensual del contrato (MXN)' : 'Precio de cierre (MXN)'} className={campo} name="cierre-precio" />
                      <input type="date" value={cierre.fecha} onChange={(e) => setCierre((x) => ({ ...x, fecha: e.target.value }))} className={campo} />
                    </div>
                    <button onClick={() => accion({ accion: 'reportar_cierre', ...cierre })} disabled={ocupado || !cierre.precio} className={botonPrimario} style={{ background: verde }}>{renta ? 'Reportar contrato firmado' : 'Reportar cierre'}</button>
                  </>
                )}
                {d.puedeCalificar && (
                  <div className="flex flex-col gap-2 border-t border-linea pt-2.5">
                    <p className="text-[17px] font-medium">Califica al asesor</p>
                    {(['atencion', 'rapidez', 'honestidad'] as const).map((k) => (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-[16px] w-24 capitalize">{k === 'atencion' ? 'Atención' : k}</span>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setNotas((x) => ({ ...x, [k]: n }))} className="text-[22px] leading-none" style={{ color: notas[k] >= n ? 'var(--c-oro)' : '#3a4560' }} aria-label={`${n} de 5`}>★</button>
                        ))}
                      </div>
                    ))}
                    <input value={notas.comentario} onChange={(e) => setNotas((x) => ({ ...x, comentario: e.target.value }))} placeholder="Comentario (opcional)" className={campo} />
                    <button onClick={() => accion({ accion: 'calificar', ...notas })} disabled={ocupado || !notas.atencion || !notas.rapidez || !notas.honestidad} className={botonPrimario} style={{ background: verde }}>Enviar calificación</button>
                  </div>
                )}
                {d.calificacion && <p className="text-[15px] text-tenue">Calificación: atención {d.calificacion.atencion}/5 · rapidez {d.calificacion.rapidez}/5 · honestidad {d.calificacion.honestidad}/5.</p>}
              </div>
            )}

            {d.rol === 'comprador' && activa && !c.cierre_reportado_at && ahora - new Date(c.created_at).getTime() >= 30 * DIA && (
              <div className={tarjeta}>
                <span className={etiqueta}>{renta ? '¿Ya rentaste?' : '¿Ya compraste?'}</span>
                <div className="flex flex-wrap gap-2">
                  {([['si_esta', 'Sí, esta'], ['otra', renta ? 'Renté otra' : 'Compré otra'], ['no_aun', 'Todavía no']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => accion({ accion: 'compre', respuesta: v })} disabled={ocupado} className="px-3 py-2 border text-[16px] rounded-lg"
                      style={c.compro_respuesta === v ? { borderColor: verde, background: 'var(--c-verde-suave)' } : { borderColor: 'var(--c-linea)' }}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            {c.estado !== 'por_validar' && c.estado !== 'rechazada' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Conversación</span>
                <div ref={caja} className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
                  {d.mensajes.length === 0 && <p className="text-[16px] text-tenue">Todavía no hay mensajes. {activa ? 'Escribe el primero.' : ''}</p>}
                  {d.mensajes.map((m) => (
                    <div key={m.id} className={`max-w-[85%] px-3 py-2 ${m.mio ? 'self-end bg-verde/15' : 'self-start bg-fondo/70'}`}>
                      <p className="text-[14px] text-tenue">{m.mio ? 'Tú' : m.autor} · {new Date(m.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                      <p className="text-[17px] whitespace-pre-wrap break-words">{m.texto}</p>
                    </div>
                  ))}
                </div>
                {activa && d.rol !== 'operacion' && (
                  <form onSubmit={async (e) => { e.preventDefault(); if (texto.trim() && await accion({ accion: 'mensaje', texto })) setTexto('') }} className="flex gap-2">
                    <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" maxLength={2000} className={campo} />
                    <button disabled={ocupado || !texto.trim()} className="font-sans text-[15px] px-4 text-white disabled:opacity-50 shrink-0" style={{ background: verde }}>Enviar</button>
                  </form>
                )}
                <p className="text-[14px] text-tenue">Los teléfonos se comparten al confirmar la visita. Ciertix conecta y da seguimiento; no negocia ni cierra por nadie.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
