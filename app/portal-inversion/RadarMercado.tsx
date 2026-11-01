'use client'

// Radar de mercado del comprador por su cuenta (Documento Maestro V7.1 §18, fase 1): opciones del
// mercado NO certificadas -- las que pega él y las que le agrega Operación. Con "Me interesa",
// Operación invita al anunciante a certificar. Todo pasa por app/api/radar.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { inputCls } from '../components/FormField'

interface OpcionRadar {
  id: string; origen: 'comprador' | 'operacion'; nota: string | null; interesado: boolean; certificada: boolean; estado: string
  url: string; fuente: string; titulo: string | null; precio: number | null; tipo: string | null; municipio: string | null
}

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

export function RadarMercado() {
  const [opciones, setOpciones] = useState<OpcionRadar[] | null>(null)
  const [url, setUrl] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/radar', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setOpciones(r.ok ? j.opciones ?? [] : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const pegar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError(null)
    const r = await fetch('/api/radar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ url, nota }),
    })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo agregar'); return }
    setUrl(''); setNota('')
    await cargar()
  }

  const meInteresa = async (id: string) => {
    setOcupado(id)
    await fetch(`/api/radar/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + await token() } })
    setOcupado(null)
    await cargar()
  }

  if (!opciones) return null

  return (
    <div id="radar">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="font-display text-[17px] font-medium text-paper">Radar de mercado</h2>
        <span className="font-plex-mono text-[10px] text-slate uppercase tracking-[0.1em]">opciones no certificadas</span>
      </div>
      <p className="text-[12px] text-slate mb-4">
        ¿Viste algo en otro lado? Pega la liga y le pedimos al anunciante que certifique su propiedad: precio de mercado y revisión de documentos.
      </p>

      <form onSubmit={pegar} className="bg-navy-800 border border-white/10 p-4 flex flex-col gap-2 mb-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… liga del anuncio" required
            className={`${inputCls(false, 'oscuro')} flex-1`} inputMode="url" />
          <button disabled={enviando || !url.trim()}
            className="font-plex-mono text-[11px] bg-gold-500 text-navy-950 px-4 py-2 hover:bg-gold-400 transition-colors disabled:opacity-60 shrink-0">
            {enviando ? 'Agregando…' : 'Agregar al Radar'}
          </button>
        </div>
        <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300}
          placeholder="Opcional: qué te gustó o qué quieres saber" className={inputCls(false, 'oscuro')} />
        {error && <p className="text-[12px] text-[#f3a3a3]">{error}</p>}
      </form>

      {opciones.length > 0 && (
        <div className="bg-navy-800 border border-white/10 overflow-hidden">
          {opciones.map((o, i) => (
            <div key={o.id} className={`px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${i !== opciones.length - 1 ? 'border-b border-white/10' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-paper truncate">{o.titulo ?? `Anuncio en ${o.fuente}`}</p>
                <p className="text-[11.5px] text-slate mt-0.5">
                  {[o.tipo, o.municipio, o.precio != null ? mxn(o.precio) : null, o.fuente].filter(Boolean).join(' · ')}
                  {o.origen === 'operacion' ? ' · te la sugirió nuestro equipo' : ''}
                </p>
                <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[12px] text-gold-400 hover:text-gold-100 underline underline-offset-2">Ver anuncio</a>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-plex-mono text-[10.5px] px-2.5 py-1 border ${o.certificada ? 'text-gold-400 border-gold-500/40' : 'text-slate border-white/15'}`}>
                  {o.estado}
                </span>
                {!o.interesado && (
                  <button disabled={ocupado === o.id} onClick={() => meInteresa(o.id)}
                    className="font-plex-mono text-[11px] bg-gold-500 text-navy-950 px-3 py-2 hover:bg-gold-400 transition-colors disabled:opacity-60">
                    Me interesa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
