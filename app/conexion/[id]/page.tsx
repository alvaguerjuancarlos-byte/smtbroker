'use client'

// Una conexión entre el comprador y quien ofrece la propiedad (Documento Maestro V8, Parte 3, §21).
// La usan las tres partes con la misma pantalla: el comprador (o su broker), quien ofrece la
// propiedad (broker o dueño) y Operación. Cada quien ve lo que le toca hacer:
//   conversación (§21.3) → visita: el comprador propone 2 o 3 horarios, la otra parte confirma uno
//   y se comparten los teléfonos (§21.4) → "¿cómo te fue?" → intención de oferta no vinculante
//   (§21.5) → cierre: lo reporta quien ofrece y lo confirma el comprador, que califica al broker
//   (§21.7). La plataforma no negocia ni cierra por nadie.
// Todo pasa por app/api/conexiones/[id].
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRolUsuario } from '@/lib/useRolUsuario'
import Topbar from '../../components/Topbar'
import { millones } from '@/lib/necesidad'

interface Detalle {
  conexion: {
    id: string; estado: string; origen: string; validacion: string; horarios_propuestos: string[]
    visita_at: string | null; visita_confirmada_at: string | null; visita_resultado: string | null
    oferta_monto: number | null; oferta_forma_pago: string | null; oferta_at: string | null
    cierre_precio: number | null; cierre_fecha: string | null; cierre_reportado_at: string | null; cierre_confirmado_at: string | null
    compro_respuesta: string | null; created_at: string; aporte?: Record<string, unknown>
  }
  rol: 'comprador' | 'contraparte' | 'broker_comprador' | 'operacion'
  fase: string; textoFase: string
  activo: { id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; superficie: number | null; precio_total: number | null }
  partes: { comprador: string; contraparte: string; contraparteEsBroker: boolean; brokerComprador: string | null }
  telefonos: { comprador: string | null; contraparte: string | null } | null
  referencia: { rangoMinMXN: number | null; rangoMaxMXN: number | null; precioSalidaRecomendadoMXN: number | null; texto: string | null } | null
  mensajes: { id: string; autor: string; mio: boolean; texto: string; created_at: string }[]
  calificacion: { atencion: number; rapidez: number; honestidad: number; comentario: string | null } | null
  puedeCalificar: boolean
}

