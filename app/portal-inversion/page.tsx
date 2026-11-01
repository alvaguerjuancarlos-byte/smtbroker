'use client'

// Portal del comprador/inversionista — capa "Personas" del Agente de Atracción (ver
// SMTBROKER_Agente_Atraccion_V1.docx, Sección 3: registro directo/autoservicio, sin prospección
// en frío). Es la primera pantalla propia para este rol — antes caían al /dashboard de
// propietario, que siempre les mostraba "0 activos" porque está armado para "mis activos".
//
// Todavía no existe motor de matching (ver Documento Maestro V5, Sección 3.3 / Arquitectura y
// Retos Tecnológicos V2) — el listado de abajo es TODOS los activos cargados, sin filtro de
// disponibilidad ni cruce con el perfil. Cuando exista el motor real, este listado se reemplaza
// por matches de verdad.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../components/Topbar'
import { Field, inputCls } from '../components/FormField'
import { ElegirBroker } from '../components/ElegirBroker'
import { RadarMercado } from './RadarMercado'

interface PerfilIntencion {
  presupuesto: string
  zona: string
  tipo_activo_interes: string
  tesis_inversion: string
}

interface Activo {
  id: string
  nombre: string
  tipo: string
  municipio: string
  estado: string
  superficie: number | null
  precio_total: number | null
  created_at: string
}

interface Coincidencia {
  activoId: string; perfilId: string; score: number; razones: string[]; solicitud: string | null
  /** V7.1: cuando Operación la pone en contacto, quién atiende al vendedor (su broker o él mismo). */
  contacto?: { nombre: string; correo: string | null; esBroker: boolean; telefono?: string | null }
  activo: { id: string; nombre: string; tipo: string; municipio: string; estado: string; superficie: number | null; precio_total: number | null }
}

const PRESUPUESTOS = ['Menos de $2M', '$2M – $5M', '$5M – $15M', '$15M – $50M', 'Más de $50M']

