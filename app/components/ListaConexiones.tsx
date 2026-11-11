'use client'

// Lista de conexiones del usuario (Documento Maestro V8, Parte 3): el comprador ve a quién pidió ver
// propiedades; quien ofrece (broker o dueño), a los compradores que quieren ver las suyas. Resalta lo
// que le toca hacer (confirmar una visita, contar cómo le fue, confirmar un cierre). Cada fila abre
// /conexion/[id]. Datos: app/api/conexiones (GET).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { millones } from '@/lib/necesidad'

interface Fila {
  id: string; rol: string | null; fase: string; textoFase: string; pendiente: string | null; actualizado_at: string
  activo: { nombre: string; municipio: string; precio_total: number | null } | null; otraParte?: string
}

export default function ListaConexiones({ titulo, vacio, acento = '#7fd1b9', ocultarVacia = false }: {
  titulo: string; vacio: string; acento?: string; ocultarVacia?: boolean
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const cargar = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const r = await fetch('/api/conexiones', { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json().catch(() => ({}))
    setFilas(r.ok ? (j.conexiones as Fila[]) : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  if (!filas || (ocultarVacia && filas.length === 0)) return null
  return (
    <div className="bg-navy-800 border border-white/10 p-4 md:p-5 flex flex-col gap-2.5">
      <span className="font-plex-mono text-[11px] tracking-[0.08em] uppercase text-slate">{titulo} · {filas.length}</span>
      {filas.length === 0 ? <p className="text-[13.5px] text-paper-dim">{vacio}</p> : filas.map((f) => (
        <a key={f.id} href={`/conexion/${f.id}`} className="border-t border-white/10 pt-2.5 flex flex-col gap-0.5 hover:opacity-90">
          <span className="text-[14px]">{f.activo?.nombre ?? 'Propiedad'}{f.otraParte ? <span className="text-slate"> · {f.otraParte}</span> : null}</span>
          <span className="text-[12px] text-slate">{[f.activo?.precio_total ? millones(f.activo.precio_total) : null, f.activo?.municipio, f.textoFase].filter(Boolean).join(' · ')}</span>
          {f.pendiente && <span className="font-plex-mono text-[11.5px]" style={{ color: acento }}>→ {f.pendiente}</span>}
        </a>
      ))}
    </div>
  )
}
