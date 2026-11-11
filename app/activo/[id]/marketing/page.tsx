'use client'

// Marketing nivel 1 (Documento Maestro V6.3, §14.1; paso 6 del plan, 2026-10-07). Antes esta
// pantalla era 100 % simulada (vistas, canales, campañas). Ahora es real y nace del diagnóstico:
//   1. Ficha de venta con IA (app/api/agentes/ficha), a partir del diagnóstico guardado.
//   2. Fotos (Supabase Storage, bucket fotos-activos, máx. 8).
//   3. Página pública /p/[id] con "Me interesa": publicar, copiar enlace, compartir por WhatsApp.
//      La difusión la hace el broker con sus canales; SMTBROKER no publica en portales.
//   4. Métricas reales: visitas a la página pública y personas que presionaron "Me interesa".
// Lo que todavía es visión (portales, campañas pagadas, agente 24/7) queda al final como
// "Próximamente", marcado con EjemploBadge.
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { filtroAccesoActivo } from '@/lib/accesoActivo'
import { useRolUsuario } from '@/lib/useRolUsuario'
import { BUCKET_FOTOS, MAX_FOTOS } from '@/lib/fichaPublica'
import Topbar from '../../../components/Topbar'
import { EjemploBadge } from '../../../components/EjemploBadge'

interface Activo {
  id: string; nombre: string; tipo: string; municipio: string; estado: string
  precio_total: number | null; publicada_at: string | null
}
interface Ficha {
  titular: string; narrativa: string; puntosFuertes: string[]; precioSugeridoMXN: number | null
  argumentosComprador: string[]; mensajeWhatsApp: string
  notasBroker?: string[] // solo para el broker; la página pública nunca las muestra
}
interface Foto { nombre: string; url: string }

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const boton = 'font-sans text-[15px] px-4 py-2.5 border transition-colors disabled:opacity-50 rounded-lg'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function Seccion({ titulo, children, derecha }: { titulo: string; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="font-sans text-[14px] font-medium text-tenue">{titulo}</h2>
        {derecha}
      </div>
      {children}
    </div>
  )
}

