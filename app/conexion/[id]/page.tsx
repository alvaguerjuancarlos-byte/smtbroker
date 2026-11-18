'use client'

// Una conexión entre quien busca y quien ofrece la propiedad (Documento Maestro V10, §25: la
// plataforma SOLO CONECTA). La usan las tres partes con la misma pantalla: quien busca (o su asesor),
// quien ofrece (asesor o dueño) y Operación:
//   por validar → validada: los dos ven nombre, teléfono y botón de WhatsApp (§25.2) → quien busca
//   marca en qué va con un toque (Conectado, Ya la visité, Negociando, Cerré / Ya rento, La descarté
//   con motivo, §25.3) → cierre: lo reporta quien ofrece y lo confirma quien busca, que califica al
//   asesor (§25.5). Los mensajes dentro de la plataforma son opcionales.
// Se retiraron (sin borrar datos) la agenda de visita, el "¿cómo te fue?", la intención de oferta y
// la solicitud de renta (§25.6).
// Todo pasa por app/api/conexiones/[id].
import { EncabezadoPantalla } from '@/app/components/Banda'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRolUsuario } from '@/lib/useRolUsuario'
import Topbar from '../../components/Topbar'
import { millones, rentaTexto } from '@/lib/necesidad'
import { ESTADOS_CLIENTE, MOTIVOS_DESCARTE, etiquetaEstadoCliente, type EstadoCliente } from '@/lib/conexion'

