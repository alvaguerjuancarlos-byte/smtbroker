'use client'

// Leads nivel 1 (Documento Maestro V6.3, §14.2; paso 6 del plan, 2026-10-07). Antes esta pantalla
// era 100 % simulada. Ahora muestra:
//   - los interesados reales que presionaron «Me interesa» en la página pública (/p/[id]),
//     calificados por reglas explicables (lib/calificacionLeads.ts) con sus razones;
//   - los compradores que llegaron por el motor de matching (solicitudes de conexión visibles para
//     quien las pidió; el detalle vive en Matches del portal del broker).
// Al interesado Serio se le ofrece el Reporte de Transparencia si la propiedad está certificada.
// La RLS deja ver los leads solo al dueño y al broker del activo (y a Operación).
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { filtroAccesoActivo } from '@/lib/accesoActivo'
import { useRolUsuario } from '@/lib/useRolUsuario'
import { ETIQUETA_CATEGORIA, PLAZOS, FORMAS_PAGO, type CategoriaLead, type Plazo, type FormaPago } from '@/lib/calificacionLeads'
import Topbar from '../../../components/Topbar'

interface Activo { id: string; nombre: string; tipo: string; municipio: string; estado: string; publicada_at: string | null }
interface Lead {
  id: string; nombre: string; contacto: string; presupuesto: string | null; plazo: Plazo; forma_pago: FormaPago
  mensaje: string | null; categoria: CategoriaLead; razones: string[]; created_at: string
}
interface MatchMotor { id: string; score: number; razones: string[]; estado: string; created_at: string }

const ORDEN: Record<CategoriaLead, number> = { serio: 0, calificado: 1, interesado: 2, curioso: 3 }
const ESTILO: Record<CategoriaLead, string> = {
  serio: 'border-gold-500/60 text-gold-400 bg-gold-500/10',
  calificado: 'border-[#4F46E5]/50 text-[#a5a1f5] bg-[#4F46E5]/10',
  interesado: 'border-[#D97706]/40 text-[#e8b568] bg-[#D97706]/10',
  curioso: 'border-white/15 text-slate',
}
const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const enlaceContacto = (c: string) => (c.includes('@') ? `mailto:${c}` : `https://wa.me/52${c.replace(/\D/g, '').slice(-10)}`)

