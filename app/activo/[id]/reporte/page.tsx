'use client'

// Reporte de Transparencia (Documento Maestro V6.3, §13): el entregable de la certificación legal.
// Página pensada para imprimir o guardar como PDF desde el navegador (sin dependencias): fondo
// claro, sin barra superior al imprimir. Lee lo que ya está guardado -- diagnóstico de mercado,
// diagnóstico rápido y el dictamen legal -- y nunca vuelve a correr un agente.
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { filtroAccesoActivo } from '@/lib/accesoActivo'
import type { DiagnosticoRapidoData } from '../../../components/DiagnosticoRapido'
import type { TriageLegalReal } from '../../../components/DiagnosticoLegal'

interface Activo {
  id: string; nombre: string; tipo: string; direccion: string | null; colonia: string | null
  municipio: string; estado: string; superficie: number | null; superficie_construccion_m2: number | null
  precio_total: number | null; folio_real: string | null; clave_catastral: string | null
}
interface Mercado {
  comparablesAnalizados: number; precioPromedioM2Zona: number | null; rangoMinMXN: number | null; rangoMaxMXN: number | null
  precioSalidaRecomendadoMXN: number | null; plusvalia3AniosTexto: string; absorcionTexto: string; interpretacion: string
}

const mxn = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n) : '—'

async function post<T>(url: string, token: string, body: object): Promise<T | null> {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body),
  }).then(res => res.json()).catch(() => null)
  return r && !r.error ? (r as T) : null
}

