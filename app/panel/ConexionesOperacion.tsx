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
    <div className="bg-tarjeta border border-linea p-5 md:p-6 flex flex-col gap-3 rounded-xl">
      <div>
        <h2 className="font-display text-[19px] font-medium text-tinta">Conexiones</h2>
        <p className="text-[15px] text-tenue mt-1">Compradores que pidieron ver una propiedad. Las de brokers verificados que cumplen la ficha se validan solas; aquí quedan las demás y las alertas de seguimiento.</p>
      </div>
      {filas.length === 0 ? <p className="text-[16px] text-tinta-2">Nada por revisar.</p> : filas.map((f) => (
        <div key={f.id} className="border-t border-linea pt-3 flex flex-col gap-1.5">
          <a href={`/conexion/${f.id}`} className="text-[17px] text-tinta hover:underline">{f.comprador} → {f.activo?.nombre ?? 'Propiedad'} <span className="text-tenue">({f.contraparte})</span></a>
          <p className="text-[15px] text-tenue">{f.activo?.municipio} · {f.origen === 'particular' ? 'De un particular' : f.origen === 'red' ? 'De la red, no cumple toda la ficha' : 'Propuesta de broker'} · {f.textoFase}</p>
          {f.alerta && <p className="text-[15px] text-error">⚠ {f.alerta}</p>}
          {f.fase === 'por_validar' && (
            <div className="flex gap-2">
              <button onClick={() => accion(f.id, 'validar')} disabled={!!ocupado} className="font-sans text-[14px] px-3 py-1.5 bg-gold-500 text-navy-950 disabled:opacity-50 rounded-lg">Validar</button>
              <button onClick={() => accion(f.id, 'rechazar')} disabled={!!ocupado} className="font-sans text-[14px] px-3 py-1.5 border border-linea text-tinta-2 disabled:opacity-50 rounded-lg">Rechazar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
