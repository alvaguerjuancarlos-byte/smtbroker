'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../components/Topbar'

interface Solicitud {
  id: string
  nombre: string
  email: string
  telefono: string
  rol: string
  empresa: string | null
  datos: Record<string, string> | null
  status: string
  created_at: string
}

// ─── Datos simulados del ecosistema ───────────────────────────────────────────

const ACTIVOS_ECO = [
  { id: '1', nombre: 'Terreno Col. Providencia',  tipo: 'Terreno',     propietario: 'Jorge Calvarez',    broker: 'Maestro',          municipio: 'Guadalajara',    fase: 'leads',      precio: 8500000  },
  { id: '2', nombre: 'Casa Valle Real',           tipo: 'Casa',        propietario: 'María González',    broker: 'Luis Hdez.',       municipio: 'Zapopan',        fase: 'marketing',  precio: 4200000  },
  { id: '3', nombre: 'Local Av. Vallarta',        tipo: 'Local',       propietario: 'Roberto Sánchez',   broker: 'Maestro',          municipio: 'Guadalajara',    fase: 'valoracion', precio: 2800000  },
  { id: '4', nombre: 'Departamento Midtown',      tipo: 'Depto',       propietario: 'Ana Martínez',      broker: 'Carmen Vega',      municipio: 'CDMX',           fase: 'marketing',  precio: 5600000  },
  { id: '5', nombre: 'Bodega Industrial Periferico', tipo: 'Bodega',   propietario: 'Grupo RIMSA',       broker: 'Luis Hdez.',       municipio: 'Tlaquepaque',    fase: 'leads',      precio: 12000000 },
  { id: '6', nombre: 'Terreno Carretera 45',      tipo: 'Terreno',     propietario: 'Carlos Peña',       broker: 'Maestro',          municipio: 'Tonalá',         fase: 'cerrado',    precio: 3100000  },
  { id: '7', nombre: 'Edificio Centro Histórico', tipo: 'Edificio',    propietario: 'Inmobiliaria PMG',  broker: 'Carmen Vega',      municipio: 'Guadalajara',    fase: 'valoracion', precio: 18000000 },
  { id: '8', nombre: 'Casa Bugambilias',          tipo: 'Casa',        propietario: 'Sofía Romero',      broker: 'Maestro',          municipio: 'Zapopan',        fase: 'cerrado',    precio: 3800000  },
]

const BROKERS = [
  { nombre: 'Luis Hernández',  activos: 2, cerrados: 1, volumen: 16200000, rating: 4.8 },
  { nombre: 'Carmen Vega',     activos: 2, cerrados: 0, volumen: 23600000, rating: 4.6 },
]

const ACTIVIDAD = [
  { hora: 'Hace 12 min', texto: 'Carlos Mendoza (score 92) solicitó visita — Terreno Col. Providencia',  tipo: 'lead'      },
  { hora: 'Hace 1h',     texto: 'Casa Valle Real alcanzó 1,000 vistas en portales',                       tipo: 'marketing' },
  { hora: 'Hace 2h',     texto: 'Nuevo propietario registrado: Sofía Romero — Casa Bugambilias',          tipo: 'registro'  },
  { hora: 'Hace 3h',     texto: 'Bodega Industrial Periferico: 2 nuevos leads calificados',               tipo: 'lead'      },
  { hora: 'Ayer 4:30pm', texto: 'Cierre confirmado — Casa Bugambilias · $3,800,000',                     tipo: 'cierre'    },
  { hora: 'Ayer 2:10pm', texto: 'Carmen Vega incorporó: Edificio Centro Histórico',                       tipo: 'registro'  },
]

