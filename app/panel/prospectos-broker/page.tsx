'use client'

// Módulo de Prospección de Brokers — cola de revisión manual + alta manual + scoring.
// Ver HANDOFF_Prospeccion_Brokers.md. Ingesta automatizada (AMPI/colegios/LinkedIn) y contacto
// automatizado están fuera de alcance — pendientes del spike de AMPI y del aviso LFPDPPP
// respectivamente (ver banner en la UI).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../../components/Topbar'
import { Field, inputCls } from '../../components/FormField'
import { calcularScore, UMBRAL_COLA } from '@/lib/prospectosBrokerScore'

type Fuente = 'ampi' | 'colegio_corredores' | 'portal_listado' | 'linkedin_manual'
type Estado = 'nuevo' | 'en_revision' | 'contactado' | 'interesado' | 'descartado' | 'convertido'
type TieneLicencia = 'si' | 'no' | 'no_se'

interface Prospecto {
  id: string
  nombre: string
  fuente: Fuente
  fuente_ref: string | null
  zona: string | null
  volumen_listados_aparente: number | null
  score_filtrado: number | null
  estado: Estado
  afiliacion_previa: boolean
  fecha_prospectado: string
  fecha_contacto: string | null
  notas: string | null
  email: string | null
  telefono: string | null
}

const FUENTE_LABEL: Record<Fuente, string> = {
  ampi: 'AMPI',
  colegio_corredores: 'Colegio de corredores',
  portal_listado: 'Portal de listados',
  linkedin_manual: 'LinkedIn (manual)',
}

const ESTADO_LABEL: Record<Estado, string> = {
  nuevo: 'Nuevo',
  en_revision: 'En revisión',
  contactado: 'Contactado',
  interesado: 'Interesado',
  descartado: 'Descartado',
  convertido: 'Convertido',
}

// Chips en tema oscuro: borde + texto en el tono semántico sobre fondo casi transparente.
const ESTADO_CHIP: Record<Estado, string> = {
  nuevo: 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10',
  en_revision: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10',
  contactado: 'border-white/15 text-slate bg-white/5',
  interesado: 'border-gold-500/40 text-gold-400 bg-gold-500/10',
  descartado: 'border-white/15 text-slate bg-white/5',
  convertido: 'border-white/25 text-paper bg-white/10',
}

// Transiciones válidas por estado — ver plan: "descartado" se permite desde cualquier estado
// activo (no solo al final de la cadena), "convertido" solo desde "interesado". Nada de
// auto-avance: cada cambio lo dispara un humano desde la UI.
const TRANSICIONES: Record<Estado, Estado[]> = {
  nuevo: ['en_revision', 'descartado'],
  en_revision: ['contactado', 'descartado'],
  contactado: ['interesado', 'descartado'],
  interesado: ['convertido', 'descartado'],
  descartado: [],
  convertido: [],
}

const ALTA_INICIAL = {
  nombre: '',
  fuente: 'portal_listado' as Fuente,
  fuente_ref: '',
  zona: '',
  volumen_listados_aparente: '',
  email: '',
  telefono: '',
}

