'use client'

// Entrada simple tipo chat del mundo demo (lib/entradaDemo.ts; guion v12, momento 1; conversación
// aprobada por JC el 19-nov-2026):
//   "Bienvenido a SMT Match. ¿Ya eres miembro?"
//     Sí        → usuario o teléfono → "¡Hola de nuevo!" → su panel (o a donde iba)
//     Todavía no → nombre → nombre de usuario (sugerido) → al menos un contacto → "Ya eres miembro"
//                  → ¿Qué quieres hacer? (/empezar?mundo=demo)
// Sin contraseña ni verificación (solo mundo demo). Cada paso se puede regresar.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BandaPaso, MarcaBarra } from '../components/Banda'
import { normalizarUsuario, validarUsuario, sugerirUsuario, validarContactos, esTelefono } from '@/lib/entradaDemo'
import { homePorRol } from '@/lib/roles'

type Etapa = 'inicio' | 'miembro' | 'nombre' | 'usuario' | 'contactos' | 'listo'
interface Linea { de: 'cliente' | 'chat'; texto: string }

const SALUDO = 'Bienvenido a SMT Match. ¿Ya eres miembro?'
const PREGUNTA: Record<Exclude<Etapa, 'inicio' | 'listo'>, string> = {
  miembro: 'Escribe tu nombre de usuario o tu teléfono.',
  nombre: '¡Qué gusto! ¿Cómo te llamamos?',
  usuario: 'Elige tu nombre de usuario. Te sugerimos este; puedes cambiarlo.',
  contactos: '¿Cómo te contactamos? Con uno basta.',
}
const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? n