export default function LeadsPage() {
  const router = useRouter()
  const rol = useRolUsuario()
  const id = useParams().id as string
  const [activo, setActivo] = useState<Activo | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [motor, setMotor] = useState<MatchMotor[]>([])
  const [certificada, setCertificada] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('activos').select('id, nombre, tipo, municipio, estado, publicada_at')
        .eq('id', id).or(filtroAccesoActivo(user.id)).single()
      if (!data) { router.push('/dashboard'); return }
      setActivo(data as Activo)
      const [{ data: l }, { data: m }, { data: c }] = await Promise.all([
        supabase.from('leads').select('id, nombre, contacto, presupuesto, plazo, forma_pago, mensaje, categoria, razones, created_at')
          .eq('activo_id', id).order('created_at', { ascending: false }),
        supabase.from('matches').select('id, score, razones, estado, created_at').eq('activo_id', id).order('created_at', { ascending: false }),
        supabase.from('certificaciones').select('id').eq('activo_id', id).eq('estado', 'certificada').limit(1).maybeSingle(),
      ])
      setLeads(((l as Lead[]) || []).sort((a, b) => ORDEN[a.categoria] - ORDEN[b.categoria] || b.created_at.localeCompare(a.created_at)))
      setMotor((m as MatchMotor[]) || [])
      setCertificada(!!c)
      setLoading(false)
    }
    init()
  }, [id, router])

  if (loading || !activo) {
    return <div className="min-h-screen bg-navy-950 flex items-center justify-center"><p className="text-slate text-[14px] font-plex-mono">Cargando…</p></div>
  }

  const conteo = (c: CategoriaLead) => leads.filter(l => l.categoria === c).length

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }} />
      <div className="relative flex flex-col flex-1">
      <Topbar rol={rol ?? 'propietario'} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[860px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <button onClick={() => router.push(`/activo/${id}`)} className="flex items-center gap-1.5 text-[13px] text-slate hover:text-paper mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {activo.nombre}
            </button>
            <h1 className="font-fraunces text-[24px] md:text-[28px] font-medium text-paper">Leads</h1>
            <p className="text-[14px] text-slate mt-1">Fase 03 · interesados calificados por reglas explicables</p>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { fase: '01', label: 'Diagnóstico', href: `/activo/${id}` },
              { fase: '02', label: 'Marketing', href: `/activo/${id}/marketing` },
              { fase: '03', label: 'Leads', href: null },
            ].map(f => (
              <button key={f.fase} onClick={() => f.href && router.push(f.href)} disabled={!f.href}
                className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 border text-left transition-all ${!f.href ? 'bg-gold-500 border-gold-500 text-navy-950' : 'bg-navy-800 border-white/10 text-paper hover:border-gold-500/50'}`}>
                <span className={`font-plex-mono text-[10px] font-medium px-1.5 py-0.5 shrink-0 ${!f.href ? 'bg-navy-950/20 text-navy-950' : 'bg-white/5 text-slate'}`}>{f.fase}</span>
                <span className="text-[12px] md:text-[13px] font-medium truncate">{f.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['serio', 'calificado', 'interesado', 'curioso'] as CategoriaLead[]).map(c => (
              <div key={c} className="bg-navy-800 border border-white/10 p-4">
                <span className={`font-plex-mono text-[10px] uppercase tracking-wide px-2 py-0.5 border ${ESTILO[c]}`}>{ETIQUETA_CATEGORIA[c]}</span>
                <p className="font-fraunces text-[26px] text-paper mt-2">{conteo(c)}</p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-3">Interesados de la página pública</h2>
            {leads.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 p-6">
                <p className="text-[13px] text-slate">
                  {activo.publicada_at
                    ? 'Todavía nadie presiona «Me interesa». Comparte el enlace de la página pública desde Marketing.'
                    : 'La propiedad aún no tiene página pública. Publícala desde Marketing para empezar a recibir interesados.'}
                </p>
                <button onClick={() => router.push(`/activo/${id}/marketing`)} className="font-plex-mono text-[11px] text-gold-400 underline underline-offset-2 mt-2">Ir a Marketing</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {leads.map(l => (
                  <div key={l.id} className="bg-navy-800 border border-white/10 p-4 md:p-5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[15px] font-medium text-paper">{l.nombre}</p>
                        <a href={enlaceContacto(l.contacto)} target="_blank" rel="noopener noreferrer" className="text-[13px] text-gold-400 hover:text-gold-100">{l.contacto}</a>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate">{fecha(l.created_at)}</span>
                        <span className={`font-plex-mono text-[10.5px] uppercase tracking-wide px-2 py-1 border ${ESTILO[l.categoria]}`}>{ETIQUETA_CATEGORIA[l.categoria]}</span>
                      </div>
                    </div>
                    <p className="text-[12.5px] text-paper-dim">
                      {l.presupuesto ?? 'Sin presupuesto'} · {PLAZOS[l.plazo]} · {FORMAS_PAGO[l.forma_pago]}
                    </p>
                    <p className="text-[12px] text-slate">Por qué: {l.razones.join(' · ')}</p>
                    {l.mensaje && <p className="text-[13px] text-paper-dim border-l-2 border-white/15 pl-3">{l.mensaje}</p>}
                    {l.categoria === 'serio' && (
                      <p className="text-[12px] text-gold-400">
                        {certificada
                          ? <>Atiéndelo primero y envíale el <button onClick={() => router.push(`/activo/${id}/reporte`)} className="underline underline-offset-2">Reporte de Transparencia</button> (descárgalo en PDF).</>
                          : 'Atiéndelo primero. Con la certificación legal podrías enviarle el Reporte de Transparencia.'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {motor.length > 0 && (
            <div>
              <h2 className="font-plex-mono text-[11px] font-medium text-slate tracking-[0.12em] uppercase mb-3">Compradores del motor de matching</h2>
              <div className="flex flex-col gap-2">
                {motor.map(m => (
                  <div key={m.id} className="bg-navy-800 border border-white/10 p-4 flex items-center justify-between gap-3">
                    <p className="text-[12.5px] text-paper-dim">{(m.razones || []).join(' · ')}</p>
                    <span className="font-fraunces text-[18px] text-gold-400 shrink-0">{m.score}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] text-slate mt-2">Las conexiones del motor las valida Operación MindBridge; el detalle está en Matches de tu portal.</p>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  )
}
