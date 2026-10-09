'use client'

// Portal del broker — Documento Maestro V6.1, §5.2 y §10: el broker es protagonista del
// ecosistema como proveedor de los dos lados del matching:
//   - Mi portafolio: las propiedades que representa (oferta). Cada una pasa por el diagnóstico.
//     Desde aquí reporta cierres (cierres_reportados; Operación los verifica, V6.1 §6.2).
//   - Mis clientes: lo que buscan sus clientes (demanda), como filas de perfiles_intencion con
//     broker_id y alias. Sin teléfono ni correo del cliente: el contacto sigue siendo del broker.
//   - Matches: coincidencias de app/api/matches (reglas explicables de lib/matching.ts). Operación
//     valida cada conexión a mano; nunca se revela quién es el cliente o el broker ajeno.
//   - Mi desempeño: conteos reales y nivel de Broker Certificado SMT (lib/nivelesBroker.ts,
//     umbrales provisionales, V6.1 §6.3 y §7).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { statusCfg, formatDate, ESTADOS_ACTIVO } from '@/lib/estadoActivo'
import { calcularNivel, NIVELES, ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { tieneDocumentacion } from '@/lib/expediente'
import Topbar from '../components/Topbar'
import { Field, inputCls } from '../components/FormField'

interface ActivoPortafolio {
  id: string
  nombre: string
  tipo: string
  municipio: string
  estado: string
  status: string
  created_at: string
  propietario_nombre: string | null
  folio_real: string | null
  escritura_publica: string | null
}

interface Cliente {
  id: string
  alias_cliente: string
  presupuesto: string | null
  zona: string | null
  tipo_activo_interes: string | null
  tesis_inversion: string | null
  created_at: string
}

interface Cierre {
  id: string
  activo_id: string
  precio_cierre: number
  fecha_cierre: string
  estado: 'pendiente' | 'verificado' | 'rechazado'
}

interface MatchCliente {
  perfilId: string; activoId: string; cliente: string; score: number; razones: string[]
  activo: { id: string; nombre: string; tipo: string; municipio: string; precio_total: number | null }
  representacion: string; solicitud: string | null
}

interface MatchPortafolio {
  activoId: string; perfilId: string; activo: string; score: number; razones: string[]
  contraparte: string; criterios: { presupuesto: string | null; zona: string | null; tipo: string | null }
  solicitud: string | null
}

const PRESUPUESTOS = ['Menos de $2M', '$2M – $5M', '$5M – $15M', '$15M – $50M', 'Más de $50M']
const CLIENTE_VACIO = { alias_cliente: '', presupuesto: '', zona: '', tipo_activo_interes: '', tesis_inversion: '' }
const ETIQUETA_SOLICITUD: Record<string, string> = {
  solicitado: 'Solicitado · Operación lo revisa', en_contacto: 'En contacto', descartado: 'Descartado', cerrado: 'Cerrado',
}
const ORIGENES = [
  { v: 'mi_cliente', l: 'Un cliente mío' },
  { v: 'otro_broker', l: 'Cliente de otro broker' },
  { v: 'comprador_directo', l: 'Comprador directo de la plataforma' },
  { v: 'fuera_de_plataforma', l: 'Fuera de la plataforma' },
]
const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
type Pestana = 'portafolio' | 'oportunidades' | 'clientes' | 'matches' | 'desempeno'

// Propiedad que un propietario le ofreció a este broker (V6.3 §15, app/api/oportunidades).
interface Oportunidad {
  id: string
  estado: 'ofrecida' | 'aceptada' | 'rechazada'
  created_at: string
  activo: { id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; superficie: number | null; precio_total: number | null } | null
  diagnostico: { precioSalidaRecomendadoMXN: number | null; comparables: number | null; documentosFaltantes: string[] } | null
}

function BotonConectar({ estado, ocupado, onClick }: { estado: string | null; ocupado: boolean; onClick: () => void }) {
  if (estado) {
    return <span className="font-plex-mono text-[10.5px] text-gold-400 border border-gold-500/30 px-2.5 py-1 shrink-0">{ETIQUETA_SOLICITUD[estado] ?? estado}</span>
  }
  return (
    <button disabled={ocupado} onClick={onClick}
      className="font-plex-mono text-[11px] bg-gold-500 text-navy-950 px-3 py-2 hover:bg-gold-400 transition-colors disabled:opacity-60 shrink-0">
      Me interesa conectar
    </button>
  )
}

export default function PortalBrokerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [pionero, setPionero] = useState(false)
  const [certificadas, setCertificadas] = useState<Set<string>>(new Set())
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([])
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [errorOportunidad, setErrorOportunidad] = useState('')
  const [pestana, setPestana] = useState<Pestana>('portafolio')
  const [activos, setActivos] = useState<ActivoPortafolio[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cierres, setCierres] = useState<Cierre[]>([])

  const [editandoId, setEditandoId] = useState<string | 'nuevo' | null>(null)
  const [form, setForm] = useState(CLIENTE_VACIO)
  const [consentimiento, setConsentimiento] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorCliente, setErrorCliente] = useState('')

  const [matches, setMatches] = useState<{ paraMisClientes: MatchCliente[]; paraMiPortafolio: MatchPortafolio[] } | null>(null)
  const [errorMatches, setErrorMatches] = useState('')
  const [solicitando, setSolicitando] = useState<string | null>(null)

  const [cierreDe, setCierreDe] = useState<ActivoPortafolio | null>(null)
  const [formCierre, setFormCierre] = useState({ precio: '', fecha: new Date().toISOString().slice(0, 10), origen: 'mi_cliente' })
  const [errorCierre, setErrorCierre] = useState('')

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const cargarPortafolio = async (uid: string) => {
    const { data: activosData } = await supabase
      .from('activos')
      .select('id, nombre, tipo, municipio, estado, status, created_at, propietario_nombre, folio_real, escritura_publica')
      .eq('broker_id', uid)
      .order('created_at', { ascending: false })
    setActivos((activosData as ActivoPortafolio[]) || [])
  }

  const cargarOportunidades = async () => {
    const r = await fetch('/api/oportunidades', { headers: { Authorization: 'Bearer ' + (await token()) } })
      .then(res => res.json()).catch(() => ({ oportunidades: [] }))
    setOportunidades((r.oportunidades as Oportunidad[]) || [])
  }

  // Aceptar: el broker pasa a representar la propiedad y aparece en su portafolio.
  const responderOportunidad = async (id: string, accion: 'aceptar' | 'rechazar') => {
    setRespondiendo(id); setErrorOportunidad('')
    const r = await fetch(`/api/oportunidades/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) },
      body: JSON.stringify({ accion }),
    }).then(res => res.json()).catch(() => ({ error: 'Error de red' }))
    setRespondiendo(null)
    if (r.error) { setErrorOportunidad(r.error); return }
    await Promise.all([cargarOportunidades(), cargarPortafolio(userId)])
  }

  const cargarClientes = async (uid: string) => {
    const { data } = await supabase
      .from('perfiles_intencion')
      .select('id, alias_cliente, presupuesto, zona, tipo_activo_interes, tesis_inversion, created_at')
      .eq('broker_id', uid)
      .is('usuario_id', null)
      .order('created_at', { ascending: false })
    setClientes((data as Cliente[]) || [])
  }

  const cargarCierres = async (uid: string) => {
    const { data } = await supabase.from('cierres_reportados')
      .select('id, activo_id, precio_cierre, fecha_cierre, estado')
      .eq('broker_id', uid)
      .order('created_at', { ascending: false })
    setCierres((data as Cierre[]) || [])
  }

  const cargarMatches = async () => {
    setErrorMatches('')
    const r = await fetch('/api/matches', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({ error: 'Respuesta inválida' }))
    if (!r.ok || j.error) { setErrorMatches(j.error || 'No se pudieron cargar los matches'); return }
    setMatches({ paraMisClientes: j.paraMisClientes, paraMiPortafolio: j.paraMiPortafolio })
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: cuenta } = await supabase.from('usuarios').select('nombre, pionero').eq('id', user.id).single()
      setUserName((cuenta as { nombre: string } | null)?.nombre || user.email || 'Usuario')
      setPionero(!!(cuenta as { pionero: boolean | null } | null)?.pionero)

      await cargarPortafolio(user.id)

      // Propiedades con certificación legal otorgada (paso 4 V6.3): sello en el portafolio.
      const { data: certs } = await supabase.from('certificaciones').select('activo_id').eq('estado', 'certificada')
      setCertificadas(new Set(((certs as { activo_id: string }[]) || []).map(c => c.activo_id)))

      await Promise.all([cargarClientes(user.id), cargarCierres(user.id), cargarOportunidades()])
      setLoading(false)
    }
    init()
    // Carga inicial única; los cargadores se vuelven a llamar desde las acciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const abrirPestana = (t: Pestana) => {
    setPestana(t)
    if (t === 'matches' && !matches) cargarMatches()
  }

  const solicitarMatch = async (activoId: string, perfilId: string) => {
    setSolicitando(`${activoId}:${perfilId}`)
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ activoId, perfilId }),
    })
    setSolicitando(null)
    await cargarMatches()
  }

  const abrirCliente = (c: Cliente | null) => {
    setErrorCliente('')
    if (c) {
      setEditandoId(c.id)
      setForm({
        alias_cliente: c.alias_cliente,
        presupuesto: c.presupuesto || '',
        zona: c.zona || '',
        tipo_activo_interes: c.tipo_activo_interes || '',
        tesis_inversion: c.tesis_inversion || '',
      })
      setConsentimiento(true)
    } else {
      setEditandoId('nuevo')
      setForm(CLIENTE_VACIO)
      setConsentimiento(false)
    }
  }

  const guardarCliente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.alias_cliente.trim()) { setErrorCliente('Ponle un alias a tu cliente.'); return }
    if (!consentimiento) { setErrorCliente('Confirma que tu cliente te autorizó a registrar lo que busca.'); return }
    setGuardando(true)
    setErrorCliente('')
    const campos = {
      alias_cliente: form.alias_cliente.trim(),
      presupuesto: form.presupuesto || null,
      zona: form.zona || null,
      tipo_activo_interes: form.tipo_activo_interes || null,
      tesis_inversion: form.tesis_inversion || null,
    }
    const { error } = editandoId === 'nuevo'
      ? await supabase.from('perfiles_intencion').insert({
          ...campos,
          usuario_id: null,
          broker_id: userId,
          consentimiento_declarado_at: new Date().toISOString(),
          fuente_captura: 'broker',
        })
      : await supabase.from('perfiles_intencion').update(campos).eq('id', editandoId as string)
    setGuardando(false)
    if (error) { setErrorCliente('No se pudo guardar. Intenta de nuevo.'); return }
    setEditandoId(null)
    setMatches(null)
    await cargarClientes(userId)
  }

  const borrarCliente = async (id: string) => {
    await supabase.from('perfiles_intencion').delete().eq('id', id)
    setEditandoId(null)
    setMatches(null)
    await cargarClientes(userId)
  }

  const reportarCierre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cierreDe) return
    const precio = parseFloat(formCierre.precio)
    if (!precio || precio <= 0) { setErrorCierre('Captura el precio de cierre.'); return }
    setErrorCierre('')
    // Por el servidor (app/api/cierres) para que Operación reciba el aviso; el reporte nace
    // 'pendiente' y el activo queda cerrado. Operación lo verifica.
    const r = await fetch('/api/cierres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) },
      body: JSON.stringify({ activoId: cierreDe.id, precio, fecha: formCierre.fecha, origen: formCierre.origen }),
    }).then(res => res.json()).catch(() => ({ error: 'Error de red' }))
    if (r.error) { setErrorCierre(r.error); return }
    setActivos(as => as.map(a => (a.id === cierreDe.id ? { ...a, status: 'cerrado' } : a)))
    setCierreDe(null)
    setMatches(null)
    await cargarCierres(userId)
  }

  const firstName = userName.split(' ')[0]
  const porEstado = ESTADOS_ACTIVO.map(s => ({ s, n: activos.filter(a => a.status === s).length }))
  const cierresVerificados = cierres.filter(c => c.estado === 'verificado').length
  const metricas = {
    propiedades: activos.length,
    conDocumentacion: activos.filter(tieneDocumentacion).length,
    cierresVerificados,
    pionero,
  }
  const nivel = calcularNivel(metricas)
  const nombreActivo = (id: string) => activos.find(a => a.id === id)?.nombre ?? 'Propiedad'

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
      <Topbar userName={userName} rol="broker" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6">

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-fraunces text-[26px] md:text-[30px] font-medium text-paper leading-tight">Hola, {firstName}</h1>
              <p className="text-[14px] text-slate mt-1.5">
                Tu portafolio y lo que buscan tus clientes, en un solo lugar · <span className="text-gold-400">Nivel {nivel.actual.nombre}{pionero ? ' · ★ Pionero' : ''}</span>
              </p>
            </div>
            <button
              onClick={() => router.push('/activo/nuevo')}
              className="flex items-center gap-2 bg-gold-500 text-navy-950 font-plex-mono text-[11.5px] tracking-[0.03em] px-4 md:px-5 py-2.5 md:py-3 hover:bg-gold-400 transition-colors w-fit"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="#070f1c" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Cargar propiedad
            </button>
          </div>

          {/* Pestañas */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3">
            {([
              { id: 'portafolio', label: 'Mi portafolio', n: activos.length },
              { id: 'oportunidades', label: 'Oportunidades', n: oportunidades.filter(o => o.estado === 'ofrecida').length },
              { id: 'clientes',   label: 'Mis clientes',  n: clientes.length },
              { id: 'matches',    label: 'Matches',       n: matches ? matches.paraMisClientes.length + matches.paraMiPortafolio.length : null },
              { id: 'desempeno',  label: 'Mi desempeño',  n: null },
            ] as { id: Pestana; label: string; n: number | null }[]).map(t => (
              <button key={t.id} onClick={() => abrirPestana(t.id)}
                className={`flex items-center justify-center gap-2 px-3 py-3 border transition-colors ${
                  pestana === t.id ? 'bg-gold-500 border-gold-500 text-navy-950' : 'bg-navy-800 border-white/10 text-paper-dim hover:border-gold-500/40'
                }`}>
                <span className="text-[12px] md:text-[13px] font-medium">{t.label}</span>
                {t.n !== null && <span className="font-plex-mono text-[10.5px] opacity-70">{t.n}</span>}
              </button>
            ))}
          </div>

          {/* Mi portafolio */}
          {pestana === 'portafolio' && (
            activos.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 px-8 py-14 flex flex-col items-center gap-3 text-center">
                <p className="text-[14px] font-medium text-paper">Tu portafolio está vacío</p>
                <p className="text-[13px] text-slate max-w-[380px] leading-relaxed">
                  Carga las propiedades que representas. Cada una recibe un diagnóstico legal y de mercado, y queda como inventario certificado.
                </p>
                <button onClick={() => router.push('/activo/nuevo')}
                  className="mt-2 text-[13px] font-medium text-gold-400 hover:text-gold-100 transition-colors">
                  Cargar propiedad →
                </button>
              </div>
            ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {activos.map((a, i) => {
                  const { label, chip } = statusCfg(a.status)
                  return (
                    <div key={a.id} onClick={() => router.push(`/activo/${a.id}`)}
                      className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-white/10' : ''} hover:bg-white/[0.02] transition-colors cursor-pointer`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-paper truncate">
                          {a.nombre}
                          {certificadas.has(a.id) && <span className="ml-2 font-plex-mono text-[10px] text-gold-400 border border-gold-500/40 px-1.5 py-0.5 align-middle">★ Certificada</span>}
                        </p>
                        <p className="text-[11px] text-slate mt-0.5 truncate">
                          {a.tipo} · {a.municipio}, {a.estado}
                          {a.propietario_nombre ? ` · Propietario: ${a.propietario_nombre}` : ''} · {formatDate(a.created_at)}
                        </p>
                      </div>
                      {a.status !== 'cerrado' && (
                        <button onClick={e => { e.stopPropagation(); setErrorCierre(''); setCierreDe(a) }}
                          className="hidden sm:inline font-plex-mono text-[10.5px] text-gold-400 hover:text-gold-100 border border-gold-500/30 hover:border-gold-500 px-2.5 py-1 shrink-0 transition-colors">
                          Reportar cierre
                        </button>
                      )}
                      <span className={`font-plex-mono text-[10px] font-medium px-2.5 py-1 border shrink-0 ${chip}`}>{label}</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-dim shrink-0">
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* Reportar cierre */}
          {pestana === 'portafolio' && cierreDe && (
            <form onSubmit={reportarCierre} className="bg-navy-800 border border-gold-500/30 p-4 md:p-6 flex flex-col gap-4">
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Reportar cierre · {cierreDe.nombre}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Precio de cierre (MXN)" required>
                  <input type="number" min="0" value={formCierre.precio} onChange={e => setFormCierre(f => ({ ...f, precio: e.target.value }))}
                    className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Fecha de cierre" required>
                  <input type="date" value={formCierre.fecha} onChange={e => setFormCierre(f => ({ ...f, fecha: e.target.value }))}
                    className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="¿Quién compró?" required>
                  <select value={formCierre.origen} onChange={e => setFormCierre(f => ({ ...f, origen: e.target.value }))} className={inputCls(false, 'oscuro')}>
                    {ORIGENES.map(o => <option key={o.v} value={o.v} className="bg-navy-900">{o.l}</option>)}
                  </select>
                </Field>
              </div>
              <p className="text-[12px] text-slate">Operación MindBridge verifica cada cierre. Los cierres verificados suben tu nivel de Broker Certificado SMT.</p>
              {errorCierre && <p className="text-[12px] text-[#f3a3a3]">{errorCierre}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setCierreDe(null)}
                  className="px-5 py-2.5 border border-white/15 text-paper-dim font-plex-mono text-[12px] hover:border-white/30 transition-colors">
                  Cancelar
                </button>
                <button type="submit"
                  className="px-5 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] hover:bg-gold-400 transition-colors">
                  Reportar cierre
                </button>
              </div>
            </form>
          )}

          {/* Mis clientes */}
          {pestana === 'clientes' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5 bg-gold-500/[0.06] border-l-2 border-gold-500 px-4 py-3">
                <p className="text-[12.5px] text-paper-dim leading-relaxed">
                  Registra lo que busca cada cliente con un alias. <b className="text-paper">No guardamos su teléfono ni su correo</b>: tus clientes siguen siendo tuyos.
                </p>
              </div>

              {editandoId === null && (
                <button onClick={() => abrirCliente(null)}
                  className="font-plex-mono text-[12px] text-gold-400 hover:text-gold-100 border border-gold-500/40 hover:border-gold-500 px-4 py-2.5 transition-colors w-fit">
                  + Registrar cliente
                </button>
              )}

              {editandoId !== null && (
                <form onSubmit={guardarCliente} className="bg-navy-800 border border-gold-500/30 p-4 md:p-6 flex flex-col gap-4">
                  <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">
                    {editandoId === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Alias del cliente" required>
                      <input type="text" value={form.alias_cliente} onChange={e => setForm(f => ({ ...f, alias_cliente: e.target.value }))}
                        placeholder="Ej. Familia G., Cliente 12" className={inputCls(false, 'oscuro')} />
                    </Field>
                    <Field label="Presupuesto">
                      <select value={form.presupuesto} onChange={e => setForm(f => ({ ...f, presupuesto: e.target.value }))} className={inputCls(false, 'oscuro')}>
                        <option value="" className="bg-navy-900">Selecciona…</option>
                        {PRESUPUESTOS.map(p => <option key={p} className="bg-navy-900">{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Zona">
                      <input type="text" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                        placeholder="Ej. San Pedro Garza García" className={inputCls(false, 'oscuro')} />
                    </Field>
                    <Field label="Tipo de propiedad">
                      <input type="text" value={form.tipo_activo_interes} onChange={e => setForm(f => ({ ...f, tipo_activo_interes: e.target.value }))}
                        placeholder="Ej. Casa, departamento, terreno" className={inputCls(false, 'oscuro')} />
                    </Field>
                  </div>
                  <Field label="¿Qué busca y por qué? (opcional)">
                    <textarea value={form.tesis_inversion} onChange={e => setForm(f => ({ ...f, tesis_inversion: e.target.value }))}
                      placeholder="Ej. casa de 3 recámaras cerca de escuelas, para mudarse el próximo año…" rows={3} className={inputCls(false, 'oscuro')} />
                  </Field>
                  {editandoId === 'nuevo' && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={consentimiento} onChange={e => setConsentimiento(e.target.checked)} className="mt-0.5 accent-[#c9a227]" />
                      <span className="text-[13px] text-paper-dim leading-relaxed">
                        Mi cliente me autorizó a registrar lo que busca en SMTBROKER.
                      </span>
                    </label>
                  )}
                  {errorCliente && <p className="text-[12px] text-[#f3a3a3]">{errorCliente}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditandoId(null)}
                      className="px-5 py-2.5 border border-white/15 text-paper-dim font-plex-mono text-[12px] hover:border-white/30 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={guardando}
                      className="px-5 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] hover:bg-gold-400 transition-colors disabled:opacity-60">
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    {editandoId !== 'nuevo' && (
                      <button type="button" onClick={() => borrarCliente(editandoId)}
                        className="ml-auto px-5 py-2.5 border border-red-900/60 text-[#f3a3a3] font-plex-mono text-[12px] hover:bg-red-950/30 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </div>
                </form>
              )}

              {clientes.length === 0 ? (
                editandoId === null && (
                  <div className="bg-navy-800 border border-white/10 px-8 py-10 text-center">
                    <p className="text-[13px] text-slate">Aún no registras clientes.</p>
                  </div>
                )
              ) : (
                <div className="bg-navy-800 border border-white/10 overflow-hidden">
                  {clientes.map((c, i) => (
                    <div key={c.id} onClick={() => abrirCliente(c)}
                      className={`px-4 md:px-6 py-4 ${i !== clientes.length - 1 ? 'border-b border-white/10' : ''} hover:bg-white/[0.02] transition-colors cursor-pointer`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[14px] font-medium text-paper truncate">{c.alias_cliente}</p>
                        <span className="text-[11px] text-slate shrink-0">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="text-[12px] text-slate mt-0.5">
                        {[c.tipo_activo_interes, c.zona, c.presupuesto].filter(Boolean).join(' · ') || 'Sin criterios todavía'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => abrirPestana('matches')}
                className="text-[13px] font-medium text-gold-400 hover:text-gold-100 transition-colors w-fit">
                Ver propiedades que coinciden con tus clientes →
              </button>
            </div>
          )}

          {/* Matches */}
          {pestana === 'matches' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-2.5 bg-gold-500/[0.06] border-l-2 border-gold-500 px-4 py-3">
                <p className="text-[12.5px] text-paper-dim leading-relaxed">
                  Coincidencias por tipo de propiedad, zona y presupuesto. <b className="text-paper">Operación MindBridge valida cada conexión</b> antes de ponerlos en contacto. Nunca mostramos quién es el cliente o el broker de la otra parte.
                </p>
              </div>
              {errorMatches && <p className="text-[13px] text-[#f3a3a3]">{errorMatches}</p>}
              {!matches && !errorMatches && <p className="text-[13px] text-slate font-plex-mono">Buscando coincidencias…</p>}
              {matches && (
                <>
                  <div>
                    <h2 className="font-fraunces text-[17px] font-medium text-paper mb-3">Para tus clientes</h2>
                    {matches.paraMisClientes.length === 0 ? (
                      <p className="text-[13px] text-slate">Sin coincidencias por ahora para lo que buscan tus clientes.</p>
                    ) : (
                      <div className="bg-navy-800 border border-white/10 overflow-hidden">
                        {matches.paraMisClientes.map((m, i) => (
                          <div key={m.perfilId + m.activoId}
                            className={`px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${i !== matches.paraMisClientes.length - 1 ? 'border-b border-white/10' : ''}`}>
                            <span className="font-fraunces text-[22px] font-medium text-gold-400 w-12 shrink-0">{m.score}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-paper"><b>{m.cliente}</b> → {m.activo.nombre}</p>
                              <p className="text-[11.5px] text-slate mt-0.5">
                                {m.activo.tipo} · {m.activo.municipio}{m.activo.precio_total ? ` · ${mxn(m.activo.precio_total)}` : ''} · {m.representacion}
                              </p>
                              <p className="text-[11.5px] text-paper-dim mt-1">{m.razones.join(' · ')}</p>
                            </div>
                            <BotonConectar estado={m.solicitud} ocupado={solicitando === `${m.activoId}:${m.perfilId}`}
                              onClick={() => solicitarMatch(m.activoId, m.perfilId)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="font-fraunces text-[17px] font-medium text-paper mb-3">Para tu portafolio</h2>
                    {matches.paraMiPortafolio.length === 0 ? (
                      <p className="text-[13px] text-slate">Sin compradores registrados que coincidan con tus propiedades por ahora.</p>
                    ) : (
                      <div className="bg-navy-800 border border-white/10 overflow-hidden">
                        {matches.paraMiPortafolio.map((m, i) => (
                          <div key={m.activoId + m.perfilId}
                            className={`px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${i !== matches.paraMiPortafolio.length - 1 ? 'border-b border-white/10' : ''}`}>
                            <span className="font-fraunces text-[22px] font-medium text-gold-400 w-12 shrink-0">{m.score}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-paper"><b>{m.activo}</b> ← {m.contraparte}</p>
                              <p className="text-[11.5px] text-slate mt-0.5">
                                Busca: {[m.criterios.tipo, m.criterios.zona, m.criterios.presupuesto].filter(Boolean).join(' · ')}
                              </p>
                              <p className="text-[11.5px] text-paper-dim mt-1">{m.razones.join(' · ')}</p>
                            </div>
                            <BotonConectar estado={m.solicitud} ocupado={solicitando === `${m.activoId}:${m.perfilId}`}
                              onClick={() => solicitarMatch(m.activoId, m.perfilId)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Oportunidades: propiedades que un propietario te eligió para representar (V6.3 §15) */}
          {pestana === 'oportunidades' && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-paper-dim">
                Propietarios de tu zona que eligieron a un broker certificado. Tu nivel te hace visible: más nivel, más oportunidades.
              </p>
              {errorOportunidad && <p className="text-[12px] text-[#f3a3a3]">{errorOportunidad}</p>}
              {oportunidades.length === 0 ? (
                <div className="bg-navy-800 border border-white/10 p-6 text-center">
                  <p className="text-[13px] text-slate">Todavía no recibes oportunidades. Los propietarios ven a los brokers Plata, Oro y Platino de su municipio.</p>
                </div>
              ) : oportunidades.map(o => (
                <div key={o.id} className={`bg-navy-800 border p-4 md:p-5 flex flex-col gap-2 ${o.estado === 'ofrecida' ? 'border-gold-500/40' : 'border-white/10 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14.5px] font-medium text-paper">{o.activo?.nombre ?? 'Propiedad'}</p>
                      <p className="text-[12px] text-slate mt-0.5">
                        {o.activo?.tipo} · {[o.activo?.colonia, o.activo?.municipio].filter(Boolean).join(', ')}
                        {o.activo?.superficie ? ` · ${o.activo.superficie} m²` : ''} · {formatDate(o.created_at)}
                      </p>
                    </div>
                    <span className="font-plex-mono text-[10.5px] text-gold-400 border border-gold-500/30 px-2 py-1 shrink-0">
                      {o.estado === 'ofrecida' ? 'Nueva' : o.estado === 'aceptada' ? 'Aceptada' : 'Rechazada'}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-paper-dim">
                    Precio de lista {o.activo?.precio_total ? mxn(o.activo.precio_total) : '—'}
                    {o.diagnostico?.precioSalidaRecomendadoMXN ? ` · precio de salida recomendado ${mxn(o.diagnostico.precioSalidaRecomendadoMXN)}` : ''}
                    {o.diagnostico?.comparables ? ` (${o.diagnostico.comparables} comparables)` : ''}
                  </p>
                  <p className="text-[12px] text-slate">
                    {o.diagnostico?.documentosFaltantes.length
                      ? `Para certificar le falta: ${o.diagnostico.documentosFaltantes.join(', ').toLowerCase()}.`
                      : 'Expediente completo: lista para certificar.'}
                  </p>
                  {o.estado === 'ofrecida' && (
                    <div className="flex gap-2 mt-1">
                      <button disabled={respondiendo === o.id} onClick={() => responderOportunidad(o.id, 'aceptar')}
                        className="font-plex-mono text-[12px] px-4 py-2 border bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-50">
                        {respondiendo === o.id ? 'Enviando…' : 'Aceptar y representar'}
                      </button>
                      <button disabled={respondiendo === o.id} onClick={() => responderOportunidad(o.id, 'rechazar')}
                        className="font-plex-mono text-[12px] px-4 py-2 border border-white/15 text-slate hover:text-paper disabled:opacity-50">
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mi desempeño */}
          {pestana === 'desempeno' && (
            <div className="flex flex-col gap-4">
              <div className="bg-navy-800 border border-gold-500/30 p-5">
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">Broker Certificado SMT</p>
                <p className="font-fraunces text-[24px] font-medium text-gold-400 mt-1">Nivel {nivel.actual.nombre}</p>
                {pionero && (
                  <p className="text-[12.5px] text-gold-400 mt-1">★ Broker Pionero · formas parte del grupo piloto: tienes al menos nivel Plata y prioridad cuando la plataforma abra a más brokers.</p>
                )}

                {/* Escalera de niveles (gamificación, 2026-10-07): dónde estás y qué sigue. */}
                <div className="grid grid-cols-4 gap-1.5 mt-4">
                  {NIVELES.map(n => {
                    const logrado = ORDEN_NIVEL[n.id] <= ORDEN_NIVEL[nivel.actual.id]
                    const actual = n.id === nivel.actual.id
                    return (
                      <div key={n.id} className={`px-2 py-2 text-center border ${actual ? 'bg-gold-500 border-gold-500 text-navy-950' : logrado ? 'border-gold-500/50 text-gold-400' : 'border-white/10 text-slate'}`}>
                        <p className="font-plex-mono text-[10.5px] uppercase tracking-wide">{logrado && !actual ? '✓ ' : ''}{n.nombre}</p>
                      </div>
                    )
                  })}
                </div>

                {nivel.siguiente ? (
                  <div className="mt-4">
                    <p className="text-[13px] text-paper-dim mb-2.5">Para subir a <b className="text-paper">{nivel.siguiente.nombre}</b>:</p>
                    <div className="flex flex-col gap-2.5">
                      {nivel.siguiente.metas(metricas).map(m => {
                        const listo = m.actual >= m.meta
                        return (
                          <div key={m.etiqueta}>
                            <div className="flex justify-between text-[12px] mb-1">
                              <span className={listo ? 'text-[#6bdb9a]' : 'text-paper-dim'}>{listo ? '✓ ' : ''}{m.etiqueta}</span>
                              {/* El número real (p. ej. «7 / 3»); solo la barra se topa al 100 %. */}
                              <span className="font-plex-mono text-paper">{m.actual} / {m.meta}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 overflow-hidden">
                              <div className={`h-full ${listo ? 'bg-[#3fbe72]' : 'bg-gold-500'}`} style={{ width: `${Math.min(100, (m.actual / m.meta) * 100)}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-paper-dim mt-3">Estás en el nivel más alto: Platino.</p>
                )}
                <p className="text-[11.5px] text-slate mt-3">Tu nivel da prioridad a tus matches ante Operación. Umbrales provisionales.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Propiedades', value: activos.length },
                  { label: 'Clientes', value: clientes.length },
                  { label: 'Cierres verificados', value: cierresVerificados },
                ].map(m => (
                  <div key={m.label} className="bg-navy-800 border border-white/10 p-5">
                    <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">{m.label}</p>
                    <p className="font-fraunces text-[28px] font-medium text-paper mt-1">{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-navy-800 border border-white/10 p-5">
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em] mb-3">Propiedades por fase</p>
                <div className="flex flex-col gap-2">
                  {porEstado.map(({ s, n }) => {
                    const { label, chip } = statusCfg(s)
                    return (
                      <div key={s} className="flex items-center gap-3">
                        <span className={`font-plex-mono text-[10px] font-medium px-2.5 py-1 border w-[120px] text-center ${chip}`}>{label}</span>
                        <div className="flex-1 h-1.5 bg-white/5">
                          <div className="h-full bg-gold-500/70" style={{ width: activos.length ? `${(n / activos.length) * 100}%` : '0%' }} />
                        </div>
                        <span className="font-plex-mono text-[12px] text-paper-dim w-6 text-right">{n}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="bg-navy-800 border border-white/10 p-5">
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em] mb-3">Cierres reportados</p>
                {cierres.length === 0 ? (
                  <p className="text-[13px] text-slate">Aún no reportas cierres. Usa &quot;Reportar cierre&quot; en Mi portafolio.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cierres.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="text-paper truncate">{nombreActivo(c.activo_id)}</span>
                        <span className="text-slate shrink-0">{mxn(c.precio_cierre)} · {formatDate(c.fecha_cierre)}</span>
                        <span className={`font-plex-mono text-[10px] px-2 py-0.5 border shrink-0 ${
                          c.estado === 'verificado' ? 'border-gold-500/40 text-gold-400'
                            : c.estado === 'rechazado' ? 'border-red-900/60 text-[#f3a3a3]' : 'border-white/15 text-slate'
                        }`}>
                          {c.estado === 'pendiente' ? 'Por verificar' : c.estado === 'verificado' ? 'Verificado' : 'Rechazado'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
      </div>
    </div>
  )
}