export default function MarketingPage() {
  const router = useRouter()
  const rol = useRolUsuario()
  const id = useParams().id as string

  const [activo, setActivo] = useState<Activo | null>(null)
  const [loading, setLoading] = useState(true)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [fichaEstado, setFichaEstado] = useState<'cargando' | 'generando' | 'lista' | 'vacia'>('cargando')
  const [fichaError, setFichaError] = useState('')
  const [fotos, setFotos] = useState<Foto[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [fotoError, setFotoError] = useState('')
  const [visitas, setVisitas] = useState<string[]>([])
  const [leads, setLeads] = useState(0)
  const [copiado, setCopiado] = useState(false)

  const llamarFicha = useCallback(async (regenerar: boolean) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch('/api/agentes/ficha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
      body: JSON.stringify({ activoId: id, regenerar }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
  }, [id])

  const cargarFotos = useCallback(async () => {
    const { data } = await supabase.storage.from(BUCKET_FOTOS).list(id, { limit: MAX_FOTOS, sortBy: { column: 'created_at', order: 'asc' } })
    setFotos((data || []).filter(f => f.name && !f.name.startsWith('.'))
      .map(f => ({ nombre: f.name, url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(`${id}/${f.name}`).data.publicUrl })))
  }, [id])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('activos')
        .select('id, nombre, tipo, municipio, estado, precio_total, publicada_at')
        .eq('id', id).or(filtroAccesoActivo(user.id)).single()
      if (!data) { router.push('/dashboard'); return }
      setActivo(data as Activo)
      setLoading(false)

      // Solo lee la ficha guardada: generarla (Claude) es una acción explícita del usuario.
      const { data: guardada } = await supabase.from('diagnosticos').select('resultado')
        .eq('activo_id', id).eq('agente', 'ficha').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (guardada) { setFicha(guardada.resultado as Ficha); setFichaEstado('lista') } else setFichaEstado('vacia')

      const hace7 = new Date(Date.now() - 7 * 86400_000).toISOString()
      const [{ data: v }, { count }] = await Promise.all([
        supabase.from('visitas_publicas').select('created_at').eq('activo_id', id).gte('created_at', hace7),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('activo_id', id),
        cargarFotos(),
      ])
      setVisitas(((v as { created_at: string }[]) || []).map(x => x.created_at))
      setLeads(count ?? 0)
    }
    init()
  }, [id, router, cargarFotos])

  const generarFicha = async () => {
    setFichaEstado('generando'); setFichaError('')
    const r = await llamarFicha(true)
    if (r.error) { setFichaError(r.error); setFichaEstado(ficha ? 'lista' : 'vacia'); return }
    setFicha(r as Ficha); setFichaEstado('lista')
  }

  const subirFotos = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setFotoError('')
    const espacio = MAX_FOTOS - fotos.length
    if (espacio <= 0) { setFotoError(`Máximo ${MAX_FOTOS} fotos`); return }
    setSubiendo(true)
    for (const archivo of Array.from(archivos).slice(0, espacio)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) { setFotoError('Solo fotos JPG, PNG o WebP'); continue }
      if (archivo.size > 5 * 1024 * 1024) { setFotoError('Cada foto debe pesar menos de 5 MB'); continue }
      const ext = archivo.type.split('/')[1].replace('jpeg', 'jpg')
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(`${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, archivo)
      if (error) setFotoError('No se pudo subir una foto. Intenta de nuevo.')
    }
    setSubiendo(false)
    await cargarFotos()
  }

  const borrarFoto = async (nombre: string) => {
    await supabase.storage.from(BUCKET_FOTOS).remove([`${id}/${nombre}`])
    await cargarFotos()
  }

  const cambiarPublicacion = async (publicar: boolean) => {
    const publicada_at = publicar ? new Date().toISOString() : null
    const { error } = await supabase.from('activos').update({ publicada_at }).eq('id', id)
    if (!error) setActivo(a => (a ? { ...a, publicada_at } : a))
  }

  if (loading || !activo) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center">
        <p className="text-tenue text-[17px] font-sans">Cargando…</p>
      </div>
    )
  }

  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/p/${id}` : `/p/${id}`
  const textoWhatsApp = `${ficha?.mensajeWhatsApp ?? `${activo.nombre} · ${activo.tipo} en ${activo.municipio}`}\n${enlace}`
  const hoy = new Date()
  const porDia = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy); d.setDate(hoy.getDate() - (6 - i))
    const clave = d.toDateString()
    return { dia: DIAS[d.getDay()], n: visitas.filter(v => new Date(v).toDateString() === clave).length }
  })
  const maxDia = Math.max(1, ...porDia.map(d => d.n))

  return (
    <div className="min-h-screen bg-fondo text-tinta font-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(var(--c-rejilla) 1px, transparent 1px), linear-gradient(90deg, var(--c-rejilla) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }} />
      <div className="relative flex flex-col flex-1">
      <Topbar rol={rol ?? 'propietario'} />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[860px] mx-auto flex flex-col gap-6 md:gap-8">

          <div>
            <button onClick={() => router.push(`/activo/${id}`)} className="flex items-center gap-1.5 text-[16px] text-tenue hover:text-tinta mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {activo.nombre}
            </button>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="font-display text-[28px] md:text-[32px] font-medium text-tinta">Marketing</h1>
                <p className="text-[17px] text-tenue mt-1">Fase 02 · {activo.tipo} en {activo.municipio}, {activo.estado}</p>
              </div>
              <span className={`font-sans text-[13px] px-3 py-1.5 border self-start shrink-0 ${activo.publicada_at ? 'border-gold-500/40 text-acento bg-gold-500/10' : 'border-linea text-tenue'} rounded-lg`}>
                {activo.publicada_at ? 'Página pública activa' : 'Sin publicar'}
              </span>
            </div>
          </div>

          {/* Navegación de fases */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { fase: '01', label: 'Diagnóstico', href: `/activo/${id}`,       active: false },
              { fase: '02', label: 'Marketing',   href: null,                  active: true  },
              { fase: '03', label: 'Leads',       href: `/activo/${id}/leads`, active: false },
            ].map(f => (
              <button key={f.fase} onClick={() => f.href && router.push(f.href)} disabled={!f.href}
                className={`flex items-center gap-2 md:gap-3 p-3 md:p-4 border text-left transition-all ${f.active ? 'bg-gold-500 border-gold-500 text-navy-950' : 'bg-tarjeta border-linea text-tinta hover:border-gold-500/50'} rounded-xl`}>
                <span className={`font-sans text-[13px] font-medium px-1.5 py-0.5 shrink-0 ${f.active ? 'bg-fondo/20 text-navy-950' : 'bg-sutil text-tenue'}`}>{f.fase}</span>
                <span className="text-[15px] md:text-[16px] font-medium truncate">{f.label}</span>
              </button>
            ))}
          </div>

          {/* 1. Ficha de venta */}
          <Seccion titulo="Ficha de venta · Agente de Marketing" derecha={fichaEstado === 'lista' && (
            <button onClick={generarFicha} className="font-sans text-[14px] text-acento hover:text-acento-2 underline underline-offset-2">Volver a generar</button>
          )}>
            {fichaEstado === 'cargando' ? null : fichaEstado === 'generando' ? (
              <div className="bg-tarjeta border border-linea p-5 flex items-center gap-3 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />
                <p className="text-[16px] text-tenue font-sans">Escribiendo la ficha a partir del diagnóstico…</p>
              </div>
            ) : ficha ? (
              <div className="bg-tarjeta border border-linea p-5 md:p-6 flex flex-col gap-4 rounded-xl">
                <h3 className="font-display text-[23px] font-medium text-tinta">{ficha.titular}</h3>
                {ficha.narrativa.split(/\n+/).map((p, i) => <p key={i} className="text-[17px] text-tinta-2 leading-relaxed">{p}</p>)}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-sans text-[13px] text-acento mb-2">Puntos fuertes</p>
                    <ul className="flex flex-col gap-1.5">{ficha.puntosFuertes.map(p => <li key={p} className="text-[16px] text-tinta flex gap-2"><span className="text-acento">✓</span>{p}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-sans text-[13px] text-acento mb-2">Argumentos para el comprador</p>
                    <ul className="flex flex-col gap-1.5">{ficha.argumentosComprador.map(p => <li key={p} className="text-[16px] text-tinta-2 flex gap-2"><span className="text-acento">→</span>{p}</li>)}</ul>
                  </div>
                </div>
                {ficha.precioSugeridoMXN && <p className="text-[16px] text-tinta-2">Precio sugerido por el diagnóstico: <b className="text-tinta">{mxn(ficha.precioSugeridoMXN)}</b></p>}
                {!!ficha.notasBroker?.length && (
                  <div className="border border-dashed border-[#D97706]/40 bg-[#D97706]/[0.06] p-4">
                    <p className="font-sans text-[13px] text-aviso mb-2">Notas para ti · no se publican</p>
                    <ul className="flex flex-col gap-1.5">{ficha.notasBroker.map(n => <li key={n} className="text-[16px] text-tinta-2 flex gap-2"><span className="text-aviso">!</span>{n}</li>)}</ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-superficie border border-gold-500/20 p-5 md:p-6 rounded-xl">
                <p className="text-[17px] text-tinta-2">La ficha de venta se escribe con inteligencia artificial a partir del diagnóstico de la propiedad: titular, narrativa, puntos fuertes y argumentos para el comprador, sin inventar datos.</p>
                <button onClick={generarFicha} className={`${boton} mt-3 bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg`}>Generar ficha de venta</button>
              </div>
            )}
            {fichaError && <p className="text-[15px] text-error mt-2">{fichaError}</p>}
          </Seccion>

          {/* 2. Fotos */}
          <Seccion titulo={`Fotos · ${fotos.length} de ${MAX_FOTOS}`}>
            <div className="bg-tarjeta border border-linea p-4 md:p-5 rounded-xl">
              {fotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {fotos.map(f => (
                    <div key={f.nombre} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element -- fotos de Supabase Storage */}
                      <img src={f.url} alt="" className="w-full h-[110px] object-cover border border-linea" />
                      <button onClick={() => borrarFoto(f.nombre)}
                        className="absolute top-1 right-1 bg-fondo/80 text-[14px] text-tinta px-2 py-0.5 opacity-80 hover:opacity-100">Quitar</button>
                    </div>
                  ))}
                </div>
              )}
              {fotos.length < MAX_FOTOS && (
                <label className={`${boton} inline-block cursor-pointer border-gold-500/40 text-acento hover:border-gold-500`}>
                  {subiendo ? 'Subiendo…' : 'Agregar fotos'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={subiendo}
                    onChange={e => { subirFotos(e.target.files); e.target.value = '' }} />
                </label>
              )}
              <p className="text-[14px] text-tenue mt-2">JPG, PNG o WebP, hasta 5 MB cada una. La primera es la portada de la página pública.</p>
              {fotoError && <p className="text-[15px] text-error mt-1">{fotoError}</p>}
            </div>
          </Seccion>

          {/* 3. Página pública */}
          <Seccion titulo="Página pública con «Me interesa»">
            <div className="bg-tarjeta border border-linea p-4 md:p-5 flex flex-col gap-3 rounded-xl">
              {activo.publicada_at ? (
                <>
                  <p className="text-[16px] text-tinta-2">Comparte este enlace en tus canales (WhatsApp, EasyBroker, redes). Quien presione «Me interesa» llega a tu pestaña de Leads, ya calificado.</p>
                  <div className="flex items-center gap-2 bg-fondo/60 border border-linea px-3 py-2 rounded-lg">
                    <span className="font-sans text-[15px] text-tinta truncate flex-1">{enlace}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
                      className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg`}>{copiado ? '¡Copiado!' : 'Copiar enlace'}</button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`} target="_blank" rel="noopener noreferrer"
                      className={`${boton} border-[#3fbe72]/50 text-exito hover:border-[#3fbe72]`}>Compartir por WhatsApp</a>
                    <a href={`/p/${id}`} target="_blank" rel="noopener noreferrer" className={`${boton} border-linea text-tinta hover:border-gold-500/50`}>Ver página</a>
                    <button onClick={() => cambiarPublicacion(false)} className={`${boton} border-linea text-tenue hover:text-tinta`}>Dejar de publicar</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[16px] text-tinta-2">
                    Publica una página de la propiedad con sus fotos, la ficha de venta y el botón «Me interesa». No muestra la dirección exacta, ni datos legales, ni quién es el dueño.
                    {!ficha && ' Te conviene generar primero la ficha de venta.'}
                  </p>
                  <button onClick={() => cambiarPublicacion(true)} className={`${boton} self-start bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg`}>Publicar página</button>
                </>
              )}
            </div>
          </Seccion>

          {/* 4. Métricas reales */}
          <Seccion titulo="Métricas reales · últimos 7 días">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-tarjeta border border-linea p-5 rounded-xl">
                <p className="text-[14px] text-tenue mb-2">Visitas a la página</p>
                <p className="font-display text-[32px] text-tinta">{visitas.length}</p>
              </div>
              <div className="bg-tarjeta border border-linea p-5 rounded-xl">
                <p className="text-[14px] text-tenue mb-2">«Me interesa» (total)</p>
                <p className="font-display text-[32px] text-acento">{leads}</p>
              </div>
              <div className="bg-tarjeta border border-linea p-5 rounded-xl">
                <p className="text-[14px] text-tenue mb-2">Visitas por día</p>
                <div className="flex items-end gap-1.5 h-[52px]">
                  {porDia.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-gold-500/60" style={{ height: `${Math.max(2, (d.n / maxDia) * 40)}px` }} title={`${d.n} visitas`} />
                      <span className="text-[12px] text-tenue">{d.dia}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Seccion>

          {/* 5. Visión */}
          <Seccion titulo="Próximamente" derecha={<EjemploBadge />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 opacity-80">
              {[
                ['Distribución en portales', 'Publicar la ficha en los principales portales desde un solo lugar.'],
                ['Campañas pagadas', 'Anuncios segmentados por perfil de comprador, medidos canal por canal.'],
                ['Agente conversacional 24/7', 'Responde a los interesados, califica y agenda visitas.'],
              ].map(([t, d]) => (
                <div key={t} className="bg-tarjeta border border-dashed border-linea p-5 rounded-xl">
                  <p className="text-[17px] font-medium text-tinta mb-1">{t}</p>
                  <p className="text-[15px] text-tenue">{d}</p>
                </div>
              ))}
            </div>
          </Seccion>

          <div className="flex justify-end">
            <button onClick={() => router.push(`/activo/${id}/leads`)} className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg`}>Ir a Leads →</button>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
