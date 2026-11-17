'use client'

// Chat de entrada (Documento Maestro V10, §29.2), camino "comprar o rentar". El cliente escribe con
// sus palabras; la ficha se llena al lado en chips (cada uno se puede quitar); si falta un dato
// importante, el chat lo pregunta, una cosa a la vez. Con la ficha lista se activa "Buscar".
// Siempre se puede saltar y llenar la ficha a mano (onAMano).
import { useEffect, useRef, useState } from 'react'
import { BandaPaso } from '../components/Banda'
import { chipsDeFicha, quitarChip, fichaLista, fichaVacia, siguientePregunta, mensajeDelChat, type FichaChat, type Pregunta } from '@/lib/chatFicha'

interface Linea { de: 'cliente' | 'chat'; texto: string }

const verde = 'var(--c-verde)'
const EJEMPLO = 'Busco casa para mi familia en Cumbres, con jardín, como de 4 millones.'

export default function ChatFicha({ barra, onAtras, onAMano, onBuscar, cargando }: {
  barra?: React.ReactNode
  onAtras: () => void
  onAMano: (f: FichaChat) => void
  onBuscar: (f: FichaChat) => void
  cargando: boolean
}) {
  const [ficha, setFicha] = useState<FichaChat>(fichaVacia())
  const [lineas, setLineas] = useState<Linea[]>([{ de: 'chat', texto: 'Cuéntame qué buscas, como se lo dirías a una persona: qué tipo de propiedad, dónde y cuánto quieres pagar.' }])
  const [texto, setTexto] = useState('')
  const [pregunta, setPregunta] = useState<Pregunta | null>(null)
  const [yaPreguntadas, setYaPreguntadas] = useState<Pregunta[]>([])
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [lineas, pensando])

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || pensando) return
    setTexto(''); setError(null); setPensando(true)
    setLineas((l) => [...l, { de: 'cliente', texto: mensaje }])
    const r = await fetch('/api/chat-ficha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje, ficha, ultimaPregunta: pregunta, yaPreguntadas }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setPensando(false)
    if (!r || !r.ok) { setError(j.error ?? 'No se pudo enviar. Intenta de nuevo.'); return }
    setFicha(j.ficha); setPregunta(j.pregunta); setYaPreguntadas(j.yaPreguntadas)
    setLineas((l) => [...l, { de: 'chat', texto: j.mensaje }])
  }

  // Quitar un chip: si era obligatorio, el chat lo vuelve a preguntar.
  const quitar = (clave: string) => {
    const f = quitarChip(ficha, clave)
    setFicha(f)
    const p = siguientePregunta(f, yaPreguntadas)
    if (p && p !== pregunta) { setPregunta(p); setLineas((l) => [...l, { de: 'chat', texto: mensajeDelChat(f, p, []) }]) }
  }

  const chips = chipsDeFicha(ficha)
  const lista = fichaLista(ficha)

  return (
    <>
      <BandaPaso barra={barra} titulo="¿Qué buscas?" subtitulo="Escríbelo con tus palabras. Tu ficha se va llenando sola."
        atras={<button onClick={onAtras} className="font-sans text-[16px] text-tinta-2 hover:text-tinta">← Atrás</button>} />

      <div className="flex flex-col gap-3" data-chat-ficha>
        <div className="bg-tarjeta border border-linea rounded-xl p-4 flex flex-col gap-3 max-h-[46vh] overflow-y-auto" aria-live="polite">
          {lineas.map((l, k) => (
            <p key={k} className={`text-[17px] leading-snug max-w-[88%] px-3.5 py-2.5 rounded-xl ${l.de === 'cliente' ? 'self-end text-white' : 'self-start bg-fondo text-tinta'}`}
              style={l.de === 'cliente' ? { background: 'var(--c-acento)' } : undefined} data-de={l.de}>{l.texto}</p>
          ))}
          {pensando && <p className="self-start text-[16px] text-tenue px-1">Anotando…</p>}
          <div ref={fin} />
        </div>

        <form onSubmit={enviar} className="flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} autoFocus
            placeholder={lineas.length === 1 ? EJEMPLO : 'Escribe tu respuesta…'} aria-label="Tu mensaje"
            className="flex-1 min-w-0 bg-tarjeta border border-linea-fuerte rounded-lg px-3.5 py-3 text-[17px] text-tinta placeholder:text-tenue" />
          <button type="submit" disabled={!texto.trim() || pensando} className="font-sans text-[16px] font-medium px-4 rounded-lg text-white disabled:opacity-50" style={{ background: 'var(--c-acento)' }}>Enviar</button>
        </form>
        {error && <p className="text-[15px]" style={{ color: 'var(--c-rojo, #b42318)' }}>{error}</p>}

        <div className="flex flex-col gap-2 mt-1">
          <span className="text-[14px] font-medium text-tinta-2 uppercase tracking-wide">Tu ficha</span>
          {chips.length === 0
            ? <p className="text-[16px] text-tenue">Aquí aparece lo que vaya entendiendo.</p>
            : (
              <div className="flex flex-wrap gap-2" data-chips>
                {chips.map((c) => (
                  <button key={c.clave} type="button" onClick={() => quitar(c.clave)} data-chip={c.clave} title="Quitar"
                    className="text-[16px] px-3 py-2 rounded-lg border text-tinta flex items-center gap-2"
                    style={c.clave.startsWith('preferencia:') ? { borderColor: 'var(--c-linea-fuerte)' } : { borderColor: verde, background: 'var(--c-verde-suave)' }}>
                    {c.texto}<span aria-hidden className="text-tenue">×</span>
                  </button>
                ))}
              </div>
            )}
        </div>

        <button type="button" onClick={() => onBuscar(ficha)} disabled={!lista || cargando || pensando} data-buscar
          className="font-sans text-[17px] font-medium px-4 py-3.5 rounded-lg text-white disabled:opacity-50 mt-1" style={{ background: verde }}>
          {cargando ? 'Buscando…' : 'Buscar'}
        </button>
        <button type="button" onClick={() => onAMano(ficha)} className="text-[16px] text-tinta-2 hover:text-tinta underline underline-offset-4 self-center">
          Prefiero llenar la ficha a mano
        </button>
      </div>
    </>
  )
}
