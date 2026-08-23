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

const ESTADO_BADGE: Record<Estado, string> = {
  nuevo: 'bg-[#EEF2FF] text-[#3730A3]',
  en_revision: 'bg-[#FEF3C7] text-[#92600A]',
  contactado: 'bg-[#F3F4F6] text-[#374151]',
  interesado: 'bg-[#FBF5E6] text-[#0F1F3D]',
  descartado: 'bg-[#F3F4F6] text-[#6B7280]',
  convertido: 'bg-[#111827] text-white',
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
    const patch: Partial<Prospecto> = { estado: nuevoEstado }
    if (nuevoEstado === 'contactado' && !p.fecha_contacto) patch.fecha_contacto = new Date().toISOString()
    await supabase.from('prospectos_broker').update(patch).eq('id', p.id)
    setProspectos(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))
    // Nota: al llegar a "convertido" NO se crea/enlaza verificaciones_broker — esa tabla no
    // existe todavía en este proyecto (ver plan). Pendiente cuando se confirme su esquema real.
  }

  const guardarNotas = async (id: string, notas: string) => {
    await supabase.from('prospectos_broker').update({ notas }).eq('id', id)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-[#8EA0BC] text-[14px]">Cargando…</p>
      </div>
    )
  }

  const visibles = filtro === 'todos'
    ? prospectos
    : prospectos.filter(p => p.estado === 'nuevo' || (p.score_filtrado ?? 0) >= UMBRAL_COLA)

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar userName={userName} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[1100px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <button onClick={() => router.push('/panel')}
              className="flex items-center gap-1.5 text-[13px] text-[#8EA0BC] hover:text-[#111827] mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Panel del ecosistema
            </button>
            <span className="text-[11px] font-bold text-[#C9A84C] tracking-[0.14em] uppercase">Broker Maestro</span>
            <h1 className="text-[22px] md:text-[28px] font-black text-[#111827] mt-0.5">Prospección de Brokers</h1>
            <p className="text-[13px] md:text-[14px] text-[#8EA0BC] mt-1">Cola de revisión manual — ingesta automatizada pendiente del spike de AMPI</p>
          </div>

          <div className="bg-[#FBF5E6] border-l-4 border-[#C9A84C] rounded-r-xl px-4 py-3">
            <p className="text-[12.5px] text-[#5a4a1a]">
              <b className="text-[#3d3110]">Sin contacto real todavía:</b> este módulo es solo la cola de revisión y el alta manual. Ningún prospecto debe recibir contacto (ni manual ni automatizado) hasta que exista el aviso de privacidad LFPDPPP correspondiente — es un bloqueante explícito del handoff, no solo de la automatización.
            </p>
          </div>

          {/* Alta manual */}
          <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6">
            <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em] mb-4">Alta manual de candidato</p>
            <form onSubmit={handleAlta} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre" required>
                  <input type="text" value={alta.nombre} onChange={e => setAlta(a => ({ ...a, nombre: e.target.value }))}
                    placeholder="Nombre del broker o agencia" className={inputCls()} />
                </Field>
                <Field label="Fuente" required>
                  <select value={alta.fuente} onChange={e => setAlta(a => ({ ...a, fuente: e.target.value as Fuente }))} className={inputCls()}>
                    {(Object.keys(FUENTE_LABEL) as Fuente[]).map(f => <option key={f} value={f}>{FUENTE_LABEL[f]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Referencia de fuente" >
                  <input type="text" value={alta.fuente_ref} onChange={e => setAlta(a => ({ ...a, fuente_ref: e.target.value }))}
                    placeholder="URL o identificador" className={inputCls()} />
                </Field>
                <Field label="Zona">
                  <input type="text" value={alta.zona} onChange={e => setAlta(a => ({ ...a, zona: e.target.value }))}
                    placeholder="Ej. San Pedro Garza García" className={inputCls()} />
                </Field>
                <Field label="Volumen de listados aparente">
                  <input type="number" min="0" value={alta.volumen_listados_aparente} onChange={e => setAlta(a => ({ ...a, volumen_listados_aparente: e.target.value }))}
                    placeholder="0" className={inputCls()} />
                </Field>
              </div>
              {errorAlta && <p className="text-[12px] text-[#DC2626]">{errorAlta}</p>}
              <button type="submit" disabled={guardando}
                className="self-start px-5 py-2.5 rounded-xl bg-[#C9A84C] text-white text-[13px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Agregar a la cola'}
              </button>
            </form>
          </div>

          {/* Cola de revisión */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#111827]">Cola de revisión</h2>
              <div className="flex items-center gap-1.5">
                {(['cola', 'todos'] as const).map(f => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${filtro === f ? 'bg-[#C9A84C] text-white' : 'bg-white border border-[#DDE3EC] text-[#8EA0BC] hover:text-[#111827]'}`}>
                    {f === 'cola' ? `Nuevo + score ≥ ${UMBRAL_COLA}` : 'Todos'}
                  </button>
                ))}
              </div>
            </div>

            {visibles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] p-8 text-center">
                <p className="text-[13px] text-[#8EA0BC]">Sin prospectos que mostrar con este filtro.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#DDE3EC] overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="min-w-[820px]">
                    <div className="grid grid-cols-7 gap-2 px-4 md:px-6 py-3 border-b border-[#EDF1F7] bg-[#FAFBFA]">
                      {['Nombre', 'Fuente', 'Zona', 'Score', 'Estado', 'Notas', 'Acción'].map(h => (
                        <p key={h} className="text-[10px] font-bold text-[#8EA0BC] uppercase tracking-wide">{h}</p>
                      ))}
                    </div>
                    {visibles.map((p, i) => (
                      <div key={p.id} className={`grid grid-cols-7 gap-2 items-center px-4 md:px-6 py-3 ${i !== visibles.length - 1 ? 'border-b border-[#EDF1F7]' : ''}`}>
                        <p className="text-[13px] font-semibold text-[#111827] truncate">{p.nombre}</p>
                        <p className="text-[12px] text-[#4B5E7A]">{FUENTE_LABEL[p.fuente]}</p>
                        <p className="text-[12px] text-[#4B5E7A] truncate">{p.zona || '—'}</p>
                        <p className="text-[13px] font-bold text-[#111827]">{p.score_filtrado ?? '—'}</p>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full w-fit ${ESTADO_BADGE[p.estado]}`}>{ESTADO_LABEL[p.estado]}</span>
                        <input
                          type="text"
                          defaultValue={p.notas || ''}
                          onBlur={e => guardarNotas(p.id, e.target.value)}
                          placeholder="Sin notas…"
                          className="text-[12px] px-2 py-1.5 rounded-lg border border-[#DDE3EC] bg-[#F5F7FA] focus:outline-none focus:border-[#C9A84C] w-full"
                        />
                        <div className="flex flex-wrap gap-1">
                          {TRANSICIONES[p.estado].map(next => (
                            <button key={next} onClick={() => cambiarEstado(p, next)}
                              className="text-[10px] font-semibold px-2 py-1 rounded-md border border-[#DDE3EC] text-[#4B5E7A] hover:border-[#C9A84C] hover:text-[#0F1F3D] transition-colors">
                              {ESTADO_LABEL[next]}
                            </button>
                          ))}
                          {TRANSICIONES[p.estado].length === 0 && <span className="text-[11px] text-[#8EA0BC]">—</span>}
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
  )
}