interface Detalle {
  conexion: {
    id: string; estado: string; origen: string; validacion: string; horarios_propuestos: string[]
    visita_at: string | null; visita_confirmada_at: string | null; visita_resultado: string | null
    oferta_monto: number | null; oferta_forma_pago: string | null; oferta_at: string | null
    cierre_precio: number | null; cierre_fecha: string | null; cierre_reportado_at: string | null; cierre_confirmado_at: string | null
    compro_respuesta: string | null; created_at: string; aporte?: Record<string, unknown>
    estado_cliente?: EstadoCliente; motivo_descarte?: string | null
  }
  operacion: 'compra' | 'renta'
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
// Liga de WhatsApp con un mensaje de arranque. Teléfonos de 10 dígitos se toman como de México (+52).
const whatsapp = (tel: string | null, texto: string) => {
  const dig = (tel ?? '').replace(/\D/g, '')
  if (dig.length < 10) return null
  return `https://wa.me/${dig.length === 10 ? '52' + dig : dig}?text=${encodeURIComponent(texto)}`
}

export default function ConexionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const rolUsuario = useRolUsuario()
  const [d, setD] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [texto, setTexto] = useState('')
  const [cierre, setCierre] = useState({ precio: '', fecha: new Date().toISOString().slice(0, 10) })
  const [descartando, setDescartando] = useState(false)
  const [notas, setNotas] = useState({ atencion: 0, rapidez: 0, honestidad: 0, comentario: '' })
  const caja = useRef<HTMLDivElement>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/conexiones/${id}`, { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
    setD(j as Detalle)
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
              <span className="font-sans text-[16px] font-semibold -order-1" style={{ color: verde }}>{activa ? etiquetaEstadoCliente(c.estado_cliente, d.operacion) : d.textoFase}</span>
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
                ) : <p className="text-[16px] text-tinta-2">Operación revisa esta conexión. Al validarla, los dos reciben el nombre, el teléfono y el WhatsApp del otro. Te avisamos por correo.</p>}
              </div>
            )}
            {c.estado === 'rechazada' && <div className={tarjeta}><p className="text-[16px] text-tinta-2">Operación no aprobó esta conexión.</p></div>}

            {d.telefonos && (
              <div className={tarjeta} style={{ borderColor: verde }} data-contacto>
                <span className={etiqueta}>Contacto · ya pueden escribirse directo</span>
                {(() => {
                  const nombre = ladoComprador ? d.partes.contraparte : d.partes.brokerComprador ?? d.partes.comprador
                  const tel = ladoComprador ? d.telefonos!.contraparte : d.telefonos!.comprador
                  const wa = whatsapp(tel, `Hola ${nombre.split(' ')[0]}, te escribo por ${d.activo.nombre} (conectamos en SMT Match).`)
                  return (
                    <>
                      <p className="text-[17px]">{nombre}{ladoComprador && d.partes.contraparteEsBroker ? ' · asesor verificado' : ''}: <b>{tel ?? 'sin teléfono registrado'}</b></p>
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" data-whatsapp className={botonPrimario + ' rounded-lg'} style={{ background: '#1f8f4e' }}>Escribir por WhatsApp</a>}
                    </>
                  )
                })()}
              </div>
            )}

            {(activa || c.estado === 'descartada' || c.estado === 'cerrada') && (
              <div className={tarjeta} data-estado-cliente>
                <span className={etiqueta}>{ladoComprador ? '¿En qué va?' : `En qué va, según ${d.partes.comprador}`}</span>
                {ladoComprador && activa ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {ESTADOS_CLIENTE.map((e) => {
                        const actual = (c.estado_cliente ?? 'conectado') === e.id
                        return (
                          <button key={e.id} data-estado={e.id} disabled={ocupado || actual}
                            onClick={() => (e.id === 'descartada' ? setDescartando(true) : accion({ accion: 'estado', estado: e.id }))}
                            className="px-3 py-2 border text-[16px] rounded-lg disabled:cursor-default"
                            style={actual ? { borderColor: verde, background: 'var(--c-verde-suave)' } : { borderColor: 'var(--c-linea)' }}>
                            {renta ? e.renta : e.compra}
                          </button>
                        )
                      })}
                    </div>
                    {descartando && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-2.5" data-motivos>
                        <span className="text-[16px] text-tinta-2">¿Por qué la descartas?</span>
                        {MOTIVOS_DESCARTE.map((m) => (
                          <button key={m.id} data-motivo={m.id} disabled={ocupado}
                            onClick={async () => { if (await accion({ accion: 'estado', estado: 'descartada', motivo: m.id })) setDescartando(false) }}
                            className="px-3 py-1.5 border border-linea text-[15px] rounded-lg">{m.etiqueta}</button>
                        ))}
                      </div>
                    )}
                    <p className="text-[14px] text-tenue">Márcalo con un toque; así te avisamos qué sigue. La visita y la negociación las acuerdan directo.</p>
                  </>
                ) : (
                  <p className="text-[17px]">
                    {etiquetaEstadoCliente(c.estado_cliente, d.operacion)}
                    {c.estado_cliente === 'descartada' && c.motivo_descarte ? ` · ${MOTIVOS_DESCARTE.find((m) => m.id === c.motivo_descarte)?.etiqueta.toLowerCase() ?? c.motivo_descarte}` : ''}
                  </p>
                )}
              </div>
            )}

            {(c.cierre_reportado_at || (d.rol === 'contraparte' && activa)) && (
              <div className={tarjeta}>
                <span className={etiqueta}>{renta ? 'Renta' : 'Cierre'}</span>
                {c.cierre_reportado_at ? (
                  <>
                    <p className="text-[17px]">{renta ? 'Renta reportada' : 'Cierre reportado'}: <b>{renta ? rentaTexto(c.cierre_precio ?? 0) : pesos(c.cierre_precio ?? 0)}</b> · {c.cierre_fecha}. {c.cierre_confirmado_at ? <span style={{ color: verde }}>Confirmado por {renta ? 'quien renta' : 'el comprador'} ✓</span> : <span className="text-tenue">Falta la confirmación {renta ? 'de quien renta' : 'del comprador'}.</span>}</p>
                    {d.rol === 'comprador' && !c.cierre_confirmado_at && (
                      <button onClick={() => accion({ accion: 'confirmar_cierre' })} disabled={ocupado} className={botonPrimario} style={{ background: verde }}>{renta ? 'Confirmo que ya rento' : 'Confirmo que compré'}</button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[16px] text-tinta-2">{c.estado_cliente === 'cerrada'
                      ? `${d.partes.comprador} marcó que ${renta ? 'ya la renta' : 'ya cerró'}. Repórtalo con su ${renta ? 'renta mensual' : 'precio'} y fecha para que quede verificado.`
                      : renta ? 'Cuando quede rentada, repórtalo aquí. Quien renta lo confirma y queda como renta verificada.' : 'Cuando se firme, repórtalo aquí. El comprador lo confirma y queda como cierre verificado.'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={cierre.precio ? Number(cierre.precio).toLocaleString('es-MX') : ''} onChange={(e) => setCierre((x) => ({ ...x, precio: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={renta ? 'Renta mensual (MXN)' : 'Precio de cierre (MXN)'} className={campo} name="cierre-precio" />
                      <input type="date" value={cierre.fecha} onChange={(e) => setCierre((x) => ({ ...x, fecha: e.target.value }))} className={campo} />
                    </div>
                    <button onClick={() => accion({ accion: 'reportar_cierre', ...cierre })} disabled={ocupado || !cierre.precio} className={botonPrimario} style={{ background: verde }}>{renta ? 'Reportar renta' : 'Reportar cierre'}</button>
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

            {c.estado !== 'por_validar' && c.estado !== 'rechazada' && (
              <div className={tarjeta}>
                <span className={etiqueta}>Mensajes · opcional</span>
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
                <p className="text-[14px] text-tenue">Pueden escribirse aquí o directo por WhatsApp. SMT Match conecta y da seguimiento; no agenda, no negocia ni cierra por nadie.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
