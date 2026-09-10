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

interface Activo {
  id: string
  usuario_id: string
  broker_id: string | null
  nombre: string
  tipo: string
  municipio: string
  precio_total: number | null
  status: string
  created_at: string
}

interface UsuarioMin {
  id: string
  nombre: string
  rol: string | null
}

interface PerfilIntencion {
  usuario_id: string
  presupuesto: string | null
  tipo_activo_interes: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

// "Hace 12 min" / "Hace 3h" / "Ayer" / fecha corta — para la actividad reciente, derivada de
// fechas reales (activos.created_at, solicitudes.created_at), no de un log de eventos inventado.
const tiempoRelativo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'Justo ahora'
  if (min < 60) return `Hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `Hace ${horas}h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// Chips de estado en tema oscuro: borde + texto en el tono semántico sobre fondo casi
// transparente, en vez de bloques pastel sólidos (que no leen bien sobre navy).
const faseCfg = (fase: string) => {
  if (fase === 'valoracion') return { label: 'Valoración', chip: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10', dot: 'bg-[#D97706]' }
  if (fase === 'marketing')  return { label: 'Marketing',  chip: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10', dot: 'bg-[#7b76ea]' }
  if (fase === 'leads')      return { label: 'Leads',      chip: 'border-gold-500/40 text-gold-400 bg-gold-500/10',    dot: 'bg-gold-500' }
  if (fase === 'cerrado')    return { label: 'Cerrado',    chip: 'border-white/15 text-slate bg-white/5',              dot: 'bg-slate' }
  return                            { label: 'Ingresado',  chip: 'border-white/15 text-slate bg-white/5',              dot: 'bg-slate' }
}

const actividadCfg = (tipo: 'activo' | 'registro') => {
  if (tipo === 'activo') return { color: 'bg-gold-500/10', icon: '#ddc06a' }
  return { color: 'bg-[#4F46E5]/10', icon: '#a5a1f5' }
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function PipelineBar({ activos }: { activos: Activo[] }) {
  const conteo: Record<string, number> = {}
  for (const a of activos) conteo[a.status] = (conteo[a.status] || 0) + 1

  const fases = [
    { key: 'valoracion', label: 'Valoración', color: '#D97706' },
    { key: 'marketing',  label: 'Marketing',  color: '#7b76ea' },
    { key: 'leads',      label: 'Leads',      color: '#c9a227' },
    { key: 'cerrado',    label: 'Cerrado',    color: '#5f6a80' },
  ].map(f => ({ ...f, count: conteo[f.key] || 0 }))
  const total = activos.length

  return (
    <div className="bg-navy-800 border border-white/10 p-6">
      <p className="font-fraunces text-[16px] font-medium text-paper mb-1">Pipeline de activos</p>
      <p className="text-[12px] text-slate mb-5">{total} activo{total !== 1 ? 's' : ''} en el ecosistema</p>
      {total === 0 ? (
        <p className="text-[12px] text-slate">Todavía no hay activos registrados.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden gap-0.5 mb-4">
            {fases.filter(f => f.count > 0).map(f => (
              <div key={f.key} style={{ width: `${(f.count / total) * 100}%`, backgroundColor: f.color }} />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fases.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="w-2 h-2 shrink-0" style={{ backgroundColor: f.color }} />
                <div>
                  <p className="font-plex-mono text-[13px] font-medium text-paper">{f.count}</p>
                  <p className="text-[10px] text-slate">{f.label}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const rolLabel = (rol: string) => {
  if (rol === 'propietario')   return { label: 'Propietario',   chip: 'border-gold-500/40 text-gold-400 bg-gold-500/10' }
  if (rol === 'inversionista') return { label: 'Inversionista', chip: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10' }
  if (rol === 'broker')        return { label: 'Broker',        chip: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10' }
  return                              { label: rol,             chip: 'border-white/15 text-slate bg-white/5' }
}

export default function PanelPage() {
  const router  = useRouter()
  const [loading, setLoading]       = useState(true)
  const [userName, setUserName]     = useState('')
  const [filtroFase, setFiltroFase] = useState<string>('todos')
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [activos, setActivos]         = useState<Activo[]>([])
  const [usuarios, setUsuarios]       = useState<UsuarioMin[]>([])
  const [perfiles, setPerfiles]       = useState<PerfilIntencion[]>([])
  const [copiedLink, setCopiedLink]   = useState(false)
  // Estado de la invitación por correo disparada al aprobar (ver app/api/invitar-usuario) —
  // separado del status de la solicitud: si la invitación falla, la solicitud sigue "aprobada",
  // pero se muestra la alerta para que el Broker Maestro sepa que hay que reintentar.
  const [inviteEstado, setInviteEstado] = useState<Record<string, { estado: 'enviando' | 'ok' | 'error'; mensaje?: string }>>({})

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('usuarios')
        .select('nombre, rol')
        .eq('id', user.id)
        .single()

      // /panel es solo del Broker Maestro — antes cualquier usuario autenticado (propietario,
      // broker, inversionista) que escribiera esta URL veía el panel completo, incluyendo
      // aprobar/rechazar solicitudes (dispara invitación real) y la cola de prospección de
      // brokers. Mismo patrón de redirección que ya usa /dashboard con inversionista/broker.
      const HOME_POR_ROL: Record<string, string> = { propietario: '/dashboard', broker: '/portal-broker', inversionista: '/portal-inversion' }
      const rolUsuario = (profile as { rol: string | null } | null)?.rol
      if (rolUsuario !== 'broker_maestro') {
        router.push(HOME_POR_ROL[rolUsuario ?? ''] || '/dashboard')
        return
      }

      setUserName((profile as { nombre: string } | null)?.nombre || user.email || 'Broker Maestro')

      const [{ data: solicitudesData }, { data: activosData }, { data: usuariosData }, { data: perfilesData }] = await Promise.all([
        supabase.from('solicitudes').select('*').order('created_at', { ascending: false }),
        supabase.from('activos').select('id, usuario_id, broker_id, nombre, tipo, municipio, precio_total, status, created_at'),
        supabase.from('usuarios').select('id, nombre, rol'),
        supabase.from('perfiles_intencion').select('usuario_id, presupuesto, tipo_activo_interes'),
      ])
      setSolicitudes((solicitudesData as Solicitud[]) || [])
      setActivos((activosData as Activo[]) || [])
      setUsuarios((usuariosData as UsuarioMin[]) || [])
      setPerfiles((perfilesData as PerfilIntencion[]) || [])

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
    await enviarInvitacion(id, solicitud.email, solicitud.nombre, solicitud.rol)
  }

  const enviarInvitacion = async (id: string, email: string, nombre: string, rol: string) => {
    setInviteEstado(prev => ({ ...prev, [id]: { estado: 'enviando' } }))
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/invitar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email, nombre, rol }),
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
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando panel…</p>
      </div>
    )
  }

  const nombreDe = (id: string | null) => id ? (usuarios.find(u => u.id === id)?.nombre ?? '—') : null

  const activosFiltrados = filtroFase === 'todos'
    ? activos
    : activos.filter(a => a.status === filtroFase)

  const volumenTotal = activos.reduce((a, c) => a + (c.precio_total || 0), 0)
  const cerrados     = activos.filter(a => a.status === 'cerrado').length
  const enProceso    = activos.filter(a => a.status !== 'cerrado').length

  const brokersAliados = usuarios.filter(u => u.rol === 'broker').map(b => {
    const propios = activos.filter(a => a.broker_id === b.id)
    return {
      nombre: b.nombre,
      activos: propios.length,
      cerrados: propios.filter(a => a.status === 'cerrado').length,
      volumen: propios.reduce((s, a) => s + (a.precio_total || 0), 0),
    }
  })

  const inversionistasRegistrados = usuarios.filter(u => u.rol === 'inversionista').map(inv => {
    const perfil = perfiles.find(p => p.usuario_id === inv.id)
    return {
      nombre: inv.nombre,
      intereses: perfil?.tipo_activo_interes || 'Sin perfil capturado',
      presupuesto: perfil?.presupuesto || '—',
    }
  })

  // Actividad reciente real, derivada de dos fuentes con fecha (no hay tabla de eventos) —
  // activos nuevos y solicitudes ya aprobadas — combinadas y ordenadas por fecha real.
  const actividad = [
    ...activos.map(a => ({ tipo: 'activo' as const, texto: `Nuevo activo registrado: ${a.nombre}`, fecha: a.created_at })),
    ...solicitudes.filter(s => s.status === 'aprobada').map(s => ({ tipo: 'registro' as const, texto: `Nuevo usuario aprobado: ${s.nombre} (${rolLabel(s.rol).label})`, fecha: s.created_at })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 6)

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
      <Topbar userName={userName} rol="broker_maestro" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[1100px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <span className="font-plex-mono text-[11px] font-medium text-gold-400 tracking-[0.18em] uppercase">Broker Maestro</span>
              <h1 className="font-fraunces text-[24px] md:text-[30px] font-medium text-paper mt-1">Panel del Ecosistema</h1>
              <p className="text-[13px] md:text-[14px] text-slate mt-1.5">Vista global de activos, brokers, propietarios e inversionistas</p>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => router.push('/panel/prospectos-broker')}
                className="flex items-center gap-2 font-plex-mono text-[11.5px] tracking-[0.03em] px-3 md:px-4 py-2.5 border border-white/15 hover:border-gold-500 transition-colors text-paper-dim hover:text-gold-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
                Prospección de brokers
              </button>
              <button onClick={compartirEnlace}
                className="flex items-center gap-2 font-plex-mono text-[11.5px] tracking-[0.03em] px-3 md:px-4 py-2.5 border border-white/15 hover:border-gold-500 transition-colors text-paper-dim hover:text-gold-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M8.59 13.51a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M15.41 10.49a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {copiedLink ? '¡Copiado!' : 'Compartir'}
              </button>
              <button onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 font-plex-mono text-[11.5px] tracking-[0.03em] text-slate hover:text-gold-400 border border-white/15 hover:border-gold-500 px-3 md:px-4 py-2.5 transition-colors">
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
                  <h2 className="font-fraunces text-[17px] font-medium text-paper">Solicitudes de registro</h2>
                  {pendientes.length > 0 && (
                    <span className="font-plex-mono text-[10.5px] font-medium px-2 py-0.5 border border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10">
                      {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-slate">{solicitudes.length} en total</span>
              </div>
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {solicitudes.map((s, i) => {
                  const { label, chip } = rolLabel(s.rol)
                  const isPendiente = s.status === 'pendiente'
                  return (
                    <div key={s.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-4 ${i !== solicitudes.length - 1 ? 'border-b border-white/10' : ''}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 bg-navy-950/60 border border-white/10 flex items-center justify-center shrink-0">
                          <span className="font-plex-mono text-[13px] font-medium text-paper-dim">{s.nombre.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-paper truncate">{s.nombre}</p>
                          <p className="text-[11px] text-slate mt-0.5 truncate">{s.email} {s.telefono ? `· ${s.telefono}` : ''}</p>
                        </div>
                        <span className={`font-plex-mono text-[10.5px] font-medium px-2.5 py-1 border shrink-0 ${chip}`}>{label}</span>
                      </div>
                      {isPendiente ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => actualizarStatus(s.id, 'aprobada')}
                            className="font-plex-mono text-[11.5px] font-medium px-3 py-1.5 bg-gold-500 text-navy-950 hover:bg-gold-400 transition-colors">
                            Aprobar
                          </button>
                          <button
                            onClick={() => actualizarStatus(s.id, 'rechazada')}
                            className="font-plex-mono text-[11.5px] px-3 py-1.5 border border-white/15 text-slate hover:text-paper hover:border-white/30 transition-colors">
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                          <span className={`font-plex-mono text-[10.5px] font-medium px-2.5 py-1 border self-start sm:self-auto ${s.status === 'aprobada' ? 'border-gold-500/40 text-gold-400 bg-gold-500/10' : 'border-white/15 text-slate bg-white/5'}`}>
                            {s.status === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                          </span>
                          {s.status === 'aprobada' && inviteEstado[s.id] && (
                            inviteEstado[s.id].estado === 'enviando' ? (
                              <span className="text-[10px] text-slate">Enviando invitación…</span>
                            ) : inviteEstado[s.id].estado === 'ok' ? (
                              <span className="text-[10px] text-gold-400">✓ Invitación enviada</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[#f3a3a3]">{inviteEstado[s.id].mensaje}</span>
                                {inviteEstado[s.id].mensaje !== 'Ya existe una cuenta con este correo.' && (
                                  <button
                                    onClick={() => enviarInvitacion(s.id, s.email, s.nombre, s.rol)}
                                    className="text-[10px] font-medium text-gold-400 hover:text-gold-100 underline">
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

          {/* Métricas globales — ya vienen de activos/usuarios reales de Supabase. */}
          <div>
            <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.14em] mb-3">Métricas globales</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
            {[
              { label: 'En proceso',     value: String(enProceso),                     sub: 'sin cerrar',      color: 'text-paper' },
              { label: 'Cerrados',       value: String(cerrados),                      sub: 'este ciclo',       color: 'text-gold-400' },
              { label: 'Volumen',        value: formatMXN(volumenTotal),               sub: 'valor portafolio', color: 'text-[#a5a1f5]' },
              { label: 'Brokers',        value: String(brokersAliados.length),         sub: 'activos',          color: 'text-[#e8b568]' },
              { label: 'Inversionistas', value: String(inversionistasRegistrados.length), sub: 'registrados',   color: 'text-paper' },
            ].map(m => (
              <div key={m.label} className="bg-navy-800 border border-white/10 p-4 md:p-5">
                <p className="font-plex-mono text-[10px] text-slate uppercase tracking-wide mb-2">{m.label}</p>
                <p className={`font-fraunces text-[17px] md:text-[19px] font-medium leading-tight ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-slate mt-0.5">{m.sub}</p>
              </div>
            ))}
          </div>
          </div>

          {/* Pipeline + Actividad reciente */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <PipelineBar activos={activos} />
            </div>

            {/* Actividad reciente */}
            <div className="bg-navy-800 border border-white/10 p-5 flex flex-col gap-1">
              <p className="font-fraunces text-[14px] font-medium text-paper mb-3">Actividad reciente</p>
              {actividad.length === 0 ? (
                <p className="text-[11px] text-slate">Sin actividad todavía.</p>
              ) : (
                <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 160 }}>
                  {actividad.map((a, i) => {
                    const cfg = actividadCfg(a.tipo)
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`w-6 h-6 flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.icon }} />
                        </div>
                        <div>
                          <p className="text-[11px] text-paper-dim leading-snug">{a.texto}</p>
                          <p className="text-[10px] text-slate mt-0.5">{tiempoRelativo(a.fecha)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Activos del ecosistema */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="font-fraunces text-[17px] font-medium text-paper">Activos del ecosistema</h2>
              <div className="flex items-center flex-wrap gap-1.5">
                {['todos', 'valoracion', 'marketing', 'leads', 'cerrado'].map(f => (
                  <button key={f} onClick={() => setFiltroFase(f)}
                    className={`font-plex-mono text-[10.5px] px-3 py-1.5 capitalize transition-colors ${
                      filtroFase === f
                        ? 'bg-gold-500 text-navy-950'
                        : 'border border-white/15 text-slate hover:text-paper hover:border-white/30'
                    }`}>
                    {f === 'todos' ? 'Todos' : faseCfg(f).label}
                  </button>
                ))}
              </div>
            </div>

            {activosFiltrados.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 p-8 text-center">
                <p className="text-[13px] text-slate">Sin activos que mostrar con este filtro.</p>
              </div>
            ) : (
            <div className="bg-navy-800 border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[580px]">
                  <div className="grid grid-cols-6 px-4 md:px-6 py-3 border-b border-white/10 bg-white/[0.02]">
                    {['Activo', 'Propietario', 'Broker', 'Municipio', 'Precio', 'Fase'].map(h => (
                      <p key={h} className="font-plex-mono text-[10px] text-slate uppercase tracking-wide">{h}</p>
                    ))}
                  </div>
                  {activosFiltrados.map((a, i) => {
                    const cfg = faseCfg(a.status)
                    const nombreBroker = nombreDe(a.broker_id)
                    return (
                      <div key={a.id}
                        className={`grid grid-cols-6 items-center px-4 md:px-6 py-4 ${i !== activosFiltrados.length - 1 ? 'border-b border-white/10' : ''} hover:bg-white/[0.02] transition-colors`}>
                        <div>
                          <p className="text-[13px] font-medium text-paper truncate">{a.nombre}</p>
                          <p className="text-[10px] text-slate">{a.tipo}</p>
                        </div>
                        <p className="text-[12px] text-paper-dim truncate">{nombreDe(a.usuario_id) ?? '—'}</p>
                        {nombreBroker ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center font-plex-mono text-[9px] font-medium shrink-0 bg-[#4F46E5]/20 text-[#a5a1f5]">
                              {nombreBroker.charAt(0)}
                            </div>
                            <p className="text-[12px] text-paper-dim truncate">{nombreBroker}</p>
                          </div>
                        ) : (
                          <p className="text-[12px] text-slate">Sin asignar</p>
                        )}
                        <p className="text-[12px] text-paper-dim">{a.municipio}</p>
                        <p className="font-plex-mono text-[12px] text-paper">{formatMXN(a.precio_total || 0)}</p>
                        <span className={`font-plex-mono text-[10px] font-medium px-2 py-1 border w-fit flex items-center gap-1.5 ${cfg.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Brokers aliados + Inversionistas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Brokers */}
            <div>
              <h2 className="font-fraunces text-[17px] font-medium text-paper mb-4">Brokers aliados</h2>
              {brokersAliados.length === 0 ? (
                <div className="bg-navy-800 border border-white/10 p-6 text-center">
                  <p className="text-[13px] text-slate">Sin brokers registrados todavía.</p>
                </div>
              ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {brokersAliados.map((b, i) => (
                  <div key={i} className={`px-5 py-4 ${i !== brokersAliados.length - 1 ? 'border-b border-white/10' : ''}`}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-[#4F46E5]/15 flex items-center justify-center">
                        <span className="font-plex-mono text-[12px] font-medium text-[#a5a1f5]">{b.nombre.charAt(0)}</span>
                      </div>
                      <p className="text-[13px] font-medium text-paper">{b.nombre}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Activos', value: b.activos },
                        { label: 'Cerrados', value: b.cerrados },
                        { label: 'Volumen', value: formatMXN(b.volumen) },
                      ].map(s => (
                        <div key={s.label} className="bg-navy-950/60 border border-white/5 p-2.5 text-center">
                          <p className="font-plex-mono text-[13px] font-medium text-paper">{s.value}</p>
                          <p className="text-[10px] text-slate">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>

            {/* Inversionistas */}
            <div>
              <h2 className="font-fraunces text-[17px] font-medium text-paper mb-4">Inversionistas registrados</h2>
              {inversionistasRegistrados.length === 0 ? (
                <div className="bg-navy-800 border border-white/10 p-6 text-center">
                  <p className="text-[13px] text-slate">Sin inversionistas registrados todavía.</p>
                </div>
              ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                {inversionistasRegistrados.map((inv, i) => (
                  <div key={i} className={`px-5 py-4 flex items-start gap-2.5 ${i !== inversionistasRegistrados.length - 1 ? 'border-b border-white/10' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-gold-500/15 flex items-center justify-center shrink-0">
                      <span className="font-plex-mono text-[12px] font-medium text-gold-400">{inv.nombre.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-paper">{inv.nombre}</p>
                      <p className="text-[11px] text-slate mt-0.5">{inv.intereses}</p>
                      <p className="text-[11px] text-paper-dim font-medium mt-0.5">{inv.presupuesto}</p>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>

          </div>

        </div>
      </main>
      </div>
    </div>
  )
}
