'use client'

// Formulario "Me interesa" de la página pública (Documento Maestro V6.3, §14.2). Corto a propósito:
// nombre, contacto, presupuesto, plazo y forma de pago, con el aviso de privacidad. La calificación
// la calcula el servidor (app/api/leads).
import { useState } from 'react'
import { AvisoSimplificado } from '@/app/components/AvisoSimplificado'
import { RANGOS_PRESUPUESTO, PLAZOS, FORMAS_PAGO } from '@/lib/calificacionLeads'

const campo = 'w-full bg-navy-950/60 border border-white/15 px-3 py-2.5 text-[14px] text-paper placeholder:text-slate focus:border-gold-500 outline-none'

export function MeInteresa({ activoId }: { activoId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({ nombre: '', contacto: '', presupuesto: '', plazo: '', formaPago: '', mensaje: '', sitio_web: '' })
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError('')
    const r = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activoId, ...f, presupuesto: f.presupuesto || null, aceptaAviso: acepta }),
    }).then(res => res.json()).catch(() => ({ error: 'Error de red' }))
    setEnviando(false)
    if (r.error) { setError(r.error); return }
    setListo(true)
  }

  if (listo) {
    return (
      <div className="border border-gold-500/40 bg-gold-500/[0.08] p-5">
        <p className="text-[16px] font-medium text-paper">¡Gracias! Recibimos tu interés.</p>
        <p className="text-[13px] text-paper-dim mt-1">El broker que representa esta propiedad te contactará pronto.</p>
      </div>
    )
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        className="w-full bg-gold-500 text-navy-950 px-6 py-4 font-plex-mono text-[14px] tracking-[0.02em] hover:bg-gold-400 transition-colors">
        Me interesa esta propiedad
      </button>
    )
  }

  return (
    <form onSubmit={enviar} className="bg-navy-800 border border-gold-500/30 p-5 flex flex-col gap-3">
      <p className="font-plex-mono text-[11px] text-gold-400 uppercase tracking-[0.1em]">Me interesa</p>
      <input className={campo} placeholder="Tu nombre" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} required />
      <input className={campo} placeholder="Correo o WhatsApp (10 dígitos)" value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })} required />
      {/* Campo trampa para bots: oculto a personas. */}
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.sitio_web} onChange={e => setF({ ...f, sitio_web: e.target.value })} />
      <select className={campo} value={f.presupuesto} onChange={e => setF({ ...f, presupuesto: e.target.value })}>
        <option value="">Presupuesto (opcional)</option>
        {RANGOS_PRESUPUESTO.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select className={campo} value={f.plazo} onChange={e => setF({ ...f, plazo: e.target.value })} required>
          <option value="">¿Cuándo piensas comprar?</option>
          {Object.entries(PLAZOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className={campo} value={f.formaPago} onChange={e => setF({ ...f, formaPago: e.target.value })} required>
          <option value="">¿Cómo pagarías?</option>
          {Object.entries(FORMAS_PAGO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <textarea className={campo} rows={2} placeholder="Mensaje (opcional)" value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} />
      <label className="flex gap-2.5 items-start text-[12.5px] text-paper-dim cursor-pointer">
        <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-0.5" />
        <span>Acepto que mis datos se compartan con el broker o propietario de esta propiedad.</span>
      </label>
      <AvisoSimplificado contexto="interesado" />
      {error && <p className="text-[12.5px] text-[#f3a3a3]">{error}</p>}
      <button type="submit" disabled={enviando || !acepta}
        className="bg-gold-500 text-navy-950 px-6 py-3 font-plex-mono text-[13px] hover:bg-gold-400 disabled:opacity-50">
        {enviando ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  )
}
