'use client'

// Panel de quien compra (ver app/inicio/page.tsx): afinar la búsqueda (perfiles_intencion.detalles,
// migración 20261101000300), lo que coincide, su Radar y, si va por su cuenta, el broker.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { inputCls } from '../components/FormField'

interface Detalles {
  recamaras?: string; banos?: string; m2Min?: string; zonas?: string; estacionamientos?: string; imprescindibles?: string[]
}
interface Perfil { id: string; tipo_activo_interes: string | null; zona: string | null; presupuesto: string | null; detalles: Detalles | null; representado_por: string | null }
interface Coincidencia { activoId: string; score: number; activo: { nombre: string; precio_total: number | null } }

const TIPOS = ['Casa', 'Departamento', 'Terreno', 'Local', 'Oficina']
const IMPRESCINDIBLES = ['Terraza', 'Jardín', 'Alberca', 'Amenidades', 'Seguridad 24 h']
const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const tarjeta = 'bg-navy-800 border p-4 md:p-5 flex flex-col gap-2.5'
const etiqueta = 'font-plex-mono text-[11px] tracking-[0.08em] uppercase'
const verde = '#7fd1b9'
const cls = inputCls(false, 'oscuro')

export default function PanelComprador({ uid, nombre, conBroker }: { uid: string; nombre: string; conBroker: boolean }) {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined)
  const [tipo, setTipo] = useState<string | null>(null)
  const [d, setD] = useState<Detalles>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null)

  const cargarCoincidencias = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const r = await fetch('/api/matches', { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json().catch(() => ({}))
    setCoincidencias(r.ok && Array.isArray(j.coincidencias) ? j.coincidencias : [])
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('perfiles_intencion')
        .select('id, tipo_activo_interes, zona, presupuesto, detalles, representado_por').eq('usuario_id', uid).maybeSingle()
      const p = data as Perfil | null
      setPerfil(p)
      if (!p) return
      setD(p.detalles ?? {})
      setTipo(TIPOS.find((t) => (p.tipo_activo_interes || '').toLowerCase().startsWith(t.toLowerCase())) ?? null)
      await cargarCoincidencias()
    }
    init()
  }, [uid])

  const set = (k: keyof Detalles) => (e: React.ChangeEvent<HTMLInputElement>) => { setD((x) => ({ ...x, [k]: e.target.value })); setGuardado(false) }
  const alternar = (i: string) => {
    setD((x) => {
      const a = x.imprescindibles ?? []
      return { ...x, imprescindibles: a.includes(i) ? a.filter((y) => y !== i) : [...a, i] }
    })
    setGuardado(false)
  }

  const guardar = async () => {
    if (!perfil) return
    setGuardando(true); setError(null)
    const { error: e } = await supabase.from('perfiles_intencion')
      .update({ detalles: d, ...(tipo ? { tipo_activo_interes: tipo } : {}) }).eq('id', perfil.id)
    setGuardando(false)
    if (e) { setError(e.message); return }
    setGuardado(true)
    await cargarCoincidencias()
  }

  if (perfil === undefined) return null
  if (perfil === null) {
    return (
      <div className={`${tarjeta} border-white/10`}>
        <p className="text-[15px]">Aún no nos dices qué buscas.</p>
        <a href="/portal-inversion" className="text-[13px] underline underline-offset-2" style={{ color: verde }}>Describir lo que busco</a>
      </div>
    )
  }

  const porSuCuenta = !perfil.representado_por
  const chip = (activo: boolean) => `px-3 py-2 text-[13px] border transition-colors ${activo ? 'text-paper' : 'border-white/15 text-paper-dim hover:border-white/30'}`
  const tarjetaBroker = porSuCuenta && (
    <div className={`${tarjeta} ${conBroker ? '' : 'border-white/10'}`} style={conBroker ? { borderColor: verde } : undefined}>
      <span className={etiqueta} style={{ color: conBroker ? verde : undefined }}>{conBroker ? 'Elige tu broker verificado' : '¿Quieres ver toda la red?'}</span>
      <p className="text-[14px]">Con un broker verificado accedes también a las propiedades de todos los brokers, y te acompaña en visitas, negociación y cierre.</p>
      <a href="/portal-inversion?broker=1" className={conBroker ? 'font-plex-mono text-[13px] font-medium px-4 py-3 text-center text-navy-950' : 'font-plex-mono text-[12px]'}
        style={conBroker ? { background: verde } : { color: verde }}>{conBroker ? 'Ver brokers de mi zona' : 'Ver brokers de mi zona →'}</a>
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-1.5 mb-1">
        <h1 className="font-display text-[26px] md:text-[30px] font-medium leading-tight">Listo{nombre ? `, ${nombre}` : ''}.</h1>
        <p className="text-[14.5px] text-paper-dim">Smart Bróker ya está buscando por ti. Afinemos tu búsqueda para encontrar mejores opciones.</p>
      </div>

      {conBroker && tarjetaBroker}

      <div className={tarjeta} style={{ borderColor: verde }}>
        <span className={etiqueta} style={{ color: verde }}>Cuéntanos más de lo que buscas</span>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <button key={t} type="button" onClick={() => { setTipo(t); setGuardado(false) }} className={chip(tipo === t)}
              style={tipo === t ? { borderColor: verde, background: 'rgba(127,209,185,0.12)' } : undefined}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([['recamaras', 'Recámaras'], ['banos', 'Baños'], ['m2Min', 'm² mín.']] as const).map(([k, l]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="font-plex-mono text-[10px] text-slate uppercase">{l}</span>
              <input value={d[k] ?? ''} onChange={set(k)} inputMode="numeric" className={cls} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-plex-mono text-[10px] text-slate uppercase">Zonas preferidas</span>
            <input value={d.zonas ?? ''} onChange={set('zonas')} placeholder="Valle Oriente, Del Valle" className={cls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-plex-mono text-[10px] text-slate uppercase">Estacionamientos</span>
            <input value={d.estacionamientos ?? ''} onChange={set('estacionamientos')} inputMode="numeric" className={cls} />
          </label>
        </div>
        <span className="font-plex-mono text-[10px] text-slate uppercase">Imprescindibles</span>
        <div className="flex flex-wrap gap-1.5">
          {IMPRESCINDIBLES.map((i) => {
            const on = (d.imprescindibles ?? []).includes(i)
            return <button key={i} type="button" onClick={() => alternar(i)} className={chip(on)}
              style={on ? { borderColor: verde, background: 'rgba(127,209,185,0.12)' } : undefined}>{i}</button>
          })}
        </div>
        {error && <p className="text-[12.5px] text-[#f3a3a3]">{error}</p>}
        <button onClick={guardar} disabled={guardando} className="font-plex-mono text-[13px] font-medium px-4 py-3 text-center text-navy-950 disabled:opacity-60" style={{ background: verde }}>
          {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar y afinar mi búsqueda'}
        </button>
      </div>

      <div className={`${tarjeta} border-white/10`}>
        <span className={`${etiqueta} text-slate`}>Lo que coincide contigo</span>
        {coincidencias === null ? (
          <p className="text-[13px] text-slate">Buscando…</p>
        ) : coincidencias.length === 0 ? (
          <p className="text-[13.5px] text-paper-dim">Todavía nada coincide. Te avisamos en cuanto aparezca algo.</p>
        ) : coincidencias.slice(0, 3).map((c) => (
          <div key={c.activoId} className="flex items-center gap-3">
            <span className="font-display text-[22px] w-11 shrink-0" style={{ color: verde }}>{c.score}</span>
            <span className="flex flex-col">
              <span className="text-[14px]">{c.activo.nombre}</span>
              {c.activo.precio_total != null && <span className="text-[12px] text-slate">{mxn(c.activo.precio_total)}{porSuCuenta ? ' · particular' : ''}</span>}
            </span>
          </div>
        ))}
        <p className="text-[12.5px] text-slate">Mientras más detalles nos des, mejores coincidencias. <a href="/portal-inversion" className="underline underline-offset-2" style={{ color: verde }}>Ver todas</a></p>
      </div>

      {porSuCuenta && (
        <div className={`${tarjeta} border-white/10`}>
          <span className={`${etiqueta} text-slate`}>Tu Radar de mercado</span>
          <p className="text-[14px]">¿Viste algo en otro portal? Pega la liga y le pedimos al anunciante que la certifique.</p>
          <a href="/portal-inversion#radar" className="font-plex-mono text-[12px]" style={{ color: verde }}>Abrir mi Radar →</a>
        </div>
      )}

      {!conBroker && tarjetaBroker}
    </>
  )
}