export default function ProspectosBrokerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [filtro, setFiltro] = useState<'cola' | 'todos'>('cola')
  const [alta, setAlta] = useState(ALTA_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [errorAlta, setErrorAlta] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null)
  // Verificación de cédula/licencia al convertir — versión mínima manual (ver Documento Maestro
  // V5, Sección 7: el mecanismo de verificación es una decisión de producto sin resolver, esto
  // NO es un gate automatizado ni bloquea la conversión, es solo un registro de la respuesta.
  const [convirtiendo, setConvirtiendo] = useState<Prospecto | null>(null)
  const [licenciaForm, setLicenciaForm] = useState<{ tieneLicencia: TieneLicencia; notas: string }>({ tieneLicencia: 'no_se', notas: '' })
  const [guardandoConversion, setGuardandoConversion] = useState(false)
  // Estado de la invitación disparada desde "convertido" — mismo patrón que /panel
  // (ver enviarInvitacion en app/panel/page.tsx).
  const [inviteEstado, setInviteEstado] = useState<Record<string, { estado: 'enviando' | 'ok' | 'error'; mensaje?: string }>>({})

  const cargar = async () => {
    const { data } = await supabase
      .from('prospectos_broker')
      .select('*')
      .order('score_filtrado', { ascending: false, nullsFirst: false })
    setProspectos((data as Prospecto[]) || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('usuarios').select('nombre').eq('id', user.id).single()
      setUserName((profile as { nombre: string } | null)?.nombre || user.email || 'Broker Maestro')

      await cargar()
      setLoading(false)
    }
    init()
  }, [router])

  const handleAlta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alta.nombre.trim()) { setErrorAlta('El nombre es obligatorio.'); return }
    setErrorAlta('')
    setGuardando(true)

    const volumen = alta.volumen_listados_aparente ? parseInt(alta.volumen_listados_aparente, 10) : null
    const { score } = calcularScore({ zona: alta.zona, volumenListadosAparente: volumen, afiliacionPrevia: false })

    const { error: err } = await supabase.from('prospectos_broker').insert({
      nombre: alta.nombre,
      fuente: alta.fuente,
      fuente_ref: alta.fuente_ref || null,
      zona: alta.zona || null,
      volumen_listados_aparente: volumen,
      score_filtrado: score,
      email: alta.email || null,
      telefono: alta.telefono || null,
    })

    if (err) {
      setErrorAlta('Error al guardar el prospecto. Intenta de nuevo.')
      setGuardando(false)
      return
    }

    setAlta(ALTA_INICIAL)
    setGuardando(false)
    await cargar()
  }

  const cambiarEstado = async (p: Prospecto, nuevoEstado: Estado) => {
    // "convertido" pasa primero por la pregunta de licencia — ver abrirConversion/confirmarConversion.
    if (nuevoEstado === 'convertido') { setConvirtiendo(p); setLicenciaForm({ tieneLicencia: 'no_se', notas: '' }); return }

    const patch: Partial<Prospecto> = { estado: nuevoEstado }
    if (nuevoEstado === 'contactado' && !p.fecha_contacto) patch.fecha_contacto = new Date().toISOString()
    await supabase.from('prospectos_broker').update(patch).eq('id', p.id)
    setProspectos(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))
  }

  const confirmarConversion = async () => {
    if (!convirtiendo) return
    setGuardandoConversion(true)

    await supabase.from('verificaciones_broker').insert({
      prospecto_id: convirtiendo.id,
      tiene_licencia: licenciaForm.tieneLicencia === 'no_se' ? null : licenciaForm.tieneLicencia === 'si',
      notas: licenciaForm.notas || null,
    })

    // No tener licencia no bloquea la conversión — es solo informativo para dar seguimiento
    // después (ver Documento Maestro V5, Sección 7: el gate real todavía no está diseñado).
    await supabase.from('prospectos_broker').update({ estado: 'convertido' }).eq('id', convirtiendo.id)
    setProspectos(prev => prev.map(x => x.id === convirtiendo.id ? { ...x, estado: 'convertido' as Estado } : x))

    setGuardandoConversion(false)
    setConvirtiendo(null)
  }

  const guardarNotas = async (id: string, notas: string) => {
    await supabase.from('prospectos_broker').update({ notas }).eq('id', id)
  }

  // Cierra el hueco del flujo: antes "convertido" no creaba cuenta ni mandaba nada — quedaba
  // marcado en la base sin que el broker se enterara. Mismo endpoint que usa /panel para los
  // otros roles (ver app/api/invitar-usuario).
  const invitarProspecto = async (p: Prospecto) => {
    if (!p.email) return
    setInviteEstado(prev => ({ ...prev, [p.id]: { estado: 'enviando' } }))
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/invitar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: p.email, nombre: p.nombre, rol: 'broker' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setInviteEstado(prev => ({ ...prev, [p.id]: { estado: 'error', mensaje: json.error || 'Error al enviar la invitación' } }))
        return
      }
      setInviteEstado(prev => ({ ...prev, [p.id]: { estado: 'ok' } }))
    } catch {
      setInviteEstado(prev => ({ ...prev, [p.id]: { estado: 'error', mensaje: 'Error de red al enviar la invitación' } }))
    }
  }

  // La ingesta corre en el navegador del Broker Maestro, no en el backend de Vercel: el
  // directorio de AMPI (vía backampi.inmoapp.mx) tiene CORS abierto (Access-Control-Allow-Origin:
  // *) pero su Cloudflare rechaza con 403 las peticiones que salen desde las IPs de las funciones
  // serverless de Vercel (probable bloqueo genérico a tráfico de datacenter) — desde un navegador
  // normal sí responde 200. Por eso se llama directo desde aquí en vez de por una API route.
  const importarAmpi = async () => {
    setImportando(true)
    setResultadoImport(null)
    try {
      const res = await fetch('https://backampi.inmoapp.mx/api/landing/partners/ampimty.com')
      if (!res.ok) throw new Error(`Respuesta ${res.status} del directorio de AMPI`)
      const socios: { name: string; url: string | null; email: string | null; phone: string | null; province: string | null }[] = await res.json()
      if (!Array.isArray(socios)) throw new Error('Formato inesperado del directorio de AMPI')

      const { data: existentes } = await supabase
        .from('prospectos_broker')
        .select('email')
        .eq('fuente', 'ampi')
      const emailsExistentes = new Set((existentes || []).map(r => r.email).filter(Boolean))

      let sinEmail = 0
      const nuevosRegistros = socios
        .filter(s => {
          if (!s.email) { sinEmail++; return false }
          return !emailsExistentes.has(s.email)
        })
        .map(s => {
          const zona = s.province || null
          const { score } = calcularScore({ zona: zona || '', volumenListadosAparente: null, afiliacionPrevia: false })
          return {
            nombre: s.name,
            fuente: 'ampi' as const,
            fuente_ref: s.url || s.email,
            email: s.email,
            telefono: s.phone || null,
            zona,
            volumen_listados_aparente: null,
            score_filtrado: score,
          }
        })

      if (nuevosRegistros.length > 0) {
        const { error: insertError } = await supabase.from('prospectos_broker').insert(nuevosRegistros)
        if (insertError) throw new Error(insertError.message)
      }

      setResultadoImport({
        tipo: 'ok',
        mensaje: `${nuevosRegistros.length} prospecto(s) nuevo(s) agregado(s) (${emailsExistentes.size} ya existían de importaciones anteriores, de ${socios.length} socios en el directorio).`,
      })
      await cargar()
    } catch (e: any) {
      setResultadoImport({ tipo: 'error', mensaje: e.message })
    }
    setImportando(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate text-[14px] font-plex-mono">Cargando…</p>
      </div>
    )
  }

  const visibles = filtro === 'todos'
    ? prospectos
    : prospectos.filter(p => p.estado === 'nuevo' || (p.score_filtrado ?? 0) >= UMBRAL_COLA)

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
      <Topbar userName={userName} rol="broker_maestro" tema="oscuro" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[1100px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <button onClick={() => router.push('/panel')}
              className="flex items-center gap-1.5 text-[13px] text-slate hover:text-paper mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Panel del ecosistema
            </button>
            <span className="font-plex-mono text-[11px] font-medium text-gold-400 tracking-[0.18em] uppercase">Broker Maestro</span>
            <h1 className="font-fraunces text-[24px] md:text-[30px] font-medium text-paper mt-1">Prospección de Brokers</h1>
            <p className="text-[13px] md:text-[14px] text-slate mt-1.5">Cola de revisión manual — ingesta automatizada desde AMPI ya activa</p>
          </div>

          <div className="bg-gold-500/[0.06] border-l-2 border-gold-500 px-4 py-3">
            <p className="text-[12.5px] text-paper-dim">
              <b className="text-gold-400">Cuidado con el botón "Invitar a esta cuenta":</b> mandarle un correo real a alguien tomado de una fuente como AMPI SÍ es contacto real a un tercero — el aviso de privacidad LFPDPPP sigue sin redactarse. Úsalo solo si ya tienes una base legal para ese contacto (relación previa, consentimiento, etc.), no como parte del flujo estándar de prospección hasta que el aviso exista.
            </p>
          </div>

          {/* Ingesta AMPI */}
          <div className="bg-navy-800 border border-white/10 p-4 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
            <div>
              <p className="text-[13px] font-medium text-paper">Directorio de socios AMPI Monterrey</p>
              <p className="text-[12px] text-slate mt-0.5">Trae los socios públicos del directorio y los agrega a la cola como nuevos (se salta los que ya se importaron antes). No contacta a nadie.</p>
            </div>
            <button onClick={importarAmpi} disabled={importando}
              className="shrink-0 px-5 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] tracking-[0.03em] hover:bg-gold-400 transition-colors disabled:opacity-60 whitespace-nowrap">
              {importando ? 'Importando…' : 'Importar desde AMPI'}
            </button>
          </div>
          {resultadoImport && (
            <div className={`px-4 py-3 text-[12.5px] border ${resultadoImport.tipo === 'ok' ? 'border-[#4F46E5]/40 text-[#a5a1f5] bg-[#4F46E5]/10' : 'border-red-900/60 text-[#f3a3a3] bg-red-950/20'}`}>
              {resultadoImport.mensaje}
            </div>
          )}

          {/* Alta manual */}
          <div className="bg-navy-800 border border-white/10 p-4 md:p-6">
            <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em] mb-4">Alta manual de candidato</p>
            <form onSubmit={handleAlta} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre" required tema="oscuro">
                  <input type="text" value={alta.nombre} onChange={e => setAlta(a => ({ ...a, nombre: e.target.value }))}
                    placeholder="Nombre del broker o agencia" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Fuente" required tema="oscuro">
                  <select value={alta.fuente} onChange={e => setAlta(a => ({ ...a, fuente: e.target.value as Fuente }))} className={inputCls(false, 'oscuro')}>
                    {(Object.keys(FUENTE_LABEL) as Fuente[]).map(f => <option key={f} value={f} className="bg-navy-900">{FUENTE_LABEL[f]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Referencia de fuente" tema="oscuro">
                  <input type="text" value={alta.fuente_ref} onChange={e => setAlta(a => ({ ...a, fuente_ref: e.target.value }))}
                    placeholder="URL o identificador" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Zona" tema="oscuro">
                  <input type="text" value={alta.zona} onChange={e => setAlta(a => ({ ...a, zona: e.target.value }))}
                    placeholder="Ej. San Pedro Garza García" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Volumen de listados aparente" tema="oscuro">
                  <input type="number" min="0" value={alta.volumen_listados_aparente} onChange={e => setAlta(a => ({ ...a, volumen_listados_aparente: e.target.value }))}
                    placeholder="0" className={inputCls(false, 'oscuro')} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Correo (necesario para poder invitarlo más adelante)" tema="oscuro">
                  <input type="email" value={alta.email} onChange={e => setAlta(a => ({ ...a, email: e.target.value }))}
                    placeholder="correo@ejemplo.com" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Teléfono" tema="oscuro">
                  <input type="tel" value={alta.telefono} onChange={e => setAlta(a => ({ ...a, telefono: e.target.value }))}
                    placeholder="+52 81 0000 0000" className={inputCls(false, 'oscuro')} />
                </Field>
              </div>
              {errorAlta && <p className="text-[12px] text-[#f3a3a3]">{errorAlta}</p>}
              <button type="submit" disabled={guardando}
                className="self-start px-5 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] tracking-[0.03em] hover:bg-gold-400 transition-colors disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Agregar a la cola'}
              </button>
            </form>
          </div>

          {/* Cola de revisión */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-fraunces text-[17px] font-medium text-paper">Cola de revisión</h2>
              <div className="flex items-center gap-1.5">
                {(['cola', 'todos'] as const).map(f => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`font-plex-mono text-[10.5px] px-3 py-1.5 transition-colors ${filtro === f ? 'bg-gold-500 text-navy-950' : 'border border-white/15 text-slate hover:text-paper hover:border-white/30'}`}>
                    {f === 'cola' ? `Nuevo + score ≥ ${UMBRAL_COLA}` : 'Todos'}
                  </button>
                ))}
              </div>
            </div>

            {visibles.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 p-8 text-center">
                <p className="text-[13px] text-slate">Sin prospectos que mostrar con este filtro.</p>
              </div>
            ) : (
              <div className="bg-navy-800 border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="min-w-[940px]">
                    <div className="grid grid-cols-8 gap-2 px-4 md:px-6 py-3 border-b border-white/10 bg-white/[0.02]">
                      {['Nombre', 'Contacto', 'Fuente', 'Zona', 'Score', 'Estado', 'Notas', 'Acción'].map(h => (
                        <p key={h} className="font-plex-mono text-[10px] text-slate uppercase tracking-wide">{h}</p>
                      ))}
                    </div>
                    {visibles.map((p, i) => (
                      <div key={p.id} className={`grid grid-cols-8 gap-2 items-center px-4 md:px-6 py-3 ${i !== visibles.length - 1 ? 'border-b border-white/10' : ''}`}>
                        <p className="text-[13px] font-medium text-paper truncate">{p.nombre}</p>
                        <p className="text-[12px] text-paper-dim truncate">{p.email || p.telefono || '—'}</p>
                        <p className="text-[12px] text-paper-dim">{FUENTE_LABEL[p.fuente]}</p>
                        <p className="text-[12px] text-paper-dim truncate">{p.zona || '—'}</p>
                        <p className="font-plex-mono text-[13px] font-medium text-paper">{p.score_filtrado ?? '—'}</p>
                        <span className={`font-plex-mono text-[10px] font-medium px-2 py-1 border w-fit ${ESTADO_CHIP[p.estado]}`}>{ESTADO_LABEL[p.estado]}</span>
                        <input
                          type="text"
                          defaultValue={p.notas || ''}
                          onBlur={e => guardarNotas(p.id, e.target.value)}
                          placeholder="Sin notas…"
                          className="text-[12px] px-2 py-1.5 border border-white/15 bg-navy-950/60 text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 w-full"
                        />
                        <div className="flex flex-wrap gap-1">
                          {TRANSICIONES[p.estado].map(next => (
                            <button key={next} onClick={() => cambiarEstado(p, next)}
                              className="font-plex-mono text-[10px] px-2 py-1 border border-white/15 text-paper-dim hover:border-gold-500 hover:text-gold-400 transition-colors">
                              {ESTADO_LABEL[next]}
                            </button>
                          ))}
                          {p.estado === 'convertido' && (
                            inviteEstado[p.id]?.estado === 'ok' ? (
                              <span className="text-[10px] text-gold-400">✓ Invitado</span>
                            ) : inviteEstado[p.id]?.estado === 'enviando' ? (
                              <span className="text-[10px] text-slate">Enviando…</span>
                            ) : p.email ? (
                              <div className="flex flex-col gap-1">
                                <button onClick={() => invitarProspecto(p)}
                                  className="font-plex-mono text-[10px] px-2 py-1 border border-gold-500 text-gold-400 hover:bg-gold-500/10 transition-colors">
                                  Invitar a esta cuenta
                                </button>
                                {inviteEstado[p.id]?.estado === 'error' && (
                                  <span className="text-[10px] text-[#f3a3a3]">{inviteEstado[p.id].mensaje}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate">Sin correo — no se puede invitar</span>
                            )
                          )}
                          {p.estado !== 'convertido' && TRANSICIONES[p.estado].length === 0 && <span className="text-[11px] text-slate">—</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
      </div>

      {convirtiendo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
          <div className="relative w-full max-w-[440px] before:content-[''] before:absolute before:inset-0 before:border before:border-gold-500/30 before:translate-x-2 before:translate-y-2 before:-z-10">
            <div className="bg-navy-800 border border-white/10 p-6">
              <p className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em] mb-1">Marcar como convertido</p>
              <h3 className="font-fraunces text-[18px] font-medium text-paper mb-4">{convirtiendo.nombre}</h3>

              <p className="text-[12.5px] text-paper-dim mb-2">¿Tiene cédula/licencia vigente? <span className="text-slate">(no bloquea la conversión, solo se registra para dar seguimiento)</span></p>
              <div className="flex gap-2 mb-4">
                {(['si', 'no', 'no_se'] as TieneLicencia[]).map(op => (
                  <button key={op} type="button" onClick={() => setLicenciaForm(f => ({ ...f, tieneLicencia: op }))}
                    className={`flex-1 font-plex-mono text-[11.5px] py-2 border transition-colors ${licenciaForm.tieneLicencia === op ? 'bg-gold-500 text-navy-950 border-gold-500' : 'border-white/15 text-paper-dim hover:border-gold-500'}`}>
                    {op === 'si' ? 'Sí' : op === 'no' ? 'No' : 'No sé'}
                  </button>
                ))}
              </div>

              <Field label="Notas (opcional)" tema="oscuro">
                <textarea value={licenciaForm.notas} onChange={e => setLicenciaForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Ej. número de cédula, vigencia, cómo se verificó…" rows={3} className={inputCls(false, 'oscuro')} />
              </Field>

              <div className="flex gap-2 mt-5">
                <button type="button" onClick={() => setConvirtiendo(null)} disabled={guardandoConversion}
                  className="flex-1 py-2.5 border border-white/15 text-paper-dim font-plex-mono text-[12px] hover:border-white/30 transition-colors disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={confirmarConversion} disabled={guardandoConversion}
                  className="flex-1 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] hover:bg-gold-400 transition-colors disabled:opacity-60">
                  {guardandoConversion ? 'Guardando…' : 'Confirmar conversión'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