export default function EntradaDemo({ quiere }: { quiere: string | null }) {
  const router = useRouter()
  const [lineas, setLineas] = useState<Linea[]>([{ de: 'chat', texto: SALUDO }])
  // Pila de etapas con cuántas líneas había al entrar a cada una (para regresar).
  const [pila, setPila] = useState<{ etapa: Etapa; n: number }[]>([{ etapa: 'inicio', n: 1 }])
  const etapa = pila[pila.length - 1].etapa
  const [dato, setDato] = useState('')
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [c, setC] = useState({ whatsapp: '', telefono: '', correo: '', mismo: true })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [lineas, etapa])

  const aEmpezar = `/empezar?mundo=demo${quiere ? `&quiere=${quiere}` : ''}`
  const ir = (siguiente: Etapa, ...nuevas: Linea[]) => {
    setError(null)
    const t = [...lineas, ...nuevas]
    setLineas(t); setPila((p) => [...p, { etapa: siguiente, n: t.length }])
  }
  const atras = () => {
    if (pila.length <= 1) { router.push('/bienvenida?mundo=demo'); return }
    const p = pila.slice(0, -1)
    setPila(p); setLineas((l) => l.slice(0, p[p.length - 1].n)); setError(null)
  }

  const abrirSesion = async (tokenHash: string) => {
    const { error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (e) throw new Error('No se pudo abrir tu sesión. Intenta de nuevo.')
  }
  const llamar = async (cuerpo: object) => {
    const r = await fetch('/api/entrada-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Algo falló. Intenta de nuevo.')
    return j as { tokenHash: string; nombre: string | null; rol: string | null }
  }

  // Sí, ya soy miembro → usuario o teléfono.
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    const d = dato.trim()
    if (!d || enviando) return
    setEnviando(true); setError(null)
    try {
      const j = await llamar({ accion: 'entrar', usuario: d })
      await abrirSesion(j.tokenHash)
      const cliente = j.rol === 'inversionista' || j.rol === 'propietario'
      const a = quiere ? aEmpezar : cliente ? '/inicio' : homePorRol(j.rol)
      ir('listo', { de: 'cliente', texto: d }, { de: 'chat', texto: `¡Hola de nuevo${j.nombre ? `, ${primerNombre(j.nombre)}` : ''}!` })
      setTimeout(() => router.push(a), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setEnviando(false) }
  }

  const darNombre = (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (n.length < 2) { setError('Escribe tu nombre'); return }
    setUsuario((u) => u || sugerirUsuario(n))
    ir('usuario', { de: 'cliente', texto: n }, { de: 'chat', texto: PREGUNTA.usuario })
  }

  const darUsuario = (e: React.FormEvent) => {
    e.preventDefault()
    const u = normalizarUsuario(usuario)
    const err = validarUsuario(u)
    if (err) { setError(err); return }
    setUsuario(u)
    ir('contactos', { de: 'cliente', texto: u }, { de: 'chat', texto: PREGUNTA.contactos })
  }

  const darContactos = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando) return
    const contactos = { whatsapp: c.whatsapp, telefono: c.mismo && c.whatsapp ? c.whatsapp : c.telefono, correo: c.correo }
    const err = validarContactos(contactos)
    if (err) { setError(err); return }
    setEnviando(true); setError(null)
    try {
      const j = await llamar({ accion: 'alta', nombre: nombre.trim(), usuario, ...contactos })
      await abrirSesion(j.tokenHash)
      const resumen = [c.whatsapp && `WhatsApp ${c.whatsapp}`, !c.mismo && c.telefono && `Teléfono ${c.telefono}`, c.correo].filter(Boolean).join(' · ')
      ir('listo', { de: 'cliente', texto: resumen }, { de: 'chat', texto: `Listo, ${primerNombre(nombre)}. Ya eres miembro de SMT Match.` })
      setDestino(aEmpezar)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setEnviando(false) }
  }

  const campo = 'flex-1 min-w-0 bg-tarjeta border border-linea-fuerte rounded-lg px-3.5 py-3 text-[17px] text-tinta placeholder:text-tenue'
  const enviar = (texto = 'Enviar', deshabilitado = false) => (
    <button type="submit" disabled={enviando || deshabilitado} className="font-sans text-[16px] font-medium px-4 py-3 rounded-lg text-white disabled:opacity-50" style={{ background: 'var(--c-acento)' }}>
      {enviando ? 'Un momento…' : texto}
    </button>
  )
  const barra = (
    <>
      <MarcaBarra href="/bienvenida?mundo=demo" />
      <span className="font-sans text-[14px] text-tenue">Mundo demo</span>
    </>
  )

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans">
      <div className="w-full max-w-[640px] mx-auto px-5 pb-12 flex flex-col gap-6">
        <BandaPaso barra={barra} titulo="Entra a SMT Match" subtitulo="Sin contraseñas: con tu nombre de usuario o tu teléfono."
          atras={etapa !== 'listo' ? <button onClick={atras} className="font-sans text-[16px] text-tinta-2 hover:text-tinta">← Atrás</button> : undefined} />

        <div className="flex flex-col gap-3" data-entrada={etapa}>
          <div className="bg-tarjeta border border-linea rounded-xl p-4 flex flex-col gap-3" aria-live="polite">
            {lineas.map((l, k) => (
              <p key={k} className={`text-[17px] leading-snug max-w-[88%] px-3.5 py-2.5 rounded-xl ${l.de === 'cliente' ? 'self-end text-white' : 'self-start bg-fondo text-tinta'}`}
                style={l.de === 'cliente' ? { background: 'var(--c-acento)' } : undefined} data-de={l.de}>{l.texto}</p>
            ))}
            <div ref={fin} />
          </div>

          {etapa === 'inicio' && (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" data-entrada-si onClick={() => ir('miembro', { de: 'cliente', texto: 'Sí, ya soy miembro' }, { de: 'chat', texto: PREGUNTA.miembro })}
                className="font-sans text-[17px] font-medium px-4 py-3.5 rounded-lg border border-linea-fuerte text-tinta hover:border-acento">Sí, ya soy miembro</button>
              <button type="button" data-entrada-no onClick={() => ir('nombre', { de: 'cliente', texto: 'Todavía no' }, { de: 'chat', texto: PREGUNTA.nombre })}
                className="font-sans text-[17px] font-medium px-4 py-3.5 rounded-lg text-white" style={{ background: 'var(--c-acento)' }}>Todavía no</button>
            </div>
          )}

          {etapa === 'miembro' && (
            <form onSubmit={entrar} className="flex gap-2">
              <input value={dato} onChange={(e) => setDato(e.target.value)} autoFocus maxLength={60} data-campo="usuario-o-telefono"
                placeholder="patricia.longoria o 81 1234 5678" aria-label="Tu nombre de usuario o tu teléfono"
                inputMode={esTelefono(dato) ? 'tel' : 'text'} autoCapitalize="none" autoComplete="username" className={campo} />
              {enviar('Entrar', !dato.trim())}
            </form>
          )}

          {etapa === 'nombre' && (
            <form onSubmit={darNombre} className="flex gap-2">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={120} data-campo="nombre"
                placeholder="Tu nombre" aria-label="Tu nombre" autoComplete="name" className={campo} />
              {enviar('Enviar', nombre.trim().length < 2)}
            </form>
          )}

          {etapa === 'usuario' && (
            <form onSubmit={darUsuario} className="flex gap-2">
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus maxLength={30} data-campo="usuario"
                aria-label="Tu nombre de usuario" autoCapitalize="none" autoComplete="username" className={campo} />
              {enviar('Usar este', !usuario.trim())}
            </form>
          )}

          {etapa === 'contactos' && (
            <form onSubmit={darContactos} className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[14px] font-medium text-tinta-2">WhatsApp</span>
                <input value={c.whatsapp} onChange={(e) => setC((x) => ({ ...x, whatsapp: e.target.value }))} autoFocus inputMode="tel" autoComplete="tel"
                  placeholder="81 1234 5678" data-campo="whatsapp" className={campo} />
              </label>
              {c.whatsapp.trim() && (
                <label className="flex items-center gap-2 text-[16px] text-tinta-2">
                  <input type="checkbox" checked={c.mismo} onChange={(e) => setC((x) => ({ ...x, mismo: e.target.checked }))} data-campo="mismo" />
                  Es el mismo número para llamadas
                </label>
              )}
              {!(c.mismo && c.whatsapp.trim()) && (
                <label className="flex flex-col gap-1">
                  <span className="text-[14px] font-medium text-tinta-2">Teléfono</span>
                  <input value={c.telefono} onChange={(e) => setC((x) => ({ ...x, telefono: e.target.value }))} inputMode="tel"
                    placeholder="81 1234 5678" data-campo="telefono" className={campo} />
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[14px] font-medium text-tinta-2">Correo</span>
                <input type="email" value={c.correo} onChange={(e) => setC((x) => ({ ...x, correo: e.target.value }))} autoComplete="email"
                  placeholder="tu@correo.com" data-campo="correo" className={campo} />
              </label>
              <p className="text-[15px] text-tenue">Lo usamos solo para conectarte con quien tú elijas. <a href="/aviso-privacidad" target="_blank" className="text-acento underline underline-offset-2">Aviso de privacidad</a></p>
              {enviar('Darme de alta')}
            </form>
          )}

          {etapa === 'listo' && destino && (
            <button type="button" data-entrada-continuar onClick={() => router.push(destino)}
              className="font-sans text-[17px] font-medium px-4 py-3.5 rounded-lg text-white" style={{ background: 'var(--c-acento)' }}>Continuar →</button>
          )}

          {error && <p className="text-[16px]" style={{ color: 'var(--c-rojo, #b42318)' }} data-error>{error}</p>}
        </div>
      </div>
    </div>
  )
}
