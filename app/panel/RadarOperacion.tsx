'use client'

// Radar de mercado en la consola de Operación (Documento Maestro V7.1 §18, fase 1 asistida).
// Operación (JC en el piloto) ve los anuncios que pegaron los compradores o que les interesaron,
// agrega opciones que encuentra a mano, e invita a cada anunciante a certificar -- una vez por
// anuncio -- con el mensaje listo para copiar. Todo pasa por app/api/operacion/radar.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Estado = 'sin_invitar' | 'pendiente' | 'enviada' | 'aceptada' | 'rechazada' | 'sin_respuesta'
interface Anuncio {
  id: string; url: string; fuente: string; titulo: string | null; precio: number | null; tipo: string | null; municipio: string | null
  anunciante_contacto: string | null; invitacion_estado: Estado; invitacion_canal: string | null
  invitacion_enviada_at: string | null; activo_id: string | null
  compradores: { nombre: string; origen: string; nota: string | null; interesado: boolean }[]
  interesados: number; mensaje: string
}
interface Comprador { perfilId: string; nombre: string; busca: string }

const ESTADO: Record<Estado, string> = {
  sin_invitar: 'Sin invitar (nadie lo pidió)', pendiente: 'Por invitar', enviada: 'Invitación enviada',
  aceptada: 'Aceptó certificar', rechazada: 'No aceptó', sin_respuesta: 'Sin respuesta',
}
const ORDEN: Record<Estado, number> = { pendiente: 0, enviada: 1, aceptada: 2, sin_invitar: 3, sin_respuesta: 4, rechazada: 5 }
const CANAL: Record<string, string> = { correo: 'Correo', whatsapp: 'WhatsApp', portal: 'Mensaje del portal', telefono: 'Teléfono' }

const campo = 'bg-fondo border border-linea text-tinta text-[15px] px-2.5 py-1.5 focus:outline-none focus:border-gold-500/60 rounded-lg'
const boton = 'font-sans text-[14px] px-3 py-1.5 border transition-colors rounded-lg'
const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

