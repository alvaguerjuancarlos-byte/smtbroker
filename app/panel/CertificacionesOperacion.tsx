'use client'

// Consola de Operación MindBridge — certificaciones legales (Documento Maestro V6.3, §13).
// Desde 2026-10-07 son GRATIS (con límite de 3 al mes por persona, Pioneros sin límite; migración
// 20261008000600): una solicitud entra directo "en revisión" →
//   "Correr dictamen" (Agente Legal completo; solo Operación puede generarlo) → revisar →
//   "Certificar" | "Rechazar" (app/api/operacion/certificacion, que avisa por correo a quien la pidió).
// Solo se muestra el mundo de la cuenta de Operación (lib/mundo.ts), igual que ValidacionOperacion.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mismoMundo } from '@/lib/mundo'
import type { EstadoCertificacion } from '@/lib/expediente'

interface Certificacion { id: string; activo_id: string; solicitado_por: string; estado: EstadoCertificacion; created_at: string }
interface Activo { id: string; nombre: string; municipio: string; es_demo: boolean }
interface Usuario { id: string; nombre: string | null; es_demo: boolean; pionero: boolean }
interface Dictamen {
  verdictCls: 'ok' | 'warn' | 'bad'; verdictBadge: string; verdictTitle: string; verdictDesc: string; score: string
  _guardado?: { id: string } | null
}

const boton = 'font-plex-mono text-[11px] px-3 py-1.5 border transition-colors disabled:opacity-50'
const tonoDictamen = { ok: 'text-[#6bdb9a]', warn: 'text-[#e8b568]', bad: 'text-[#f3a3a3]' }

async function llamar(url: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
    body: JSON.stringify(body),
  }).then(res => res.json()).catch(() => ({ error: 'Error de red' }))
}

export default function CertificacionesOperacion() {
  const [certs, setCerts] = useState<Certificacion[]>([])
  const [activos, setActivos] = useState<Activo[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [dictamen, setDictamen] = useState<Record<string, Dictamen | { error: string } | 'cargando'>>({})
  const [errorCierre, setErrorCierre] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const [c, a, u] = await Promise.all([
        supabase.from('certificaciones').select('id, activo_id, solicitado_por, estado, created_at').order('created_at', { ascending: true }),
        supabase.from('activos').select('id, nombre, municipio, es_demo'),
        supabase.from('usuarios').select('id, nombre, es_demo, pionero'),
      ])
      const todos = (u.data as Usuario[]) || []
      const yoDemo = todos.find(x => x.id === user?.id)?.es_demo
      const delMundo = ((a.data as Activo[]) || []).filter(x => mismoMundo(x.es_demo, yoDemo))
      const ids = new Set(delMundo.map(x => x.id))
      setCerts(((c.data as Certificacion[]) || []).filter(x => ids.has(x.activo_id)))
      setActivos(delMundo)
      setUsuarios(todos)
      setCargando(false)
    }
    init()
  }, [])

  const activo = (id: string) => activos.find(a => a.id === id)
  const usuario = (id: string) => usuarios.find(u => u.id === id)

  const cerrar = async (c: Certificacion, estado: 'certificada' | 'rechazada', dictamenId?: string) => {
    setErrorCierre(e => ({ ...e, [c.id]: '' }))
    const r = await llamar('/api/operacion/certificacion', { certificacionId: c.id, estado, dictamenId })
    if (r.error) { setErrorCierre(e => ({ ...e, [c.id]: r.error })); return }
    setCerts(cs => cs.map(x => (x.id === c.id ? { ...x, estado } : x)))
  }

  // regenerar = true corre el Agente Legal completo (Claude + búsquedas, ~1 min); false lee el
  // último dictamen guardado, si existe.
  const pedirDictamen = async (c: Certificacion, regenerar: boolean) => {
    setDictamen(d => ({ ...d, [c.id]: 'cargando' }))
    const r = await llamar('/api/agentes/legal', { activoId: c.activo_id, regenerar })
    setDictamen(d => ({ ...d, [c.id]: r.error ? { error: r.error } : (r as Dictamen) }))
  }

  if (cargando) return null
  const abiertas = certs.filter(c => c.estado === 'en_revision')

  return (
    <div className="bg-navy-800 border border-white/10">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-fraunces text-[17px] font-medium text-paper">Certificaciones legales</h2>
        <span className="font-plex-mono text-[11px] text-slate">{abiertas.length}</span>
      </div>
      {abiertas.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-slate">Sin certificaciones en revisión.</p>
      ) : abiertas.map(c => {
        const a = activo(c.activo_id)
        const quien = usuario(c.solicitado_por)
        const d = dictamen[c.id]
        const listo = d && d !== 'cargando' && !('error' in d) ? d : null
        return (
          <div key={c.id} className="px-5 py-4 border-b border-white/10 last:border-b-0 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13.5px] text-paper"><b>{a?.nombre ?? 'Propiedad'}</b> ({a?.municipio})</p>
              <span className="font-plex-mono text-[10.5px] text-gold-400 border border-gold-500/30 px-2 py-1 shrink-0">En revisión</span>
            </div>
            <p className="text-[11.5px] text-slate">
              Solicitó: {quien?.nombre ?? '—'}{quien?.pionero ? ' · ★ Pionero' : ''} · {new Date(c.created_at).toLocaleDateString('es-MX')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button disabled={d === 'cargando'} onClick={() => pedirDictamen(c, true)}
                className={`${boton} border-gold-500/40 text-gold-400 hover:border-gold-500`}>
                {d === 'cargando' ? 'Generando dictamen… (≈1 min)' : listo ? 'Volver a correr el dictamen' : 'Correr dictamen'}
              </button>
              {!d && (
                <button onClick={() => pedirDictamen(c, false)} className={`${boton} border-white/15 text-slate hover:text-paper`}>Ver último dictamen</button>
              )}
            </div>
            {d && d !== 'cargando' && 'error' in d && <p className="text-[12px] text-[#f3a3a3]">{d.error}</p>}
            {listo && (
              <div className="border border-white/10 bg-navy-950/40 p-3 flex flex-col gap-1.5">
                <p className={`font-plex-mono text-[11px] ${tonoDictamen[listo.verdictCls]}`}>{listo.verdictBadge} · Score legal {listo.score}</p>
                <p className="text-[13px] text-paper">{listo.verdictTitle}</p>
                <p className="text-[12px] text-paper-dim">{listo.verdictDesc}</p>
                <p className="text-[11px] text-slate">Revísalo completo en la ficha del activo antes de certificar. Quien la pidió recibe un correo con el resultado.</p>
                <div className="flex gap-2 mt-1">
                  <button disabled={!listo._guardado?.id} onClick={() => cerrar(c, 'certificada', listo._guardado!.id)}
                    className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400`}>Certificar</button>
                  <button onClick={() => cerrar(c, 'rechazada', listo._guardado?.id)}
                    className={`${boton} border-white/15 text-slate hover:text-paper`}>Rechazar</button>
                </div>
              </div>
            )}
            {errorCierre[c.id] && <p className="text-[12px] text-[#f3a3a3]">{errorCierre[c.id]}</p>}
          </div>
        )
      })}
    </div>
  )
}
