'use client'

// Portal del broker — Documento Maestro V6.1, §5.2 y §10: el broker es protagonista del
// ecosistema como proveedor de los dos lados del matching:
//   - Mi portafolio: las propiedades que representa (oferta). Cada una pasa por el diagnóstico.
//   - Mis clientes: lo que buscan sus clientes (demanda), como filas de perfiles_intencion con
//     broker_id y alias. Sin teléfono ni correo del cliente: el contacto sigue siendo del broker
//     (V6 §6.2, decisión aprobada por JC el 2026-10-04).
//   - Mi desempeño: conteos reales de su propia operación.
// El motor de matching todavía no existe (Fase B del plan) -- este portal no inventa matches.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { statusCfg, formatDate, ESTADOS_ACTIVO } from '@/lib/estadoActivo'
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

const PRESUPUESTOS = ['Menos de $2M', '$2M – $5M', '$5M – $15M', '$15M – $50M', 'Más de $50M']
const CLIENTE_VACIO = { alias_cliente: '', presupuesto: '', zona: '', tipo_activo_interes: '', tesis_inversion: '' }
type Pestana = 'portafolio' | 'clientes' | 'desempeno'

export default function PortalBrokerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [pestana, setPestana] = useState<Pestana>('portafolio')
  const [activos, setActivos] = useState<ActivoPortafolio[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [editandoId, setEditandoId] = useState<string | 'nuevo' | null>(null)
  const [form, setForm] = useState(CLIENTE_VACIO)
  const [consentimiento, setConsentimiento] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorCliente, setErrorCliente] = useState('')

  const cargarClientes = async (uid: string) => {
    const { data } = await supabase
      .from('perfiles_intencion')
      .select('id, alias_cliente, presupuesto, zona, tipo_activo_interes, tesis_inversion, created_at')
      .eq('broker_id', uid)
      .is('usuario_id', null)
      .order('created_at', { ascending: false })
    setClientes((data as Cliente[]) || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: cuenta } = await supabase.from('usuarios').select('nombre').eq('id', user.id).single()
      setUserName((cuenta as { nombre: string } | null)?.nombre || user.email || 'Usuario')

      const { data: activosData } = await supabase
        .from('activos')
        .select('id, nombre, tipo, municipio, estado, status, created_at, propietario_nombre')
        .eq('broker_id', user.id)
        .order('created_at', { ascending: false })
      setActivos((activosData as ActivoPortafolio[]) || [])

      await cargarClientes(user.id)
      setLoading(false)
    }
    init()
  }, [router])

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
    await cargarClientes(userId)
  }

  const borrarCliente = async (id: string) => {
    await supabase.from('perfiles_intencion').delete().eq('id', id)
    setEditandoId(null)
    await cargarClientes(userId)
  }

  const firstName = userName.split(' ')[0]
  const porEstado = ESTADOS_ACTIVO.map(s => ({ s, n: activos.filter(a => a.status === s).length }))

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
              <p className="text-[14px] text-slate mt-1.5">Tu portafolio y lo que buscan tus clientes, en un solo lugar</p>
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
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {([
              { id: 'portafolio', label: 'Mi portafolio', n: activos.length },
              { id: 'clientes',   label: 'Mis clientes',  n: clientes.length },
              { id: 'desempeno',  label: 'Mi desempeño',  n: null },
            ] as { id: Pestana; label: string; n: number | null }[]).map(t => (
              <button key={t.id} onClick={() => setPestana(t.id)}
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
                        <p className="text-[14px] font-medium text-paper truncate">{a.nombre}</p>
                        <p className="text-[11px] text-slate mt-0.5 truncate">
                          {a.tipo} · {a.municipio}, {a.estado}
                          {a.propietario_nombre ? ` · Propietario: ${a.propietario_nombre}` : ''} · {formatDate(a.created_at)}
                        </p>
                      </div>
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

              <p className="text-[12px] text-slate">
                Los matches entre tus clientes y las propiedades de toda la red llegan en la siguiente etapa de la plataforma.
              </p>
            </div>
          )}

          {/* Mi desempeño */}
          {pestana === 'desempeno' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Propiedades', value: activos.length },
                  { label: 'Clientes', value: clientes.length },
                  { label: 'Cerradas', value: activos.filter(a => a.status === 'cerrado').length },
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
              <p className="text-[12px] text-slate">
                Pronto: tu nivel de Broker Certificado SMT, calculado con tus cierres reportados y la calidad de tu portafolio.
              </p>
            </div>
          )}

        </div>
      </main>
      </div>
    </div>
  )
}
