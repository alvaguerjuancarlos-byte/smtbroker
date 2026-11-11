'use client'

// Conexiones en la consola de Operación (Documento Maestro V8, Parte 3, §21.2 y §21.7):
//   - por validar: las de particulares y las de la red que no cumplen toda la ficha (las propuestas
//     por un broker verificado se validan solas);
//   - alertas: el comprador dice que ya compró y nadie reportó el cierre.
// Validar o rechazar aquí mismo; el detalle (con el registro de qué aportó la plataforma) se abre en
// /conexion/[id]. Datos: app/api/conexiones?vista=operacion.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Fila {
  id: string; textoFase: string; fase: string; activo: { nombre: string; municipio: string } | null
  comprador?: string; contraparte?: string; origen?: string; alerta?: string | null
}

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

export default function ConexionesOperacion() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const r = await fetch('/api/conexiones?vista=operacion', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setFilas(r.ok ? (j.conexiones as Fila[]) : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const accion = async (id: string, accion: 'validar' | 'rechazar') => {
    setOcupado(id)
    await fetch(`/api/conexiones/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify({ accion }) })
    setOcupado(null)
    await cargar()
  }

  if (!filas) return null
  return (
    <div className="bg-navy-800 border border-white/10 p-5 md:p-6 flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-medium text-paper">Conexiones</h2>
        <p className="text-[12.5px] text-slate mt-1">Compradores que pidieron ver una propiedad. Las de brokers verificados que cumplen la ficha se validan solas; aquí quedan las demás y las alertas de seguimiento.</p>
      </div>
      {filas.length === 0 ? <p className="text-[13px] text-paper-dim">Nada por revisar.</p> : filas.map((f) => (
        <div key={f.id} className="border-t border-white/10 pt-3 flex flex-col gap-1.5">
          <a href={`/conexion/${f.id}`} className="text-[14px] text-paper hover:underline">{f.comprador} → {f.activo?.nombre ?? 'Propiedad'} <span className="text-slate">({f.contraparte})</span></a>
          <p className="text-[12px] text-slate">{f.activo?.municipio} · {f.origen === 'particular' ? 'De un particular' : f.origen === 'red' ? 'De la red, no cumple toda la ficha' : 'Propuesta de broker'} · {f.textoFase}</p>
          {f.alerta && <p className="text-[12.5px] text-[#f3a3a3]">⚠ {f.alerta}</p>}
          {f.fase === 'por_validar' && (
            <div className="flex gap-2">
              <button onClick={() => accion(f.id, 'validar')} disabled={!!ocupado} className="font-plex-mono text-[11px] px-3 py-1.5 bg-gold-500 text-navy-950 disabled:opacity-50">Validar</button>
              <button onClick={() => accion(f.id, 'rechazar')} disabled={!!ocupado} className="font-plex-mono text-[11px] px-3 py-1.5 border border-white/15 text-paper-dim disabled:opacity-50">Rechazar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
