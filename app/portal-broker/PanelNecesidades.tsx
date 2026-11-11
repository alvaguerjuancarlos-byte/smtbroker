'use client'

// Panel de necesidades del broker (Documento Maestro V8, Parte 1, §19.3): lo que buscan los
// compradores, ANÓNIMO (sin nombre ni contacto hasta que el comprador pida ver una propiedad).
// El broker propone propiedades de su cartera que cumplen la ficha; al proponer acepta los términos
// (§21.6). Las reglas (cumple la ficha, hasta 3 por necesidad) las revisa app/api/propuestas.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { millones, MAX_PROPUESTAS_POR_BROKER } from '@/lib/necesidad'

interface NecesidadPanel {
  id: string; resumen: string; detalle: string[]; proposito: string | null; created_at: string
  enMiZona: boolean; propuestasTotal: number; misPropuestas: string[]; puedeProponer: boolean
  compatibles: { activoId: string; nombre: string; precio_total: number | null; superficie: number | null }[]
}

const hace = (fecha: string) => {
  const h = Math.floor((Date.now() - new Date(fecha).getTime()) / 3600_000)
  return h < 1 ? 'hace menos de 1 h' : h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

export default function PanelNecesidades() {
  const router = useRouter()
  const [lista, setLista] = useState<NecesidadPanel[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ id: string; texto: string; ok: boolean } | null>(null)
  const [soloZona, setSoloZona] = useState(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch('/api/necesidades', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setLista(r.ok ? (j.necesidades as NecesidadPanel[]) : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const abrir = (id: string) => { setAbierta(abierta === id ? null : id); setElegida(null); setAcepto(false); setMensaje(null) }

  const proponer = async (necesidadId: string) => {
    if (!elegida || !acepto) return
    setEnviando(true); setMensaje(null)
    const r = await fetch('/api/propuestas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ necesidadId, activoId: elegida, aceptoTerminos: true }),
    })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setMensaje({ id: necesidadId, texto: j.error ?? 'No se pudo proponer', ok: false }); return }
    setMensaje({ id: necesidadId, texto: 'Propuesta enviada: el comprador ya la ve en su bandeja.', ok: true })
    setElegida(null); setAcepto(false)
    await cargar()
  }

  if (!lista) return <p className="text-[13px] text-slate font-plex-mono">Cargando necesidades…</p>
  const visibles = soloZona ? lista.filter((n) => n.enMiZona) : lista

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[13px] text-paper-dim max-w-[560px]">
          Lo que buscan los compradores de la plataforma. Si tienes una propiedad que cumple, propónla: el comprador la ve en su bandeja con tu nombre y tu nivel. Ves al comprador cuando él pida ver tu propiedad.
        </p>
        <button onClick={() => setSoloZona(!soloZona)} className={`px-3 py-2 text-[12px] border ${soloZona ? 'border-gold-500 text-gold-400' : 'border-white/15 text-paper-dim'}`}>
          {soloZona ? '✓ ' : ''}Solo mi zona
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-navy-800 border border-white/10 p-6 text-center">
          <p className="text-[14px] text-paper">No hay necesidades publicadas {soloZona ? 'en tu zona ' : ''}por ahora.</p>
          <p className="text-[12.5px] text-slate mt-1">Te avisamos por correo cuando un comprador busque en los municipios donde tienes propiedades.</p>
        </div>
      ) : visibles.map((n) => (
        <div key={n.id} className={`bg-navy-800 border p-4 md:p-5 flex flex-col gap-2.5 ${n.enMiZona ? 'border-gold-500/50' : 'border-white/10'}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] text-paper font-medium">{n.resumen}</p>
            {n.enMiZona && <span className="font-plex-mono text-[10px] text-navy-950 bg-gold-500 px-2 py-1 tracking-[0.06em] shrink-0">TU ZONA</span>}
          </div>
          {n.detalle.length > 0 && <p className="text-[12.5px] text-slate">{n.detalle.join(' · ')}</p>}
          <p className="text-[12px] text-slate">
            {n.proposito === 'invertir' ? 'Para invertir · ' : n.proposito === 'vivir' ? 'Para vivir o usarla · ' : ''}
            {n.propuestasTotal} {n.propuestasTotal === 1 ? 'propuesta' : 'propuestas'} · publicada {hace(n.created_at)}
            {n.misPropuestas.length > 0 ? ` · ya propusiste ${n.misPropuestas.length}` : ''}
          </p>

          {n.puedeProponer ? (
            <button onClick={() => abrir(n.id)} className="w-fit bg-gold-500 text-navy-950 font-plex-mono text-[12px] px-4 py-2.5 hover:bg-gold-400">
              {abierta === n.id ? 'Cerrar' : 'Proponer propiedad'}
            </button>
          ) : <p className="text-[12px] text-paper-dim">Llegaste al máximo de {MAX_PROPUESTAS_POR_BROKER} propuestas en esta necesidad.</p>}

          {abierta === n.id && (
            <div className="border-t border-white/10 pt-3 flex flex-col gap-2.5">
              {n.compatibles.length === 0 ? (
                <p className="text-[13px] text-paper-dim">
                  Ninguna propiedad de tu cartera cumple esta ficha (tipo, zona, precio con ±10 % y tamaño).{' '}
                  <button onClick={() => router.push('/activo/nuevo')} className="text-gold-400 underline underline-offset-2">Cargar una propiedad</button>
                </p>
              ) : (
                <>
                  <span className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">De tu cartera, cumplen la ficha</span>
                  {n.compatibles.map((a) => (
                    <label key={a.activoId} className={`flex items-center gap-3 p-3 border cursor-pointer ${elegida === a.activoId ? 'border-gold-500 bg-gold-500/10' : 'border-white/10'}`}>
                      <input type="radio" name={`prop-${n.id}`} checked={elegida === a.activoId} onChange={() => setElegida(a.activoId)} />
                      <span className="flex flex-col">
                        <span className="text-[14px] text-paper">{a.nombre}</span>
                        <span className="text-[12px] text-slate">{[a.precio_total ? millones(a.precio_total) : null, a.superficie ? `${a.superficie.toLocaleString('es-MX')} m²` : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-start gap-2.5 text-[12.5px] text-paper-dim cursor-pointer">
                    <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5" />
                    <span>Acepto los términos: si cierro la operación con este comprador, SMTBROKER cobra un porcentaje de mi comisión, según los términos vigentes de la plataforma.</span>
                  </label>
                  <button onClick={() => proponer(n.id)} disabled={!elegida || !acepto || enviando}
                    className="w-fit bg-gold-500 text-navy-950 font-plex-mono text-[12px] px-4 py-2.5 hover:bg-gold-400 disabled:opacity-50">
                    {enviando ? 'Enviando…' : 'Enviar propuesta'}
                  </button>
                </>
              )}
            </div>
          )}
          {mensaje?.id === n.id && <p className={`text-[12.5px] ${mensaje.ok ? 'text-[#7fd1b9]' : 'text-[#f3a3a3]'}`}>{mensaje.texto}</p>}
        </div>
      ))}
    </div>
  )
}
