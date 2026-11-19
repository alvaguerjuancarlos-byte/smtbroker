'use client'

// "Lo que encontró la búsqueda" (guion v12, momento 3; JC, 19-nov-2026): para cada búsqueda de un
// cliente, TODO lo que SMT Match revisó (propiedades de la plataforma, anuncios de portales y
// comparables de precio), de qué fuente vino y si pasó o por qué no. Es una herramienta interna: el
// cliente solo ve el resumen en su tablero. Datos: app/api/operacion/busquedas.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ItemRegistro, ResumenRegistro, Resultado } from '@/lib/registroBusqueda'

interface Busqueda { id: string; fecha: string; cliente: string; busca: string; zonas: string[]; resumen: ResumenRegistro; items?: ItemRegistro[] }
type Filtro = 'todo' | Resultado

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pesos = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n))
const REVISION = { plataforma: 'Plataforma', portal: 'Portal', comparable: 'Comparable de precio' } as const
const RESULTADO: Record<Resultado, { texto: string; color: string }> = {
  mostrada: { texto: 'La ve el cliente', color: 'var(--c-verde)' },
  referencia: { texto: 'Usado para el precio', color: 'var(--c-acento)' },
  descartada: { texto: 'Descartada', color: 'var(--c-tenue, #8a93a3)' },
}

export default function BusquedasOperacion() {
  const [lista, setLista] = useState<Busqueda[] | null>(null)
  const [sinTabla, setSinTabla] = useState(false)
  const [abierta, setAbierta] = useState<Busqueda | null>(null)
  const [cargando, setCargando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todo')

  const cargar = useCallback(async () => {
    const r = await fetch('/api/operacion/busquedas', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setSinTabla(!!j.sinTabla)
    setLista(r.ok ? (j.busquedas as Busqueda[]) : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const abrir = async (b: Busqueda) => {
    if (abierta?.id === b.id) { setAbierta(null); return }
    setCargando(b.id)
    const r = await fetch(`/api/operacion/busquedas?id=${b.id}`, { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setCargando(null); setFiltro('todo')
    setAbierta((j.busquedas as Busqueda[] | undefined)?.[0] ?? null)
  }

  if (!lista) return null
  const items = abierta?.items ?? []
  const visibles = items.filter((i) => filtro === 'todo' || i.resultado === filtro)
  const porFuente = [...items.reduce((m, i) => m.set(i.fuente, (m.get(i.fuente) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-tarjeta border border-linea p-5 md:p-6 flex flex-col gap-3 rounded-xl" data-busquedas-operacion>
      <div>
        <h2 className="font-display text-[19px] font-medium text-tinta">Lo que encontró la búsqueda</h2>
        <p className="text-[15px] text-tenue mt-1">Todo lo que SMT Match revisó para cada búsqueda de un cliente: de qué fuente vino y si pasó o por qué no. El cliente solo ve el resumen.</p>
      </div>
      {sinTabla && <p className="text-[16px] text-error">Falta crear la tabla en Supabase (migración 20261119000000_registro_busqueda.sql).</p>}
      {!sinTabla && lista.length === 0 && <p className="text-[16px] text-tinta-2">Todavía no hay búsquedas registradas. Se registran al guardar una búsqueda nueva.</p>}
      {lista.map((b) => (
        <div key={b.id} className="border-t border-linea pt-3 flex flex-col gap-2">
          <button onClick={() => abrir(b)} className="text-left flex flex-col gap-0.5" data-busqueda={b.id}>
            <span className="text-[17px] text-tinta hover:underline">{b.cliente} · {b.busca}</span>
            <span className="text-[15px] text-tenue">
              {fecha(b.fecha)} · revisó {b.resumen.revisadas} en {b.resumen.fuentes} fuentes · <b className="font-medium text-tinta-2">{b.resumen.cumplen} cumplen</b>
              {cargando === b.id ? ' · cargando…' : abierta?.id === b.id ? ' · ocultar ▴' : ' · ver todo ▾'}
            </span>
          </button>

          {abierta?.id === b.id && (
            <div className="flex flex-col gap-3" data-registro-detalle>
              <p className="text-[15px] text-tinta-2">Fuentes: {porFuente.map(([f, n]) => `${f} (${n})`).join(' · ')}</p>
              <div className="flex flex-wrap gap-1.5">
                {([['todo', `Todo (${items.length})`], ['mostrada', `La ve el cliente (${items.filter((i) => i.resultado === 'mostrada').length})`],
                  ['referencia', `Usado para el precio (${items.filter((i) => i.resultado === 'referencia').length})`],
                  ['descartada', `Descartado (${items.filter((i) => i.resultado === 'descartada').length})`]] as [Filtro, string][]).map(([id, t]) => (
                  <button key={id} onClick={() => setFiltro(id)} data-filtro={id}
                    className={`text-[14px] px-3 py-1.5 rounded-lg border ${filtro === id ? 'border-gold-500 text-tinta' : 'border-linea text-tinta-2'}`}>{t}</button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr className="text-left text-tenue border-b border-linea">
                      <th className="py-2 pr-3 font-medium">Resultado</th><th className="py-2 pr-3 font-medium">Fuente</th><th className="py-2 pr-3 font-medium">Qué es</th>
                      <th className="py-2 pr-3 font-medium">Propiedad o anuncio</th><th className="py-2 pr-3 font-medium text-right">Precio</th>
                      <th className="py-2 pr-3 font-medium text-right">m²</th><th className="py-2 font-medium">Por qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((i, k) => (
                      <tr key={k} className="border-b border-linea align-top" data-item={i.resultado}>
                        <td className="py-2 pr-3 whitespace-nowrap" style={{ color: RESULTADO[i.resultado].color }}>{RESULTADO[i.resultado].texto}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-tinta">{i.fuente}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-tinta-2">{REVISION[i.revision]}{i.zona != null && abierta.zonas[i.zona] ? ` · ${abierta.zonas[i.zona]}` : ''}</td>
                        <td className="py-2 pr-3 text-tinta">{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.titulo}</a> : i.titulo}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{pesos(i.precio)}</td>
                        <td className="py-2 pr-3 text-right">{i.m2 ?? '—'}</td>
                        <td className="py-2 text-tinta-2">{i.razon ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
