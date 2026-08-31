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
  const [activos, setActivos] = useState<Activo[]>([])

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

      setLoading(false)
    }
    init()
  }, [router])

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGuardando(false); return }

    await supabase.from('perfiles_intencion').upsert({
      usuario_id: user.id,
      presupuesto: perfil.presupuesto || null,
      zona: perfil.zona || null,
      tipo_activo_interes: perfil.tipo_activo_interes || null,
      tesis_inversion: perfil.tesis_inversion || null,
      fuente_captura: 'registro_directo',
    }, { onConflict: 'usuario_id' })

    setGuardando(false)
    setTienePerfil(true)
    setEditando(false)
  }

  const firstName = userName.split(' ')[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar userName={userName} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <h1 className="text-[24px] md:text-[28px] font-black text-[#111827] leading-tight">Hola, {firstName}</h1>
            <p className="text-[14px] text-[#8EA0BC] mt-1">Tu perfil de inversión y los activos disponibles</p>
          </div>

          {/* Perfil de intención */}
          <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Tu perfil de inversión</p>
              {tienePerfil && !editando && (
                <button onClick={() => setEditando(true)} className="text-[12px] font-semibold text-[#C9A84C] hover:text-[#0F1F3D] transition-colors">
                  Editar
                </button>
              )}
            </div>

            {!editando ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Presupuesto</p>
                  <p className="text-[14px] text-[#111827] mt-1">{perfil.presupuesto || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Zona de interés</p>
                  <p className="text-[14px] text-[#111827] mt-1">{perfil.zona || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Tipo de activo</p>
                  <p className="text-[14px] text-[#111827] mt-1">{perfil.tipo_activo_interes || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Tesis de inversión</p>
                  <p className="text-[13px] text-[#4B5E7A] mt-1 leading-relaxed">{perfil.tesis_inversion || '—'}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarPerfil} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Presupuesto estimado">
                    <select value={perfil.presupuesto} onChange={e => setPerfil(p => ({ ...p, presupuesto: e.target.value }))} className={inputCls()}>
                      <option value="">Selecciona…</option>
                      {PRESUPUESTOS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Zona de interés">
                    <input type="text" value={perfil.zona} onChange={e => setPerfil(p => ({ ...p, zona: e.target.value }))}
                      placeholder="Ej. San Pedro Garza García" className={inputCls()} />
                  </Field>
                </div>
                <Field label="Tipo de activo de interés">
                  <input type="text" value={perfil.tipo_activo_interes} onChange={e => setPerfil(p => ({ ...p, tipo_activo_interes: e.target.value }))}
                    placeholder="Ej. Terrenos, edificios, desarrollos verticales" className={inputCls()} />
                </Field>
                <Field label="Tesis de inversión (opcional)">
                  <textarea value={perfil.tesis_inversion} onChange={e => setPerfil(p => ({ ...p, tesis_inversion: e.target.value }))}
                    placeholder="¿Qué buscas y por qué? Ej. terreno para desarrollo vertical, horizonte de 3-5 años…" rows={3} className={inputCls()} />
                </Field>
                <div className="flex gap-2">
                  {tienePerfil && (
                    <button type="button" onClick={() => setEditando(false)}
                      className="px-5 py-2.5 rounded-xl border border-[#DDE3EC] text-[#4B5E7A] text-[13px] font-semibold hover:border-[#BFC9D8] transition-colors">
                      Cancelar
                    </button>
                  )}
                  <button type="submit" disabled={guardando}
                    className="px-5 py-2.5 rounded-xl bg-[#C9A84C] text-white text-[13px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60">
                    {guardando ? 'Guardando…' : 'Guardar perfil'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Activos disponibles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-bold text-[#111827]">Activos disponibles</h2>
              <span className="text-[12px] text-[#8EA0BC]">{activos.length}</span>
            </div>
            <p className="text-[12px] text-[#8EA0BC] mb-4">Listado general — todavía no hay un motor de match contra tu perfil, se muestran todos los activos cargados en la plataforma.</p>

            {activos.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] px-8 py-14 text-center">
                <p className="text-[13px] text-[#8EA0BC]">Todavía no hay activos cargados en la plataforma.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                {activos.map((a, i) => (
                  <div key={a.id} className={`flex items-center gap-3 px-4 md:px-6 py-4 ${i !== activos.length - 1 ? 'border-b border-[#EDF1F7]' : ''}`}>
                    <div className="w-9 h-9 rounded-xl bg-[#F5F7FA] border border-[#DDE3EC] flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" stroke="#8EA0BC" strokeWidth="1.5" fill="none"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#111827] truncate">{a.nombre}</p>
                      <p className="text-[11px] text-[#8EA0BC] mt-0.5 truncate">
                        {a.tipo} · {a.municipio}, {a.estado}{a.superficie ? ` · ${a.superficie} m²` : ''} · {formatDate(a.created_at)}
                      </p>
                    </div>
                    {a.precio_total != null && (
                      <span className="text-[13px] font-bold text-[#111827] shrink-0">{formatMXN(a.precio_total)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