const INVERSIONISTAS = [
  { nombre: 'Grupo Inversiones RM', intereses: 'Terrenos · Edificios', presupuesto: '$5M – $20M', activo: true  },
  { nombre: 'Carlos Mendoza',       intereses: 'Terrenos · Casas',    presupuesto: '$3M – $10M', activo: true  },
  { nombre: 'Fondo NEXUS Capital',  intereses: 'Industrial · Mixto',  presupuesto: '$10M – $50M', activo: false },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const faseCfg = (fase: string) => {
  if (fase === 'valoracion') return { label: 'Valoración',  badge: 'bg-[#FEF3C7] text-[#92600A]',  dot: 'bg-[#D97706]' }
  if (fase === 'marketing')  return { label: 'Marketing',   badge: 'bg-[#EEF2FF] text-[#3730A3]',  dot: 'bg-[#4F46E5]' }
  if (fase === 'leads')      return { label: 'Leads',       badge: 'bg-[#FBF5E6] text-[#0F1F3D]',  dot: 'bg-[#C9A84C]' }
  if (fase === 'cerrado')    return { label: 'Cerrado',     badge: 'bg-[#F3F4F6] text-[#374151]',  dot: 'bg-[#6B7280]' }
  return                            { label: 'Ingresado',   badge: 'bg-[#F3F4F6] text-[#6B7280]',  dot: 'bg-[#D1D5DB]' }
}

const actividadCfg = (tipo: string) => {
  if (tipo === 'lead')      return { color: 'bg-[#FBF5E6]', icon: '#C9A84C' }
  if (tipo === 'marketing') return { color: 'bg-[#EEF2FF]', icon: '#4F46E5' }
  if (tipo === 'cierre')    return { color: 'bg-[#111827]', icon: '#4ade80' }
  return                           { color: 'bg-[#F3F4F6]', icon: '#8EA0BC' }
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function PipelineBar() {
  const fases = [
    { label: 'Valoración', count: 2, color: '#D97706' },
    { label: 'Marketing',  count: 2, color: '#4F46E5' },
    { label: 'Leads',      count: 2, color: '#C9A84C' },
    { label: 'Cerrado',    count: 2, color: '#6B7280' },
  ]
  const total = fases.reduce((a, f) => a + f.count, 0)

  return (
    <div className="bg-white rounded-2xl border border-[#DDE3EC] p-6">
      <p className="text-[15px] font-bold text-[#111827] mb-1">Pipeline de activos</p>
      <p className="text-[12px] text-[#8EA0BC] mb-5">{total} activos en el ecosistema</p>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-4">
        {fases.map(f => (
          <div key={f.label} style={{ width: `${(f.count / total) * 100}%`, backgroundColor: f.color }} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fases.map(f => (
          <div key={f.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
            <div>
              <p className="text-[13px] font-black text-[#111827]">{f.count}</p>
              <p className="text-[10px] text-[#8EA0BC]">{f.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const rolLabel = (rol: string) => {
  if (rol === 'propietario')  return { label: 'Propietario',  badge: 'bg-[#FBF5E6] text-[#0F1F3D]'  }
  if (rol === 'inversionista') return { label: 'Inversionista', badge: 'bg-[#EEF2FF] text-[#3730A3]'  }
  if (rol === 'broker')       return { label: 'Broker',        badge: 'bg-[#FEF3C7] text-[#92600A]'  }
  return                             { label: rol,             badge: 'bg-[#F3F4F6] text-[#6B7280]'  }
}

export default function PanelPage() {
  const router  = useRouter()
  const [loading, setLoading]       = useState(true)
  const [userName, setUserName]     = useState('')
  const [filtroFase, setFiltroFase] = useState<string>('todos')
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [copiedLink, setCopiedLink]   = useState(false)
  // Estado de la invitación por correo disparada al aprobar (ver app/api/invitar-broker) —
  // separado del status de la solicitud: si la invitación falla, la solicitud sigue "aprobada",
  // pero se muestra la alerta para que el Broker Maestro sepa que hay que reintentar.
  const [inviteEstado, setInviteEstado] = useState<Record<string, { estado: 'enviando' | 'ok' | 'error'; mensaje?: string }>>({})

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', user.id)
        .single()
      setUserName((profile as { nombre: string } | null)?.nombre || user.email || 'Broker Maestro')

      const { data } = await supabase
        .from('solicitudes')
        .select('*')
        .order('created_at', { ascending: false })
      setSolicitudes((data as Solicitud[]) || [])

      setLoading(false)
    }
    init()
  }, [router])

  const actualizarStatus = async (id: string, status: 'aprobada' | 'rechazada') => {
    await supabase.from('solicitudes').update({ status }).eq('id', id)
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, status } : s))

    if (status !== 'aprobada') return
    const solicitud = solicitudes.find(s => s.id === id)
    if (!solicitud) return
    await enviarInvitacion(id, solicitud.email, solicitud.nombre)
  }

  const enviarInvitacion = async (id: string, email: string, nombre: string) => {
    setInviteEstado(prev => ({ ...prev, [id]: { estado: 'enviando' } }))
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/invitar-broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email, nombre }),
      })
      const json = await res.json()
      if (!res.ok) {
        setInviteEstado(prev => ({ ...prev, [id]: { estado: 'error', mensaje: json.error || 'Error al enviar la invitación' } }))
        return
      }
      setInviteEstado(prev => ({ ...prev, [id]: { estado: 'ok' } }))
    } catch {
      setInviteEstado(prev => ({ ...prev, [id]: { estado: 'error', mensaje: 'Error de red al enviar la invitación' } }))
    }
  }

  const compartirEnlace = () => {
    const url = `${window.location.origin}/bienvenida`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  const pendientes = solicitudes.filter(s => s.status === 'pendiente')

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Cargando panel…</p>
      </div>
    )
  }

  const activosFiltrados = filtroFase === 'todos'
    ? ACTIVOS_ECO
    : ACTIVOS_ECO.filter(a => a.fase === filtroFase)

  const volumenTotal = ACTIVOS_ECO.reduce((a, c) => a + c.precio, 0)
  const cerrados     = ACTIVOS_ECO.filter(a => a.fase === 'cerrado').length
  const enProceso    = ACTIVOS_ECO.filter(a => a.fase !== 'cerrado').length

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar userName={userName} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[1100px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-[#C9A84C] tracking-[0.14em] uppercase">Broker Maestro</span>
              <h1 className="text-[22px] md:text-[28px] font-black text-[#111827] mt-0.5">Panel del Ecosistema</h1>
              <p className="text-[13px] md:text-[14px] text-[#8EA0BC] mt-1">Vista global de activos, brokers, propietarios e inversionistas</p>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => router.push('/panel/prospectos-broker')}
                className="flex items-center gap-2 text-[12px] md:text-[13px] font-semibold px-3 md:px-4 py-2.5 rounded-xl border border-[#DDE3EC] bg-white hover:border-[#C9A84C] transition-colors text-[#111827]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
                Prospección de brokers
              </button>
              <button onClick={compartirEnlace}
                className="flex items-center gap-2 text-[12px] md:text-[13px] font-semibold px-3 md:px-4 py-2.5 rounded-xl border border-[#DDE3EC] bg-white hover:border-[#C9A84C] transition-colors text-[#111827]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M8.59 13.51a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M15.41 10.49a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {copiedLink ? '¡Copiado!' : 'Compartir'}
              </button>
              <button onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-[12px] md:text-[13px] font-semibold text-[#8EA0BC] hover:text-[#111827] border border-[#DDE3EC] px-3 md:px-4 py-2.5 rounded-xl transition-colors bg-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth="1.6" fill="none"/>
                </svg>
                Mis activos
              </button>
            </div>
          </div>

          {/* Solicitudes pendientes */}
          {solicitudes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-[16px] font-bold text-[#111827]">Solicitudes de registro</h2>
                  {pendientes.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92600A]">
                      {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-[#8EA0BC]">{solicitudes.length} en total</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                {solicitudes.map((s, i) => {
                  const { label, badge } = rolLabel(s.rol)
                  const isPendiente = s.status === 'pendiente'
                  return (
                    <div key={s.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-4 ${i !== solicitudes.length - 1 ? 'border-b border-[#EDF1F7]' : ''}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#F5F7FA] border border-[#DDE3EC] flex items-center justify-center shrink-0">
                          <span className="text-[13px] font-black text-[#4B5E7A]">{s.nombre.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#111827] truncate">{s.nombre}</p>
                          <p className="text-[11px] text-[#8EA0BC] mt-0.5 truncate">{s.email} {s.telefono ? `· ${s.telefono}` : ''}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${badge}`}>{label}</span>
                      </div>
                      {isPendiente ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => actualizarStatus(s.id, 'aprobada')}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[#C9A84C] text-white hover:bg-[#0F1F3D] transition-colors">
                            Aprobar
                          </button>
                          <button
                            onClick={() => actualizarStatus(s.id, 'rechazada')}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#DDE3EC] text-[#8EA0BC] hover:text-[#111827] hover:border-[#111827] transition-colors">
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full self-start sm:self-auto ${s.status === 'aprobada' ? 'bg-[#FBF5E6] text-[#0F1F3D]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                            {s.status === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                          </span>
                          {s.status === 'aprobada' && inviteEstado[s.id] && (
                            inviteEstado[s.id].estado === 'enviando' ? (
                              <span className="text-[10px] text-[#8EA0BC]">Enviando invitación…</span>
                            ) : inviteEstado[s.id].estado === 'ok' ? (
                              <span className="text-[10px] text-[#0F1F3D]">✓ Invitación enviada</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[#DC2626]">{inviteEstado[s.id].mensaje}</span>
                                {inviteEstado[s.id].mensaje !== 'Ya existe una cuenta con este correo.' && (
                                  <button
                                    onClick={() => enviarInvitacion(s.id, s.email, s.nombre)}
                                    className="text-[10px] font-semibold text-[#C9A84C] hover:text-[#0F1F3D] underline">
                                    Reintentar
                                  </button>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Métricas globales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
            {[
              { label: 'En proceso',    value: String(enProceso),            sub: 'en 3 fases',            color: 'text-[#111827]' },
              { label: 'Cerrados',      value: String(cerrados),             sub: 'este ciclo',            color: 'text-[#C9A84C]' },
              { label: 'Volumen',       value: formatMXN(volumenTotal),      sub: 'valor portafolio',      color: 'text-[#3730A3]' },
              { label: 'Brokers',       value: String(BROKERS.length),       sub: 'activos',               color: 'text-[#D97706]' },
              { label: 'Inversionistas', value: String(INVERSIONISTAS.length), sub: 'registrados',        color: 'text-[#111827]' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-5">
                <p className="text-[10px] text-[#8EA0BC] uppercase tracking-wide mb-2">{m.label}</p>
                <p className={`text-[16px] md:text-[18px] font-black leading-tight ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-[#8EA0BC] mt-0.5">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Pipeline + Actividad reciente */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <PipelineBar />
            </div>

            {/* Actividad reciente */}
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-5 flex flex-col gap-1">
              <p className="text-[13px] font-bold text-[#111827] mb-3">Actividad reciente</p>
              <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 160 }}>
                {ACTIVIDAD.map((a, i) => {
                  const cfg = actividadCfg(a.tipo)
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.icon }} />
                      </div>
                      <div>
                        <p className="text-[11px] text-[#111827] leading-snug">{a.texto}</p>
                        <p className="text-[10px] text-[#8EA0BC] mt-0.5">{a.hora}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Activos del ecosistema */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-[16px] font-bold text-[#111827]">Activos del ecosistema</h2>
              <div className="flex items-center flex-wrap gap-1.5">
                {['todos', 'valoracion', 'marketing', 'leads', 'cerrado'].map(f => (
                  <button key={f} onClick={() => setFiltroFase(f)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg capitalize transition-colors ${
                      filtroFase === f
                        ? 'bg-[#C9A84C] text-white'
                        : 'bg-white border border-[#DDE3EC] text-[#8EA0BC] hover:text-[#111827]'
                    }`}>
                    {f === 'todos' ? 'Todos' : faseCfg(f).label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[580px]">
                  <div className="grid grid-cols-6 px-4 md:px-6 py-3 border-b border-[#EDF1F7] bg-[#FAFBFA]">
                    {['Activo', 'Propietario', 'Broker', 'Municipio', 'Precio', 'Fase'].map(h => (
                      <p key={h} className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-wide">{h}</p>
                    ))}
                  </div>
                  {activosFiltrados.map((a, i) => {
                    const cfg = faseCfg(a.fase)
                    return (
                      <div key={a.id}
                        className={`grid grid-cols-6 items-center px-4 md:px-6 py-4 ${i !== activosFiltrados.length - 1 ? 'border-b border-[#EDF1F7]' : ''} hover:bg-[#FAFBFA] transition-colors cursor-pointer`}>
                        <div>
                          <p className="text-[13px] font-semibold text-[#111827] truncate">{a.nombre}</p>
                          <p className="text-[10px] text-[#8EA0BC]">{a.tipo}</p>
                        </div>
                        <p className="text-[12px] text-[#4B5E7A] truncate">{a.propietario}</p>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${a.broker === 'Maestro' ? 'bg-[#C9A84C] text-white' : 'bg-[#EEF2FF] text-[#3730A3]'}`}>
                            {a.broker.charAt(0)}
                          </div>
                          <p className="text-[12px] text-[#4B5E7A] truncate">{a.broker}</p>
                        </div>
                        <p className="text-[12px] text-[#4B5E7A]">{a.municipio}</p>
                        <p className="text-[12px] font-semibold text-[#111827]">{formatMXN(a.precio)}</p>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full w-fit flex items-center gap-1.5 ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Brokers aliados + Inversionistas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Brokers */}
            <div>
              <h2 className="text-[16px] font-bold text-[#111827] mb-4">Brokers aliados</h2>
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                {BROKERS.map((b, i) => (
                  <div key={i} className={`px-5 py-4 ${i !== BROKERS.length - 1 ? 'border-b border-[#EDF1F7]' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                          <span className="text-[12px] font-black text-[#3730A3]">{b.nombre.charAt(0)}</span>
                        </div>
                        <p className="text-[13px] font-bold text-[#111827]">{b.nombre}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="#D97706"><path d="M6 1l1.5 3h3l-2.4 1.8.9 3L6 7.2 3 8.8l.9-3L1.5 4h3z"/></svg>
                        <span className="text-[12px] font-bold text-[#D97706]">{b.rating}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Activos', value: b.activos },
                        { label: 'Cerrados', value: b.cerrados },
                        { label: 'Volumen', value: formatMXN(b.volumen) },
                      ].map(s => (
                        <div key={s.label} className="bg-[#F5F7FA] rounded-lg p-2.5 text-center">
                          <p className="text-[13px] font-black text-[#111827]">{s.value}</p>
                          <p className="text-[10px] text-[#8EA0BC]">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inversionistas */}
            <div>
              <h2 className="text-[16px] font-bold text-[#111827] mb-4">Inversionistas registrados</h2>
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                {INVERSIONISTAS.map((inv, i) => (
                  <div key={i} className={`px-5 py-4 flex items-start justify-between gap-4 ${i !== INVERSIONISTAS.length - 1 ? 'border-b border-[#EDF1F7]' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#FBF5E6] flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-black text-[#0F1F3D]">{inv.nombre.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{inv.nombre}</p>
                        <p className="text-[11px] text-[#8EA0BC] mt-0.5">{inv.intereses}</p>
                        <p className="text-[11px] text-[#4B5E7A] font-semibold mt-0.5">{inv.presupuesto}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${inv.activo ? 'bg-[#FBF5E6] text-[#0F1F3D]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                      {inv.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  )
}
