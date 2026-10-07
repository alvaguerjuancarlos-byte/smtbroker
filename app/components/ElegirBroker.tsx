'use client'

// "Elige un broker certificado de tu zona" (Documento Maestro V6.3, §15; paso 3B del plan). Lo ve
// el propietario de un activo que no tiene broker: los brokers de su municipio con nivel Plata o
// más, ordenados por nivel, con su desempeño público (nunca su contacto). Al elegir, el broker
// recibe la propiedad como oportunidad y la acepta o la rechaza. Ver app/api/brokers-zona y
// app/api/oportunidades.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface BrokerZona {
  id: string; nombre: string; nivel: string; pionero: boolean
  certificadas: number; cierresVerificados: number; propiedades: number
}
interface Oportunidad { id: string; broker_id: string; estado: 'ofrecida' | 'aceptada' | 'rechazada'; created_at: string }

const COLOR_NIVEL: Record<string, string> = {
  Platino: 'border-[#c9d4e8]/50 text-[#dfe7f5]',
  Oro: 'border-gold-500/60 text-gold-400',
  Plata: 'border-white/30 text-paper',
}

async function llamar(url: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
}

export function ElegirBroker({ activoId, onAsignado }: { activoId: string; onAsignado: () => void }) {
  const [zona, setZona] = useState('')
  const [brokers, setBrokers] = useState<BrokerZona[] | null>(null)
  const [ops, setOps] = useState<Oportunidad[]>([])
  const [error, setError] = useState('')
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  // El padre pasa una función nueva en cada render: se guarda en una ref para no recargar en ciclo.
  const avisarAsignado = useRef(onAsignado)
  useEffect(() => { avisarAsignado.current = onAsignado })

  const cargar = useCallback(async () => {
    const r = await llamar('/api/brokers-zona', { activoId })
    if (r.error) { setError(r.error); return }
    setZona(r.zona); setBrokers(r.brokers); setOps(r.oportunidades)
    if ((r.oportunidades as Oportunidad[]).some(o => o.estado === 'aceptada')) avisarAsignado.current()
  }, [activoId])

  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const elegir = async (brokerId: string) => {
    setEligiendo(brokerId); setError('')
    const r = await llamar('/api/oportunidades', { activoId, brokerId })
    setEligiendo(null)
    if (r.error) { setError(r.error); return }
    await cargar()
  }

  if (error && !brokers) return <div className="bg-navy-800 border border-red-900/40 p-5 text-[13px] text-paper-dim">No se pudieron cargar los brokers ({error}).</div>
  if (!brokers) return null

  const abierta = ops.find(o => o.estado === 'ofrecida')
  const rechazaron = new Set(ops.filter(o => o.estado === 'rechazada').map(o => o.broker_id))
  const nombreDe = (id: string) => brokers.find(b => b.id === id)?.nombre ?? 'el broker'

  return (
    <div className="bg-navy-800 border border-gold-500/30 p-4 md:p-6">
      <p className="font-plex-mono text-[10.5px] text-gold-400 uppercase tracking-[0.1em] mb-1">Elige un broker certificado de tu zona</p>
      <p className="text-[13px] text-paper-dim mb-4">
        Un broker certificado representa tu propiedad, la presenta a sus compradores y a los de toda la red. Estos trabajan en {zona || 'tu municipio'}; el nivel refleja su desempeño verificado.
      </p>

      {abierta ? (
        <div className="border border-gold-500/30 bg-gold-500/[0.06] p-4">
          <p className="text-[14px] text-paper">Esperando respuesta de <b>{nombreDe(abierta.broker_id)}</b></p>
          <p className="text-[12px] text-slate mt-1">Le enviamos tu propiedad como oportunidad. Si la acepta, pasará a representarte.</p>
        </div>
      ) : brokers.length === 0 ? (
        <p className="text-[13px] text-slate">Todavía no hay brokers certificados trabajando en {zona || 'tu municipio'}. Te avisaremos cuando haya uno disponible.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {brokers.map(b => (
            <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border border-white/10 bg-navy-950/40 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-medium text-paper">{b.nombre}</p>
                  <span className={`font-plex-mono text-[10px] uppercase tracking-wide px-2 py-0.5 border ${COLOR_NIVEL[b.nivel] ?? 'border-white/15 text-slate'}`}>Nivel {b.nivel}</span>
                  {b.pionero && <span className="font-plex-mono text-[10px] text-gold-400">★ Pionero</span>}
                </div>
                <p className="text-[12px] text-slate mt-1">
                  {b.certificadas} {b.certificadas === 1 ? 'propiedad certificada' : 'propiedades certificadas'} · {b.cierresVerificados} {b.cierresVerificados === 1 ? 'cierre verificado' : 'cierres verificados'} · {b.propiedades} en portafolio
                </p>
                {rechazaron.has(b.id) && <p className="text-[11.5px] text-[#e8b568] mt-1">No pudo tomar tu propiedad esta vez.</p>}
              </div>
              <button onClick={() => elegir(b.id)} disabled={!!eligiendo || rechazaron.has(b.id)}
                className="font-plex-mono text-[12px] px-4 py-2.5 border bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-40 shrink-0">
                {eligiendo === b.id ? 'Enviando…' : 'Elegir'}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[12px] text-[#f3a3a3] mt-2">{error}</p>}
    </div>
  )
}