export default function ReportePage() {
  const router = useRouter()
  const id = useParams().id as string
  const [activo, setActivo] = useState<Activo | null>(null)
  const [rapido, setRapido] = useState<DiagnosticoRapidoData | null>(null)
  const [mercado, setMercado] = useState<Mercado | null>(null)
  const [legal, setLegal] = useState<TriageLegalReal | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data } = await supabase.from('activos').select('*').eq('id', id).or(filtroAccesoActivo(session.user.id)).single()
      if (!data) { router.push('/dashboard'); return }
      setActivo(data as Activo)
      const t = session.access_token
      const [r, m, l] = await Promise.all([
        post<DiagnosticoRapidoData>('/api/diagnostico-rapido', t, { activoId: id }),
        post<Mercado>('/api/agentes/mercado', t, { activoId: id }),
        post<TriageLegalReal>('/api/agentes/legal', t, { activoId: id }),
      ])
      setRapido(r); setMercado(m); setLegal(l)
      setCargando(false)
    }
    init()
  }, [id, router])

  if (cargando || !activo) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-[14px] text-gray-500">Preparando reporte…</div>
  }

  const certificada = rapido?.certificacion?.estado === 'certificada'
  const fecha = rapido?.certificacion?.actualizado_at

  return (
    <div className="min-h-screen bg-white text-gray-900 font-plex-sans print:min-h-0">
      <div className="max-w-[780px] mx-auto px-6 py-8 print:py-0">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <button onClick={() => router.push(`/activo/${id}`)} className="text-[13px] text-gray-500 hover:text-gray-900">← Volver al activo</button>
          <button onClick={() => window.print()} className="bg-gray-900 text-white px-4 py-2 text-[13px] font-plex-mono">Imprimir / Guardar PDF</button>
        </div>

        <header className="border-b-2 border-gray-900 pb-4 mb-6">
          <p className="font-plex-mono text-[11px] uppercase tracking-[0.12em] text-gray-500">SMTBROKER · Reporte de Transparencia</p>
          <h1 className="font-fraunces text-[28px] font-medium mt-1">{activo.nombre}</h1>
          <p className="text-[14px] text-gray-600">{[activo.direccion, activo.colonia, activo.municipio, activo.estado].filter(Boolean).join(', ')}</p>
          <p className={`mt-3 inline-block font-plex-mono text-[12px] px-3 py-1 border ${certificada ? 'border-amber-600 text-amber-700' : 'border-gray-400 text-gray-600'}`}>
            {certificada ? `★ Inventario certificado${fecha ? ` · ${new Date(fecha).toLocaleDateString('es-MX')}` : ''}` : 'Sin certificación legal: solo diagnóstico rápido'}
          </p>
        </header>

        <section className="mb-6">
          <h2 className="font-plex-mono text-[11px] uppercase tracking-[0.12em] text-gray-500 mb-2">Datos del inmueble</h2>
          <table className="w-full text-[13px]"><tbody>
            {[
              ['Tipo', activo.tipo],
              ['Superficie', activo.superficie ? `${activo.superficie} m² terreno${activo.superficie_construccion_m2 ? ` · ${activo.superficie_construccion_m2} m² construcción` : ''}` : '—'],
              ['Precio de lista', mxn(activo.precio_total)],
              ['Folio real', activo.folio_real || '—'],
              ['Clave catastral', activo.clave_catastral || '—'],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-gray-200"><td className="py-1.5 text-gray-500 w-[40%]">{k}</td><td className="py-1.5">{v}</td></tr>
            ))}
          </tbody></table>
        </section>

        {mercado && (
          <section className="mb-6">
            <h2 className="font-plex-mono text-[11px] uppercase tracking-[0.12em] text-gray-500 mb-2">Mercado</h2>
            <table className="w-full text-[13px] mb-2"><tbody>
              {[
                ['Precio de salida recomendado', mxn(mercado.precioSalidaRecomendadoMXN)],
                ['Rango de comparables', mercado.rangoMinMXN && mercado.rangoMaxMXN ? `${mxn(mercado.rangoMinMXN)} – ${mxn(mercado.rangoMaxMXN)}` : 'Sin suficientes comparables'],
                ['Comparables reales analizados', String(mercado.comparablesAnalizados)],
                ['Precio promedio de la zona', mercado.precioPromedioM2Zona ? `${mxn(mercado.precioPromedioM2Zona)}/m²` : 'Sin dato'],
                ['Plusvalía 3 años (SHF)', mercado.plusvalia3AniosTexto],
                ['Absorción (SNIIV)', mercado.absorcionTexto],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-gray-200"><td className="py-1.5 text-gray-500 w-[40%]">{k}</td><td className="py-1.5">{v}</td></tr>
              ))}
            </tbody></table>
            <p className="text-[13px] text-gray-700">{mercado.interpretacion}</p>
          </section>
        )}

        {certificada && legal ? (
          <section className="mb-6">
            <h2 className="font-plex-mono text-[11px] uppercase tracking-[0.12em] text-gray-500 mb-2">Dictamen legal</h2>
            <p className="text-[15px] font-medium">{legal.verdictTitle} <span className="font-plex-mono text-[12px] text-gray-500">· score {legal.score}/10</span></p>
            <p className="text-[13px] text-gray-700 mb-3">{legal.verdictDesc}</p>
            {([['Uso de suelo', legal.usoSuelo], ['Titularidad y gravámenes (RPP)', legal.rpp], ['Restricciones ambientales', legal.ambiental], ['Infraestructura federal (CFE)', legal.cfe]] as const).map(([t, c]) => (
              <div key={t} className="border-b border-gray-200 py-2">
                <p className="text-[13px]"><b>{t}</b> · <span className="font-plex-mono text-[11px] uppercase">{c.status}</span></p>
                <p className="text-[12.5px] text-gray-700">{c.desc}</p>
                <p className="text-[11px] text-gray-500">Fuente: {c.fuente}</p>
              </div>
            ))}
          </section>
        ) : (
          rapido && (
            <section className="mb-6">
              <h2 className="font-plex-mono text-[11px] uppercase tracking-[0.12em] text-gray-500 mb-2">Expediente</h2>
              {rapido.faltantes.length
                ? <p className="text-[13px] text-gray-700">Documentos pendientes para certificar: {rapido.faltantes.map(f => f.documento).join(', ')}.</p>
                : <p className="text-[13px] text-gray-700">Expediente completo; certificación legal no solicitada o en proceso.</p>}
            </section>
          )
        )}

        <footer className="border-t border-gray-300 pt-3 text-[11px] text-gray-500 leading-relaxed">
          No existe una API pública del Registro Público de la Propiedad de Nuevo León: el dictamen de titularidad se basa en la
          documentación aportada y no sustituye la revisión notarial. Datos de mercado con comparables públicos de portales, Índice SHF y
          SNIIV. Generado por SMTBROKER (MindBridge) el {new Date().toLocaleDateString('es-MX')}.
        </footer>
      </div>
    </div>
  )
}
