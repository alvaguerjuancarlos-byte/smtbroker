'use client'

// Consola de Operación MindBridge — Fase B del V6.1:
//   - Matches por validar: solicitudes "Me interesa conectar" (tabla matches). Operación ve las
//     identidades completas de ambos lados -- los brokers no (ver app/api/matches) -- y decide si
//     los pone en contacto. Es la validación manual de la Fase 2 del roadmap (2–3 por semana
//     antes de automatizar). Ordenados por nivel de Broker Certificado SMT: la primera forma de
//     "prioridad de match" (V6.1 §6.3).
//   - Cierres por verificar: reportes de cierres_reportados; los verificados suben el nivel.
// La RLS ya permite a Operación leer y actualizar todo esto (es_operacion(), migraciones
// 20261005000100 y 20261006000000).
// Mundos (lib/mundo.ts, migración 20261008000000): la consola solo muestra el mundo de la cuenta de
// Operación -- la cuenta demo del video nunca enseña solicitudes reales del piloto, y la real no
// se llena de solicitudes ficticias.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularNivel, ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { tieneDocumentacion } from '@/lib/expediente'
import { mismoMundo } from '@/lib/mundo'

interface Match {
  id: string; activo_id: string; perfil_id: string; solicitado_por: string
  score: number; razones: string[]; estado: string; created_at: string
}
interface Cierre {
  id: string; activo_id: string; broker_id: string; precio_cierre: number; fecha_cierre: string
  origen_comprador: string; estado: string; created_at: string
}
interface Activo {
  id: string; nombre: string; municipio: string; broker_id: string | null; usuario_id: string
  folio_real: string | null; escritura_publica: string | null; es_demo: boolean
}
interface Perfil { id: string; usuario_id: string | null; broker_id: string | null; alias_cliente: string | null }
interface Usuario { id: string; nombre: string | null; es_demo: boolean; fundador: boolean }

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const ORIGEN: Record<string, string> = {
  mi_cliente: 'cliente propio', otro_broker: 'cliente de otro broker',
  comprador_directo: 'comprador directo', fuera_de_plataforma: 'fuera de la plataforma',
}