const verde = '#7fd1b9'
const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}
const tarjeta = 'bg-navy-800 border border-white/10 p-4 md:p-5 flex flex-col gap-2.5'
const etiqueta = 'font-plex-mono text-[11px] tracking-[0.08em] uppercase text-slate'
const campo = 'w-full px-3 py-2.5 border border-white/15 bg-navy-950/60 text-[14px] text-paper focus:outline-none focus:border-gold-500'
const botonPrimario = 'w-fit font-plex-mono text-[12.5px] px-4 py-2.5 text-navy-950 disabled:opacity-50'
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
  const [cierre, setCierre] = useState({ precio: '', fecha: new Date().toISOString().slice(0, 10) })
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState({ atencion: 0, rapidez: 0, honestidad: 0, comentario: '' })
  const fin = useRef<HTMLDivElement>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/conexiones/${id}`, { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
    setD(j as Detalle)
    setAhora(Date.now())
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
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [d?.mensajes.length])

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
    return <div className="min-h-screen bg-navy-950 flex items-center justify-center"><p className={`text-[14px] font-plex-mono ${error ? 'text-[#f3a3a3]' : 'text-slate'}`}>{error ?? 'Cargando…'}</p></div>
  }

  const c = d.conexion
  const ladoComprador = d.rol === 'comprador' || d.rol === 'broker_comprador'
  const activa = c.estado === 'activa'
  const visitaPasada = !!c.visita_at && new Date(c.visita_at).getTime() <= ahora
  const otraParte = ladoComprador
    ? `${d.partes.contraparte}${d.partes.contraparteEsBroker ? ' (broker verificado)' : ' (dueño)'}`
    : `${d.partes.comprador}${d.partes.brokerComprador ? `, con su broker ${d.partes.brokerComprador}` : ''}`
  const volver = d.rol === 'operacion' ? '/panel' : rolUsuario === 'broker' ? '/portal-broker?pestana=conexiones' : '/inicio'

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative flex flex-col flex-1">
        <Topbar rol={rolUsuario ?? undefined} />
        <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
          <div className="w-full max-w-[680px] mx-auto flex flex-col gap-4">
            <a href={volver} className="font-plex-mono text-[12px] text-gold-400 w-fit">← Volver</a>
            <div className="flex flex-col gap-1">
              <span className="font-plex-mono text-[11px] tracking-[0.08em] uppercase" style={{ color: verde }}>{d.textoFase}</span>
              <h1 className="font-display text-[25px] md:text-[29px] font-medium leading-tight">{d.activo.nombre}</h1>
              <p className="text-[13px] text-slate">
                {[d.activo.precio_total ? millones(d.activo.precio_total) : null, d.activo.superficie ? `${d.activo.superficie.toLocaleString('es-MX')} m²` : null, [d.activo.colonia, d.activo.municipio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
              <p className="text-[14px] text-paper-dim">{d.rol === 'operacion' ? `${d.partes.comprador} → ${d.partes.contraparte}` : `Con ${otraParte}`}</p>
            </div>
            {error && <p className="text-[13px] text-[#f3a3a3]">{error}</p>}

            {c.estado === 'por_validar' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Por validar</span>
                {d.rol === 'operacion' ? (
                  <>
                    <p className="text-[13.5px] text-paper-dim">Validación manual ({c.origen === 'particular' ? 'propiedad de un particular' : 'propiedad de la red que no cumple toda la ficha'}). Revísala antes de ponerlos en contacto.</p>
                    <div className="flex gap-2">
                      <button onClick={() => accion({ accion: 'validar' })} disabled={ocupado} className={botonPrimario} style={{ background: verde }}>Validar</button>
                      <button onClick={() => accion({ accion: 'rechazar' })} disabled={ocupado} className="w-fit font-plex-mono text-[12.5px] px-4 py-2.5 border border-white/15 text-paper-dim">Rechazar</button>
                    </div>
                  </>
                ) : <p className="text-[13.5px] text-paper-dim">Operación revisa esta conexión antes de abrir la conversación. Te avisamos por correo.</p>}
              </div>
            )}
            {c.estado === 'rechazada' && <div className={tarjeta}><p className="text-[13.5px] text-paper-dim">Operación no aprobó esta conexión.</p></div>}

            {d.telefonos && (
              <div className={tarjeta} style={{ borderColor: verde }}>
                <span className={etiqueta}>Teléfonos · visita confirmada</span>
                <p className="text-[14px]">{ladoComprador ? d.partes.contraparte : d.partes.brokerComprador ?? d.partes.comprador}: <b>{(ladoComprador ? d.telefonos.contraparte : d.telefonos.comprador) ?? 'sin teléfono registrado'}</b></p>
              </div>
            )}

            {(activa || c.visita_at) && c.estado !== 'por_validar' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Visita</span>
                {c.visita_confirmada_at && c.visita_at ? (
                  <p className="text-[14px]">{visitaPasada ? 'Fue' : 'Confirmada para'} el <b>{cuando(c.visita_at)}</b>.</p>
                ) : c.horarios_propuestos.length ? (
                  d.rol === 'contraparte' ? (
                    <>
                      <p className="text-[13.5px] text-paper-dim">El comprador propone estos horarios. Elige uno:</p>
                      {c.horarios_propuestos.map((h) => (
                        <button key={h} onClick={() => accion({ accion: 'confirmar_visita', horario: h })} disabled={ocupado}
                          className="text-left px-3 py-2.5 border border-white/15 hover:border-[#7fd1b9] text-[14px]">{cuando(h)} <span className="font-plex-mono text-[11px]" style={{ color: verde }}>· Confirmar</span></button>
                      ))}
                    </>
                  ) : <p className="text-[13.5px] text-paper-dim">Propusiste: {c.horarios_propuestos.map(cuando).join(' · ')}. Esperando que confirme uno.</p>
                ) : !ladoComprador ? <p className="text-[13.5px] text-paper-dim">El comprador propondrá horarios para la visita.</p> : null}

                {ladoComprador && activa && !c.visita_confirmada_at && (
                  <>
                    <p className="text-[13px] text-slate">{c.horarios_propuestos.length ? 'Puedes cambiar tu propuesta:' : 'Propón de 1 a 3 horarios para la visita:'}</p>
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
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
                    <p className="text-[14px] font-medium">¿Cómo te fue?</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'me_interesa' })} disabled={ocupado} className="px-3 py-2 border text-[13px]" style={{ borderColor: verde }}>Me interesa</button>
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'quiero_ofertar' })} disabled={ocupado} className="px-3 py-2 border text-[13px]" style={{ borderColor: verde }}>Quiero ofertar</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo: precio, estado, ubicación…" className={campo} />
                      <button onClick={() => accion({ accion: 'resultado_visita', resultado: 'descarto', motivo })} disabled={ocupado} className="px-3 py-2 border border-white/15 text-[13px] text-paper-dim shrink-0">La descarto</button>
                    </div>
                  </div>
                )}
                {c.visita_resultado && <p className="text-[12.5px] text-slate">Después de la visita: {c.visita_resultado === 'me_interesa' ? 'le interesa' : c.visita_resultado === 'quiero_ofertar' ? 'quiere ofertar' : 'la descartó'}.</p>}
              </div>
            )}

            {(c.oferta_at || (ladoComprador && activa && !c.cierre_reportado_at)) && (
              <div className={tarjeta}>
                <span className={etiqueta}>Intención de oferta · no vinculante</span>
                {c.oferta_at && c.oferta_monto ? (
                  <p className="text-[14px]"><b>{pesos(c.oferta_monto)}</b> de {c.oferta_forma_pago === 'credito' ? 'crédito bancario' : c.oferta_forma_pago === 'infonavit' ? 'Infonavit / Fovissste' : 'contado'} · enviada el {new Date(c.oferta_at).toLocaleDateString('es-MX')}.</p>
                ) : null}
                {ladoComprador && activa && !c.cierre_reportado_at && (
                  <>
                    {d.referencia?.texto && <p className="text-[12.5px] text-slate">Tu análisis: {d.referencia.texto}</p>}
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
                    <p className="text-[12px] text-slate">Se envía como dato, no es un contrato. La negociación, el contrato y la notaría van por su cuenta{d.partes.brokerComprador ? ' con tu broker' : '; para eso te conviene un broker verificado'}.</p>
                  </>
                )}
              </div>
            )}

            {(c.cierre_reportado_at || (d.rol === 'contraparte' && activa)) && (
              <div className={tarjeta}>
                <span className={etiqueta}>Cierre</span>
                {c.cierre_reportado_at ? (
                  <>
                    <p className="text-[14px]">Cierre reportado: <b>{pesos(c.cierre_precio ?? 0)}</b> · {c.cierre_fecha}. {c.cierre_confirmado_at ? <span style={{ color: verde }}>Confirmado por el comprador ✓</span> : <span className="text-slate">Falta la confirmación del comprador.</span>}</p>
                    {d.rol === 'comprador' && !c.cierre_confirmado_at && (
                      <button onClick={() => accion({ accion: 'confirmar_cierre' })} disabled={ocupado} className={botonPrimario} style={{ background: verde }}>Confirmo que compré</button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-paper-dim">Cuando se firme, repórtalo aquí. El comprador lo confirma y queda como cierre verificado.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={cierre.precio ? Number(cierre.precio).toLocaleString('es-MX') : ''} onChange={(e) => setCierre((x) => ({ ...x, precio: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="Precio de cierre (MXN)" className={campo} />
                      <input type="date" value={cierre.fecha} onChange={(e) => setCierre((x) => ({ ...x, fecha: e.target.value }))} className={campo} />
                    </div>
                    <button onClick={() => accion({ accion: 'reportar_cierre', ...cierre })} disabled={ocupado || !cierre.precio} className={botonPrimario} style={{ background: verde }}>Reportar cierre</button>
                  </>
                )}
                {d.puedeCalificar && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
                    <p className="text-[14px] font-medium">Califica al broker</p>
                    {(['atencion', 'rapidez', 'honestidad'] as const).map((k) => (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-[13px] w-24 capitalize">{k === 'atencion' ? 'Atención' : k}</span>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setNotas((x) => ({ ...x, [k]: n }))} className="text-[20px] leading-none" style={{ color: notas[k] >= n ? '#d9b45a' : '#3a4560' }} aria-label={`${n} de 5`}>★</button>
                        ))}
                      </div>
                    ))}
                    <input value={notas.comentario} onChange={(e) => setNotas((x) => ({ ...x, comentario: e.target.value }))} placeholder="Comentario (opcional)" className={campo} />
                    <button onClick={() => accion({ accion: 'calificar', ...notas })} disabled={ocupado || !notas.atencion || !notas.rapidez || !notas.honestidad} className={botonPrimario} style={{ background: verde }}>Enviar calificación</button>
                  </div>
                )}
                {d.calificacion && <p className="text-[12.5px] text-slate">Calificación: atención {d.calificacion.atencion}/5 · rapidez {d.calificacion.rapidez}/5 · honestidad {d.calificacion.honestidad}/5.</p>}
              </div>
            )}

            {d.rol === 'comprador' && activa && !c.cierre_reportado_at && ahora - new Date(c.created_at).getTime() >= 30 * DIA && (
              <div className={tarjeta}>
                <span className={etiqueta}>¿Ya compraste?</span>
                <div className="flex flex-wrap gap-2">
                  {([['si_esta', 'Sí, esta'], ['otra', 'Compré otra'], ['no_aun', 'Todavía no']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => accion({ accion: 'compre', respuesta: v })} disabled={ocupado} className="px-3 py-2 border text-[13px]"
                      style={c.compro_respuesta === v ? { borderColor: verde, background: 'rgba(127,209,185,0.12)' } : { borderColor: 'rgba(255,255,255,0.15)' }}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            {c.estado !== 'por_validar' && c.estado !== 'rechazada' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Conversación</span>
                <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
                  {d.mensajes.length === 0 && <p className="text-[13px] text-slate">Todavía no hay mensajes. {activa ? 'Escribe el primero.' : ''}</p>}
                  {d.mensajes.map((m) => (
                    <div key={m.id} className={`max-w-[85%] px-3 py-2 ${m.mio ? 'self-end bg-[#7fd1b9]/15' : 'self-start bg-navy-950/70'}`}>
                      <p className="text-[11px] text-slate">{m.mio ? 'Tú' : m.autor} · {new Date(m.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                      <p className="text-[14px] whitespace-pre-wrap break-words">{m.texto}</p>
                    </div>
                  ))}
                  <div ref={fin} />
                </div>
                {activa && d.rol !== 'operacion' && (
                  <form onSubmit={async (e) => { e.preventDefault(); if (texto.trim() && await accion({ accion: 'mensaje', texto })) setTexto('') }} className="flex gap-2">
                    <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" maxLength={2000} className={campo} />
                    <button disabled={ocupado || !texto.trim()} className="font-plex-mono text-[12.5px] px-4 text-navy-950 disabled:opacity-50 shrink-0" style={{ background: verde }}>Enviar</button>
                  </form>
                )}
                <p className="text-[11.5px] text-slate">Los teléfonos se comparten al confirmar la visita. SMTBROKER conecta y da seguimiento; no negocia ni cierra por nadie.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
