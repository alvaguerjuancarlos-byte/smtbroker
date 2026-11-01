'use client'

// Panel de quien vende (ver app/inicio/page.tsx). Trabaja sobre su propiedad más reciente.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Activo {
  id: string; nombre: string; colonia: string | null; municipio: string | null
  broker_id: string | null; publicada_at: string | null
}
type Precio = { salida: number | null; frase: string | null } | 'calculando' | 'error'

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const tarjeta = 'bg-navy-800 border p-4 md:p-5 flex flex-col gap-2'
const etiqueta = 'font-plex-mono text-[11px] tracking-[0.08em] uppercase'
const boton = 'font-plex-mono text-[13px] font-medium px-4 py-3 text-center transition-colors'

export default function PanelVendedor({ uid, nombre, conBroker }: { uid: string; nombre: string; conBroker: boolean }) {
  const [activos, setActivos] = useState<Activo[]>([])
  const [activo, setActivo] = useState<Activo | null | undefined>(undefined)
  const [precio, setPrecio] = useState<Precio>('calculando')
  const [cert, setCert] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('activos').select('id, nombre, colonia, municipio, broker_id, publicada_at')
        .eq('usuario_id', uid).order('created_at', { ascending: false })
      const lista = (data as Activo[]) || []
      setActivos(lista)
      setActivo(lista[0] ?? null)
    }
    init()
  }, [uid])

  // Lo que la plataforma prepara para la propiedad elegida (la más reciente, o la del selector).
  const activoId = activo?.id
  useEffect(() => {
    if (!activoId) return
    const cargar = async () => {
      setPrecio('calculando'); setCert(null)
      const a = { id: activoId }
      const { data: c } = await supabase.from('certificaciones').select('estado').eq('activo_id', a.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setCert((c as { estado: string } | null)?.estado ?? null)
      // El Agente de Mercado devuelve el diagnóstico guardado o lo calcula la primera vez.
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      try {
        const r = await fetch('/api/agentes/mercado', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ activoId: a.id }),
        })
        const d = await r.json().catch(() => ({}))
        const frase = typeof d.interpretacion === 'string' ? d.interpretacion.split(/(?<=[.!?])\s+/)[0] : null
        setPrecio(r.ok ? { salida: d.precioSalidaRecomendadoMXN ?? null, frase } : 'error')
      } catch { setPrecio('error') }
    }
    cargar()
  }, [activoId])

  if (activo === undefined) return null
  if (activo === null) {
    return (
      <div className={`${tarjeta} border-white/10`}>
        <p className="text-[15px]">Aún no registras una propiedad.</p>
        <Link href="/activo/nuevo" className="text-gold-400 underline underline-offset-2 text-[13px]">Registrar mi propiedad</Link>
      </div>
    )
  }

  const lugar = activo.colonia || activo.municipio
  const tarjetaBroker = !activo.broker_id && (
    <div className={`${tarjeta} ${conBroker ? 'border-gold-500' : 'border-white/10'}`}>
      <span className={`${etiqueta} ${conBroker ? 'text-gold-400' : 'text-slate'}`}>{conBroker ? 'Elige tu broker verificado' : '¿Quieres llegar a toda la red?'}</span>
      <p className="text-[14px]">Un broker verificado presenta tu propiedad a los compradores de todos los brokers y te acompaña hasta el cierre.</p>
      <a href={`/activo/${activo.id}#elegir-broker`} className={conBroker ? `${boton} bg-gold-500 text-navy-950 hover:bg-gold-400` : 'font-plex-mono text-[12px] text-gold-400'}>
        {conBroker ? 'Ver brokers de mi zona' : 'Ver brokers de mi zona →'}
      </a>
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-1.5 mb-1">
        <h1 className="font-display text-[26px] md:text-[30px] font-medium leading-tight">Listo{nombre ? `, ${nombre}` : ''}.</h1>
        <p className="text-[14.5px] text-paper-dim">Smart Bróker ya está analizando tu propiedad: <span className="text-paper">{activo.nombre}</span>{lugar && !activo.nombre.includes(lugar) ? `, ${lugar}` : ''}. Esto es lo que preparamos para ti:</p>
        {activos.length > 1 && (
          <label className="flex items-center gap-2 text-[12.5px] text-slate mt-1">
            Ver otra propiedad:
            <select value={activo.id} onChange={(e) => setActivo(activos.find((x) => x.id === e.target.value) ?? activo)}
              className="bg-navy-800 border border-white/15 text-paper text-[13px] px-2 py-1.5">
              {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
        )}
      </div>

      {conBroker && tarjetaBroker}

      <div className={`${tarjeta} border-gold-500`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`${etiqueta} text-gold-400`}>Tu precio realista de mercado</span>
          {typeof precio === 'object' && precio.salida && <span className="font-plex-mono text-[10px] text-navy-950 bg-gold-500 px-1.5 py-0.5">LISTO</span>}
        </div>
        {precio === 'calculando' ? (
          <div className="flex items-center gap-3 py-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-pulse shrink-0" />
            <p className="text-[14px] text-paper-dim">Analizando el mercado de tu zona… Te avisamos por correo cuando esté listo.</p>
          </div>
        ) : precio === 'error' || !precio.salida ? (
          <p className="text-[14px] text-paper-dim">Tu análisis de mercado queda en tu propiedad. <a href={`/activo/${activo.id}`} className="text-gold-400 underline underline-offset-2">Verlo</a></p>
        ) : (
          <>
            <span className="font-display text-[28px] font-medium">{mxn(precio.salida)}</span>
            {precio.frase && <p className="text-[13px] text-paper-dim">{precio.frase}</p>}
            <a href={`/activo/${activo.id}`} className="font-plex-mono text-[12px] text-gold-400">Ver análisis completo →</a>
          </>
        )}
      </div>

      <div className={`${tarjeta} border-white/10`}>
        <span className={`${etiqueta} text-gold-400`}>Certifica tu propiedad</span>
        {cert === 'certificada' ? (
          <p className="text-[14px]">Tu propiedad está certificada. <a href={`/activo/${activo.id}/reporte`} className="text-gold-400 underline underline-offset-2">Ver reporte</a></p>
        ) : cert === 'solicitada' || cert === 'pagada' ? (
          <p className="text-[14px]">Tu certificación está en revisión. Te avisamos al terminar.</p>
        ) : (
          <>
            <p className="text-[14px]">Las propiedades certificadas generan más confianza y se venden más rápido. <span className="text-paper-dim">La plataforma se encarga de la certificación por ti.</span></p>
            <p className="text-[12.5px] text-slate">Te pediremos escritura, folio real y predial.</p>
            <a href={`/activo/${activo.id}#expediente`} className={`${boton} bg-gold-500 text-navy-950 hover:bg-gold-400`}>Certificar mi propiedad</a>
          </>
        )}
      </div>

      <div className={`${tarjeta} border-white/10`}>
        <span className={`${etiqueta} text-slate`}>Tu página de venta</span>
        {activo.publicada_at ? (
          <p className="text-[14px]">Tu página está publicada. <a href={`/activo/${activo.id}/marketing`} className="text-gold-400 underline underline-offset-2">Compartirla</a> · <a href={`/activo/${activo.id}/leads`} className="text-gold-400 underline underline-offset-2">Ver interesados</a></p>
        ) : (
          <>
            <p className="text-[14px]">Cuando quieras, escribimos tu ficha de venta y publicamos tu página para compartirla por WhatsApp.</p>
            <a href={`/activo/${activo.id}/marketing`} className={`${boton} border border-white/15 hover:border-white/30`}>Crear mi página</a>
          </>
        )}
      </div>

      {!conBroker && tarjetaBroker}
    </>
  )
}