export default function ValidacionOperacion() {
  const [matches, setMatches] = useState<Match[]>([])
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [activos, setActivos] = useState<Activo[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const [m, c, a, p, u] = await Promise.all([
        supabase.from('matches').select('id, activo_id, perfil_id, solicitado_por, score, razones, estado, created_at').order('created_at', { ascending: false }),
        supabase.from('cierres_reportados').select('id, activo_id, broker_id, precio_cierre, fecha_cierre, origen_comprador, estado, created_at').order('created_at', { ascending: false }),
        supabase.from('activos').select('id, nombre, municipio, broker_id, usuario_id, folio_real, escritura_publica, es_demo'),
        supabase.from('perfiles_intencion').select('id, usuario_id, broker_id, alias_cliente'),
        supabase.from('usuarios').select('id, nombre, es_demo, fundador'),
      ])
      const todosUsuarios = (u.data as Usuario[]) || []
      const yoDemo = todosUsuarios.find(x => x.id === user?.id)?.es_demo
      const delMundo = ((a.data as Activo[]) || []).filter(x => mismoMundo(x.es_demo, yoDemo))
      const ids = new Set(delMundo.map(x => x.id))
      setMatches(((m.data as Match[]) || []).filter(x => ids.has(x.activo_id)))
      setCierres(((c.data as Cierre[]) || []).filter(x => ids.has(x.activo_id)))
      setActivos(delMundo)
      setPerfiles((p.data as Perfil[]) || [])
      setUsuarios(todosUsuarios)
      setCargando(false)
    }
    init()
  }, [])

  const nombre = (id: string | null | undefined) => usuarios.find(u => u.id === id)?.nombre || '—'
  const activo = (id: string) => activos.find(a => a.id === id)
  const esFundador = (id: string | null | undefined) => !!usuarios.find(u => u.id === id)?.fundador

  const nivelDe = (brokerId: string | null | undefined) => {
    if (!brokerId) return null
    const propios = activos.filter(a => a.broker_id === brokerId)
    return calcularNivel({
      propiedades: propios.length,
      conDocumentacion: propios.filter(tieneDocumentacion).length,
      cierresVerificados: cierres.filter(c => c.broker_id === brokerId && c.estado === 'verificado').length,
      fundador: esFundador(brokerId),
    }).actual
  }

  const describirPerfil = (id: string) => {
    const p = perfiles.find(x => x.id === id)
    if (!p) return '—'
    return p.usuario_id ? `${nombre(p.usuario_id)} (comprador directo)` : `${p.alias_cliente} (cliente de ${nombre(p.broker_id)})`
  }

  const actualizarMatch = async (id: string, estado: string) => {
    await supabase.from('matches').update({ estado, actualizado_at: new Date().toISOString() }).eq('id', id)
    setMatches(ms => ms.map(m => (m.id === id ? { ...m, estado } : m)))
  }

  const actualizarCierre = async (id: string, estado: 'verificado' | 'rechazado') => {
    await supabase.from('cierres_reportados').update({ estado, verificado_at: new Date().toISOString() }).eq('id', id)
    setCierres(cs => cs.map(c => (c.id === id ? { ...c, estado } : c)))
  }

  if (cargando) return null

  const pendientes = matches
    .filter(m => m.estado === 'solicitado' || m.estado === 'en_contacto')
    .map(m => ({ m, nivel: nivelDe(activo(m.activo_id)?.broker_id) }))
    .sort((x, y) => (ORDEN_NIVEL[y.nivel?.id ?? 'aliado'] - ORDEN_NIVEL[x.nivel?.id ?? 'aliado']) || y.m.score - x.m.score)
  const cierresPendientes = cierres.filter(c => c.estado === 'pendiente')

  const boton = 'font-plex-mono text-[11px] px-3 py-1.5 border transition-colors'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-navy-800 border border-white/10">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-fraunces text-[17px] font-medium text-paper">Matches por validar</h2>
          <span className="font-plex-mono text-[11px] text-slate">{pendientes.length}</span>
        </div>
        {pendientes.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-slate">Sin solicitudes de conexión pendientes.</p>
        ) : pendientes.map(({ m, nivel }) => {
          const a = activo(m.activo_id)
          return (
            <div key={m.id} className="px-5 py-4 border-b border-white/10 last:border-b-0 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] text-paper">
                  <b>{a?.nombre ?? 'Propiedad'}</b> ({a?.municipio}) ↔ {describirPerfil(m.perfil_id)}
                </p>
                <span className="font-fraunces text-[18px] text-gold-400 shrink-0">{m.score}</span>
              </div>
              <p className="text-[11.5px] text-slate">
                Broker de la propiedad: {nombre(a?.broker_id)}{nivel ? ` · Nivel ${nivel.nombre}` : ''}{esFundador(a?.broker_id) ? ' · ★ Fundador' : ''} · Solicitó: {nombre(m.solicitado_por)}
              </p>
              <p className="text-[11.5px] text-paper-dim">{(m.razones || []).join(' · ')}</p>
              <div className="flex flex-wrap gap-2">
                {m.estado === 'solicitado' && (
                  <button onClick={() => actualizarMatch(m.id, 'en_contacto')} className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400`}>Poner en contacto</button>
                )}
                {m.estado === 'en_contacto' && (
                  <>
                    <span className="font-plex-mono text-[10.5px] text-gold-400 border border-gold-500/30 px-2.5 py-1.5">En contacto</span>
                    <button onClick={() => actualizarMatch(m.id, 'cerrado')} className={`${boton} border-gold-500/40 text-gold-400 hover:border-gold-500`}>Marcar cerrado</button>
                  </>
                )}
                <button onClick={() => actualizarMatch(m.id, 'descartado')} className={`${boton} border-white/15 text-slate hover:text-paper`}>Descartar</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-navy-800 border border-white/10">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-fraunces text-[17px] font-medium text-paper">Cierres por verificar</h2>
          <span className="font-plex-mono text-[11px] text-slate">{cierresPendientes.length}</span>
        </div>
        {cierresPendientes.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-slate">Sin cierres pendientes de verificar.</p>
        ) : cierresPendientes.map(c => (
          <div key={c.id} className="px-5 py-4 border-b border-white/10 last:border-b-0 flex flex-col gap-2">
            <p className="text-[13.5px] text-paper"><b>{activo(c.activo_id)?.nombre ?? 'Propiedad'}</b> · {mxn(c.precio_cierre)}</p>
            <p className="text-[11.5px] text-slate">
              Reportó {nombre(c.broker_id)} · {new Date(c.fecha_cierre + 'T12:00:00').toLocaleDateString('es-MX')} · {ORIGEN[c.origen_comprador] ?? c.origen_comprador}
            </p>
            <div className="flex gap-2">
              <button onClick={() => actualizarCierre(c.id, 'verificado')} className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400`}>Verificar</button>
              <button onClick={() => actualizarCierre(c.id, 'rechazado')} className={`${boton} border-red-900/60 text-[#f3a3a3] hover:bg-red-950/30`}>Rechazar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