const PERFIL_VACIO: PerfilIntencion = { presupuesto: '', zona: '', tipo_activo_interes: '', tesis_inversion: '' }

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export default function PortalInversionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [tienePerfil, setTienePerfil] = useState(false)
  const [editando, setEditando] = useState(false)
  const [perfil, setPerfil] = useState<PerfilIntencion>(PERFIL_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorPerfil, setErrorPerfil] = useState('')
  const [activos, setActivos] = useState<Activo[]>([])
  // Fase B: coincidencias con su perfil (app/api/matches, reglas de lib/matching.ts).
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null)
  const [solicitando, setSolicitando] = useState<string | null>(null)
  // V7.1, dos caminos (Documento Maestro §15): se conecta por su cuenta o con el broker que elija.
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [tieneBroker, setTieneBroker] = useState(false)
  const [pedirBroker, setPedirBroker] = useState(false)
  // Desde el recorrido guiado (/empezar): "Ver brokers de mi zona" llega con ?broker=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('broker') !== '1') return
    const t = setTimeout(() => {
      setPedirBroker(true)
      document.getElementById('tu-broker')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 600)
    return () => clearTimeout(t)
  }, [])

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargarCoincidencias = async () => {
    const r = await fetch('/api/matches', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setCoincidencias(r.ok && Array.isArray(j.coincidencias) ? j.coincidencias : [])
    setPerfilId(j.perfilId ?? null)
    setTieneBroker(!!j.tieneBroker)
  }
  const meInteresa = async (c: Coincidencia) => {
    setSolicitando(c.activoId)
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ activoId: c.activoId, perfilId: c.perfilId }),
    })
    setSolicitando(null)
    await cargarCoincidencias()
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cuenta } = await supabase.from('usuarios').select('nombre').eq('id', user.id).single()
      setUserName((cuenta as { nombre: string } | null)?.nombre || user.email || 'Usuario')

      const { data: perfilExistente } = await supabase
        .from('perfiles_intencion')
        .select('presupuesto, zona, tipo_activo_interes, tesis_inversion')
        .eq('usuario_id', user.id)
        .maybeSingle()

      if (perfilExistente) {
        setPerfil(perfilExistente as PerfilIntencion)
        setTienePerfil(true)
      } else {
        setEditando(true)
      }

      // activos_publicos es una vista (no la tabla activos) — expone solo columnas no sensibles;
      // la tabla real tiene folio/gravámenes/escritura y su RLS es solo-dueño (probado: un
      // usuario autenticado que no es el dueño no ve nada si se consulta la tabla directo).
      const { data: activosData } = await supabase
        .from('activos_publicos')
        .select('id, nombre, tipo, municipio, estado, superficie, precio_total, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      setActivos((activosData as Activo[]) || [])
      cargarCoincidencias()

      setLoading(false)
    }
    init()
  }, [router])

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGuardando(false); return }

    setErrorPerfil('')
    // Antes no se revisaba el error: perfiles_intencion tenía RLS sin políticas y el guardado
    // fallaba en silencio mostrando el perfil como guardado (hallazgo 2026-10-05).
    const { error } = await supabase.from('perfiles_intencion').upsert({
      usuario_id: user.id,
      presupuesto: perfil.presupuesto || null,
      zona: perfil.zona || null,
      tipo_activo_interes: perfil.tipo_activo_interes || null,
      tesis_inversion: perfil.tesis_inversion || null,
      fuente_captura: 'registro_directo',
    }, { onConflict: 'usuario_id' })

    setGuardando(false)
    if (error) { setErrorPerfil('No se pudo guardar. Intenta de nuevo.'); return }
    cargarCoincidencias()
    setTienePerfil(true)
    setEditando(false)
  }

  const firstName = userName.split(' ')[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="relative flex flex-col flex-1">
      <Topbar userName={userName} rol="inversionista" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <h1 className="font-display text-[26px] md:text-[30px] font-medium text-paper leading-tight">Hola, {firstName}</h1>
            <p className="text-[14px] text-slate mt-1.5">Lo que buscas y las propiedades disponibles</p>
          </div>

          {/* Perfil de intención */}
          <div className="bg-navy-800 border border-white/10 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Lo que buscas</p>
              {tienePerfil && !editando && (
                <button onClick={() => setEditando(true)} className="text-[12px] font-medium text-gold-400 hover:text-gold-100 transition-colors">
                  Editar
                </button>
              )}
            </div>

            {!editando ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">Presupuesto</p>
                  <p className="text-[14px] text-paper mt-1">{perfil.presupuesto || '—'}</p>
                </div>
                <div>
                  <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">Zona de interés</p>
                  <p className="text-[14px] text-paper mt-1">{perfil.zona || '—'}</p>
                </div>
                <div>
                  <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">Tipo de propiedad</p>
                  <p className="text-[14px] text-paper mt-1">{perfil.tipo_activo_interes || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">Qué buscas y por qué</p>
                  <p className="text-[13px] text-paper-dim mt-1 leading-relaxed">{perfil.tesis_inversion || '—'}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarPerfil} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Presupuesto estimado">
                    <select value={perfil.presupuesto} onChange={e => setPerfil(p => ({ ...p, presupuesto: e.target.value }))} className={inputCls(false, 'oscuro')}>
                      <option value="" className="bg-navy-900">Selecciona…</option>
                      {PRESUPUESTOS.map(p => <option key={p} className="bg-navy-900">{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Zona de interés">
                    <input type="text" value={perfil.zona} onChange={e => setPerfil(p => ({ ...p, zona: e.target.value }))}
                      placeholder="Ej. San Pedro Garza García" className={inputCls(false, 'oscuro')} />
                  </Field>
                </div>
                <Field label="Tipo de propiedad">
                  <input type="text" value={perfil.tipo_activo_interes} onChange={e => setPerfil(p => ({ ...p, tipo_activo_interes: e.target.value }))}
                    placeholder="Ej. Casa, departamento, terreno" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="¿Qué buscas y por qué? (opcional)">
                  <textarea value={perfil.tesis_inversion} onChange={e => setPerfil(p => ({ ...p, tesis_inversion: e.target.value }))}
                    placeholder="Ej. casa de 3 recámaras cerca de escuelas, para mudarnos el próximo año…" rows={3} className={inputCls(false, 'oscuro')} />
                </Field>
                {errorPerfil && <p className="text-[12px] text-[#f3a3a3]">{errorPerfil}</p>}
                <div className="flex gap-2">
                  {tienePerfil && (
                    <button type="button" onClick={() => setEditando(false)}
                      className="px-5 py-2.5 border border-white/15 text-paper-dim font-plex-mono text-[12px] hover:border-white/30 transition-colors">
                      Cancelar
                    </button>
                  )}
                  <button type="submit" disabled={guardando}
                    className="px-5 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] hover:bg-gold-400 transition-colors disabled:opacity-60">
                    {guardando ? 'Guardando…' : 'Guardar perfil'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Tu broker (V7.1): opcional; puede conectarse por su cuenta */}
          {tienePerfil && perfilId && (
            <div id="tu-broker">
              {tieneBroker || pedirBroker ? (
                <ElegirBroker perfilId={perfilId} onAsignado={() => { if (!tieneBroker) cargarCoincidencias() }} />
              ) : (
                <div className="bg-navy-800 border border-white/10 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[14px] text-paper">¿Quieres un broker que te represente?</p>
                    <p className="text-[12px] text-slate mt-0.5">Puedes buscar y conectarte por tu cuenta. Un broker te acompaña en visitas, negociación y cierre.</p>
                  </div>
                  <button onClick={() => setPedirBroker(true)}
                    className="font-plex-mono text-[11px] border border-gold-500/50 text-gold-400 px-3 py-2 hover:bg-gold-500/10 transition-colors shrink-0">
                    Elegir mi broker
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Coincidencias con lo que busca */}
          {tienePerfil && coincidencias && (
            <div>
              <h2 className="font-display text-[17px] font-medium text-paper mb-1">{tieneBroker ? 'Coinciden con lo que buscas' : 'Propiedades de particulares que coinciden'}</h2>
              <p className="text-[12px] text-slate mb-4">
                Por tipo de propiedad, zona y presupuesto. {tieneBroker
                  ? 'Si te interesa alguna, tu broker se conecta con quien la vende.'
                  : 'Si te interesa alguna, nuestro equipo valida la conexión y te pasa el contacto de quien la vende. Las propiedades que traen los brokers se ven con un broker.'}
              </p>
              {coincidencias.length === 0 ? (
                <div className="bg-navy-800 border border-white/10 px-8 py-8 text-center">
                  <p className="text-[13px] text-slate">Por ahora ninguna propiedad coincide con lo que buscas. Te mostraremos las nuevas aquí.</p>
                </div>
              ) : (
                <div className="bg-navy-800 border border-gold-500/30 overflow-hidden">
                  {coincidencias.map((c, i) => (
                    <div key={c.activoId} className={`px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${i !== coincidencias.length - 1 ? 'border-b border-white/10' : ''}`}>
                      <span className="font-display text-[22px] font-medium text-gold-400 w-12 shrink-0">{c.score}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-paper">{c.activo.nombre}</p>
                        <p className="text-[11.5px] text-slate mt-0.5">
                          {c.activo.tipo} · {c.activo.municipio}{c.activo.precio_total != null ? ` · ${formatMXN(c.activo.precio_total)}` : ''}
                        </p>
                        <p className="text-[11.5px] text-paper-dim mt-1">{c.razones.join(' · ')}</p>
                        {c.contacto && (
                          <p className="text-[12.5px] text-paper mt-1.5">
                            Contacto: {c.contacto.nombre}{c.contacto.esBroker ? ' (broker de la propiedad)' : ' (propietario)'}
                            {c.contacto.correo && <> · <a href={`mailto:${c.contacto.correo}`} className="text-gold-400 hover:text-gold-100">{c.contacto.correo}</a></>}
{c.contacto.telefono && <> · <a href={`https://wa.me/52${c.contacto.telefono.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-100">WhatsApp {c.contacto.telefono}</a></>}
                          </p>
                        )}
                      </div>
                      {c.solicitud ? (
                        <span className="font-plex-mono text-[10.5px] text-gold-400 border border-gold-500/30 px-2.5 py-1 shrink-0">
                          {c.solicitud === 'solicitado' ? (tieneBroker ? 'Solicitado · tu broker te avisa' : 'Solicitado · Operación la revisa') : c.solicitud === 'en_contacto' ? 'En contacto' : c.solicitud === 'cerrado' ? 'Cerrado' : 'No disponible'}
                        </span>
                      ) : (
                        <button disabled={solicitando === c.activoId} onClick={() => meInteresa(c)}
                          className="font-plex-mono text-[11px] bg-gold-500 text-navy-950 px-3 py-2 hover:bg-gold-400 transition-colors disabled:opacity-60 shrink-0">
                          Me interesa
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Radar de mercado (V7.1 §18): solo para quien busca por su cuenta; con broker, su broker busca */}
          {tienePerfil && coincidencias && !tieneBroker && <RadarMercado />}

          {/* Activos disponibles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-[17px] font-medium text-paper">Propiedades disponibles</h2>
              <span className="text-[12px] text-slate">{activos.length}</span>
            </div>
            <p className="text-[12px] text-slate mb-4">Todas las propiedades de la plataforma.</p>

            {activos.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 px-8 py-14 text-center">
                <p className="text-[13px] text-slate">Todavía no hay activos cargados en la plataforma.</p>
              </div>
            ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {activos.map((a, i) => (
                  <div key={a.id} className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-white/10' : ''}`}>
                    <div className="w-9 h-9 bg-navy-950/60 border border-white/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#8b96ab" strokeWidth="1.5" fill="none"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-paper truncate">{a.nombre}</p>
                      <p className="text-[11px] text-slate mt-0.5 truncate">
                        {a.tipo} · {a.municipio}, {a.estado}{a.superficie ? ` · ${a.superficie} m²` : ''} · {formatDate(a.created_at)}
                      </p>
                    </div>
                    {a.precio_total != null && (
                      <span className="font-plex-mono text-[13px] text-paper shrink-0">{formatMXN(a.precio_total)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
      </div>
    </div>
  )
}