function TarjetaAnuncio({ a, onGuardado }: { a: Anuncio; onGuardado: () => void }) {
  const [f, setF] = useState({
    titulo: a.titulo ?? '', precio: a.precio?.toString() ?? '', tipo: a.tipo ?? '', municipio: a.municipio ?? '',
    anunciante_contacto: a.anunciante_contacto ?? '', invitacion_canal: a.invitacion_canal ?? '',
    invitacion_estado: a.invitacion_estado, activo_id: a.activo_id ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const cerrada = ['aceptada', 'rechazada', 'sin_respuesta'].includes(f.invitacion_estado)

  const guardar = async () => {
    setGuardando(true); setAviso(null)
    const r = await fetch('/api/operacion/radar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ anuncioId: a.id, ...f }),
    })
    setGuardando(false)
    if (!r.ok) { setAviso((await r.json().catch(() => ({}))).error ?? 'No se pudo guardar'); return }
    onGuardado()
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(a.mensaje); setAviso('Mensaje copiado') } catch { setAviso('Selecciona el mensaje y cópialo a mano') }
  }

  return (
    <div className="px-5 py-4 border-b border-linea last:border-b-0 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[16px] text-acento hover:text-acento-2 break-all">{a.titulo || a.url}</a>
          <p className="text-[14px] text-tenue">{a.fuente} · {a.interesados} {a.interesados === 1 ? 'comprador interesado' : 'compradores interesados'}</p>
        </div>
        <span className="font-sans text-[13px] text-acento border border-gold-500/30 px-2.5 py-1 shrink-0 rounded-lg">{ESTADO[a.invitacion_estado]}</span>
      </div>
      <ul className="text-[14px] text-tinta-2 flex flex-col gap-0.5">
        {a.compradores.map((c, i) => (
          <li key={i}>
            {c.nombre} · {c.origen === 'comprador' ? 'pegó la liga' : 'sugerida por Operación'}{c.interesado ? ' · le interesa' : ''}{c.nota ? ` · "${c.nota}"` : ''}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input value={f.titulo} onChange={set('titulo')} placeholder="Título" className={campo} />
        <input value={f.precio} onChange={set('precio')} placeholder="Precio (MXN)" inputMode="numeric" className={campo} />
        <input value={f.tipo} onChange={set('tipo')} placeholder="Tipo" className={campo} />
        <input value={f.municipio} onChange={set('municipio')} placeholder="Municipio" className={campo} />
      </div>
      {!cerrada && (
        <>
          <textarea readOnly value={a.mensaje} rows={3} className={`${campo} w-full resize-y text-tinta-2`} />
          <input value={f.anunciante_contacto} onChange={set('anunciante_contacto')}
            placeholder="Contacto del anunciante (se borra al cerrar la invitación)" className={campo} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={f.invitacion_canal} onChange={set('invitacion_canal')} className={campo}>
          <option value="">Canal…</option>
          {Object.entries(CANAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.invitacion_estado} onChange={set('invitacion_estado')} className={campo}>
          {(Object.keys(ESTADO) as Estado[]).map((k) => <option key={k} value={k}>{ESTADO[k]}</option>)}
        </select>
        {f.invitacion_estado === 'aceptada' && (
          <input value={f.activo_id} onChange={set('activo_id')} placeholder="ID de la propiedad ya registrada (opcional)" className={`${campo} flex-1 min-w-[200px]`} />
        )}
        {!cerrada && <button onClick={copiar} className={`${boton} border-gold-500/40 text-acento hover:border-gold-500`}>Copiar mensaje</button>}
        <button onClick={guardar} disabled={guardando} className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-60 rounded-lg`}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {aviso && <span className="text-[14px] text-tenue">{aviso}</span>}
      </div>
    </div>
  )
}

export default function RadarOperacion() {
  const [anuncios, setAnuncios] = useState<Anuncio[] | null>(null)
  const [compradores, setCompradores] = useState<Comprador[]>([])
  const [nuevo, setNuevo] = useState({ perfilId: '', url: '', titulo: '', precio: '', tipo: '', municipio: '' })
  const [error, setError] = useState<string | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/operacion/radar', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setAnuncios([]); return }
    setAnuncios(((j.anuncios ?? []) as Anuncio[]).sort((x, y) => ORDEN[x.invitacion_estado] - ORDEN[y.invitacion_estado]))
    setCompradores(j.compradores ?? [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    const r = await fetch('/api/operacion/radar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify(nuevo),
    })
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'No se pudo agregar'); return }
    setNuevo((x) => ({ ...x, url: '', titulo: '', precio: '', tipo: '', municipio: '' }))
    await cargar()
  }

  if (!anuncios) return null
  const abiertos = anuncios.filter((a) => ['pendiente', 'enviada'].includes(a.invitacion_estado))
  const resto = anuncios.filter((a) => !['pendiente', 'enviada'].includes(a.invitacion_estado))
  const setN = (k: keyof typeof nuevo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNuevo((x) => ({ ...x, [k]: e.target.value }))

  return (
    <div id="radar" className="bg-tarjeta border border-linea rounded-xl">
      <div className="px-5 py-4 border-b border-linea flex items-center justify-between">
        <h2 className="font-display text-[19px] font-medium text-tinta">Radar de mercado · invitaciones a certificar</h2>
        <span className="font-sans text-[14px] text-tenue">{abiertos.length}</span>
      </div>

      {abiertos.length === 0 ? (
        <p className="px-5 py-6 text-[16px] text-tenue">Sin anuncios por invitar.</p>
      ) : abiertos.map((a) => <TarjetaAnuncio key={a.id + a.invitacion_estado} a={a} onGuardado={cargar} />)}

      {resto.length > 0 && (
        <div className="border-t border-linea">
          <button onClick={() => setVerCerrados((v) => !v)} className="px-5 py-3 text-[15px] text-tenue hover:text-tinta">
            {verCerrados ? 'Ocultar' : 'Ver'} otros anuncios ({resto.length})
          </button>
          {verCerrados && resto.map((a) => <TarjetaAnuncio key={a.id + a.invitacion_estado} a={a} onGuardado={cargar} />)}
        </div>
      )}

      <form onSubmit={agregar} className="px-5 py-4 border-t border-linea flex flex-col gap-2">
        <p className="font-sans text-[13px] text-acento">Agregar una opción al Radar de un comprador</p>
        {compradores.length === 0 ? (
          <p className="text-[15px] text-tenue">No hay compradores por su cuenta todavía.</p>
        ) : (
          <>
            <select value={nuevo.perfilId} onChange={setN('perfilId')} required className={campo}>
              <option value="">Comprador…</option>
              {compradores.map((c) => <option key={c.perfilId} value={c.perfilId}>{c.nombre} · busca {c.busca || '—'}</option>)}
            </select>
            <input value={nuevo.url} onChange={setN('url')} required placeholder="https://… liga del anuncio" className={campo} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input value={nuevo.titulo} onChange={setN('titulo')} placeholder="Título" className={campo} />
              <input value={nuevo.precio} onChange={setN('precio')} placeholder="Precio (MXN)" inputMode="numeric" className={campo} />
              <input value={nuevo.tipo} onChange={setN('tipo')} placeholder="Tipo" className={campo} />
              <input value={nuevo.municipio} onChange={setN('municipio')} placeholder="Municipio" className={campo} />
            </div>
            <div className="flex items-center gap-3">
              <button className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 self-start rounded-lg`}>Agregar al Radar</button>
              {error && <span className="text-[15px] text-error">{error}</span>}
            </div>
          </>
        )}
      </form>
    </div>
  )
}
