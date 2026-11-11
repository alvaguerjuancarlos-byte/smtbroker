'use client'

// "Elige un broker verificado de tu zona" (Documento Maestro V6.3, §15; paso 3B del plan; V7: por
// ambos lados). Lo ve el propietario de un activo sin broker (activoId) y el comprador que llegó
// directo y aún no tiene broker (perfilId): los brokers de su municipio con nivel Plata o más,
// ordenados por nivel, con su desempeño público (nunca su contacto). Al elegir, el broker recibe al
// cliente como oportunidad y la acepta o la rechaza. Ver app/api/brokers-zona y app/api/oportunidades.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface BrokerZona {
  id: string; nombre: string; nivel?: string; pionero?: boolean
  certificadas?: number; cierresVerificados?: number; propiedades?: number
}
interface Oportunidad { id: string; broker_id: string; estado: 'ofrecida' | 'aceptada' | 'rechazada'; created_at: string }

const COLOR_NIVEL: Record<string, string> = {
  Platino: 'border-[#c9d4e8]/50 text-[#dfe7f5]',
  Oro: 'border-gold-500/60 text-acento',
  Plata: 'border-linea-fuerte text-tinta',
}

async function llamar(url: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
}

function Nivel({ b }: { b: BrokerZona }) {
  return (
    <>
      {b.nivel && <span className={`font-sans text-[13px] px-2 py-0.5 border ${COLOR_NIVEL[b.nivel] ?? 'border-linea text-tenue'} rounded-lg`}>Nivel {b.nivel}</span>}
      {b.pionero && <span className="font-sans text-[13px] text-acento">★ Pionero</span>}
    </>
  )
}

interface Props {
  activoId?: string
  perfilId?: string
  onAsignado: () => void
  /** Texto extra arriba de la lista, p. ej. por qué se le pide elegir ahora. */
  motivo?: string
}

export function ElegirBroker({ activoId, perfilId, onAsignado, motivo }: Props) {
  const esComprador = !activoId
  const [zona, setZona] = useState('')
  const [asignado, setAsignado] = useState<BrokerZona | null>(null)
  const [brokers, setBrokers] = useState<BrokerZona[] | null>(null)
  const [ops, setOps] = useState<Oportunidad[]>([])
  const [error, setError] = useState('')
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  // El padre pasa una función nueva en cada render: se guarda en una ref para no recargar en ciclo.
  const avisarAsignado = useRef(onAsignado)
  useEffect(() => { avisarAsignado.current = onAsignado })

  const cargar = useCallback(async () => {
    const r = await llamar('/api/brokers-zona', activoId ? { activoId } : { perfilId })
    if (r.error) { setError(r.error); return }
    setZona(r.zona); setBrokers(r.brokers); setOps(r.oportunidades); setAsignado(r.asignado ?? null)
    if (r.asignado || (r.oportunidades as Oportunidad[]).some(o => o.estado === 'aceptada')) avisarAsignado.current()
  }, [activoId, perfilId])

  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const elegir = async (brokerId: string) => {
    setEligiendo(brokerId); setError('')
    const r = await llamar('/api/oportunidades', activoId ? { activoId, brokerId } : { perfilId, brokerId })
    setEligiendo(null)
    if (r.error) { setError(r.error); return }
    await cargar()
  }

  if (error && !brokers) return <div className="bg-tarjeta border border-error-linea p-5 text-[16px] text-tinta-2 rounded-xl">No se pudieron cargar los brokers ({error}).</div>
  if (!brokers) return null

  if (asignado) {
    return (
      <div className="bg-tarjeta border border-linea p-4 md:p-6 rounded-xl">
        <p className="font-sans text-[13px] text-tenue mb-2">Tu broker</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[18px] font-medium text-tinta">{asignado.nombre}</p>
          <Nivel b={asignado} />
        </div>
        <p className="text-[15px] text-tenue mt-1">Te representa en cada conexión: cuando te interese una propiedad, se pone en contacto con el broker que la representa.</p>
      </div>
    )
  }

  const abierta = ops.find(o => o.estado === 'ofrecida')
  const rechazaron = new Set(ops.filter(o => o.estado === 'rechazada').map(o => o.broker_id))
  const nombreDe = (id: string) => brokers.find(b => b.id === id)?.nombre ?? 'el broker'

  return (
    <div className="bg-tarjeta border border-gold-500/30 p-4 md:p-6 rounded-xl">
      <p className="font-sans text-[13px] text-acento mb-1">Elige un broker verificado de tu zona</p>
      {motivo && <p className="text-[17px] text-tinta mb-2">{motivo}</p>}
      <p className="text-[16px] text-tinta-2 mb-4">
        {esComprador
          ? 'Un broker verificado te representa: busca contigo, se conecta con el broker de cada propiedad y te acompaña hasta el cierre.'
          : 'Un broker verificado representa tu propiedad, la presenta a sus compradores y a los de toda la red.'}
        {' '}Estos trabajan en {zona || 'tu municipio'}; el nivel refleja su desempeño verificado.
      </p>

      {abierta ? (
        <div className="border border-gold-500/30 bg-gold-500/[0.06] p-4">
          <p className="text-[17px] text-tinta">Esperando respuesta de <b>{nombreDe(abierta.broker_id)}</b></p>
          <p className="text-[15px] text-tenue mt-1">{esComprador ? 'Le enviamos lo que buscas' : 'Le enviamos tu propiedad'} como oportunidad. Si la acepta, pasará a representarte.</p>
        </div>
      ) : brokers.length === 0 ? (
        <p className="text-[16px] text-tenue">Todavía no hay brokers verificados trabajando en {zona || 'tu municipio'}. Te avisaremos cuando haya uno disponible.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {brokers.map(b => (
            <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border border-linea bg-fondo/40 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[17px] font-medium text-tinta">{b.nombre}</p>
                  <Nivel b={b} />
                </div>
                <p className="text-[15px] text-tenue mt-1">
                  {b.certificadas} {b.certificadas === 1 ? 'propiedad certificada' : 'propiedades certificadas'} · {b.cierresVerificados} {b.cierresVerificados === 1 ? 'cierre verificado' : 'cierres verificados'} · {b.propiedades} en portafolio
                </p>
                {rechazaron.has(b.id) && <p className="text-[14px] text-aviso mt-1">{esComprador ? 'No pudo representarte esta vez.' : 'No pudo tomar tu propiedad esta vez.'}</p>}
              </div>
              <button onClick={() => elegir(b.id)} disabled={!!eligiendo || rechazaron.has(b.id)}
                className="font-sans text-[15px] px-4 py-2.5 border bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-40 shrink-0 rounded-lg">
                {eligiendo === b.id ? 'Enviando…' : 'Elegir'}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[15px] text-error mt-2">{error}</p>}
    </div>
  )
}
