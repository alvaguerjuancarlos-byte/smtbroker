'use client'

// Panel de necesidades del broker (Documento Maestro V8, Parte 1, §19.3): lo que buscan los
// compradores, ANÓNIMO (sin nombre ni contacto hasta que el comprador pida ver una propiedad).
// El broker propone propiedades de su cartera que cumplen la ficha; al proponer acepta los términos
// (§21.6). Las reglas (cumple la ficha, hasta 3 por necesidad) las revisa app/api/propuestas.
// De cada propuesta ve solo su precio contra mercado (V8 Parte 2, §20.5 regla 4), calculado al
// proponer: no sabe si el comprador se interesó.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { millones, MAX_PROPUESTAS_POR_BROKER } from '@/lib/necesidad'

interface NecesidadPanel {
  id: string; resumen: string; detalle: string[]; proposito: string | null; created_at: string
  enMiZona: boolean; propuestasTotal: number; misPropuestas: string[]; puedeProponer: boolean
  compatibles: { activoId: string; nombre: string; precio_total: number | null; superficie: number | null }[]
  detallePropuestas: { activoId: string; nombre: string; precioMercado: { estado: 'arriba' | 'en_linea' | 'abajo' | null; texto: string } | null }[]
}

const SEMAFORO = { arriba: ['Arriba del mercado', 'var(--c-rojo)'], en_linea: ['En línea con el mercado', 'var(--c-verde)'], abajo: ['Abajo del mercado', 'var(--c-oro)'] } as const

const hace = (fecha: string) => {
  const h = Math.floor((Date.now() - new Date(fecha).getTime()) / 3600_000)
  return h < 1 ? 'hace menos de 1 h' : h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

export default function PanelNecesidades() {
  const router = useRouter()
  const [lista, setLista] = useState<NecesidadPanel[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ id: string; texto: string; ok: boolean } | null>(null)
  const [soloZona, setSoloZona] = useState(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const cargar = useCallback(async () => {
    const r = await fetch('/api/necesidades', { headers: { Authorization: 'Bearer ' + await token() } })
    const j = await r.json().catch(() => ({}))
    setLista(r.ok ? (j.necesidades as NecesidadPanel[]) : [])
  }, [])
  useEffect(() => {
    const init = async () => { await cargar() }
    init()
  }, [cargar])

  const abrir = (id: string) => { setAbierta(abierta === id ? null : id); setElegida(null); setAcepto(false); setMensaje(null) }

  const proponer = async (necesidadId: string) => {
    if (!elegida || !acepto) return
    setEnviando(true); setMensaje(null)
    const r = await fetch('/api/propuestas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify({ necesidadId, activoId: elegida, aceptoTerminos: true }),
    })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setMensaje({ id: necesidadId, texto: j.error ?? 'No se pudo proponer', ok: false }); return }
    setMensaje({ id: necesidadId, texto: 'Propuesta enviada: el comprador ya la ve en su bandeja.', ok: true })
    setElegida(null); setAcepto(false)
    await cargar()
  }

  if (!lista) return <p className="text-[16px] text-tenue font-sans">Cargando necesidades…</p>
  const visibles = soloZona ? lista.filter((n) => n.enMiZona) : lista

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[16px] text-tinta-2 max-w-[560px]">
          Lo que buscan los compradores de la plataforma. Si tienes una propiedad que cumple, propónla: el comprador la ve en su bandeja con tu nombre y tu nivel. Ves al comprador cuando él pida ver tu propiedad.
        </p>
        <button onClick={() => setSoloZona(!soloZona)} className={`px-3 py-2 text-[15px] border ${soloZona ? 'border-gold-500 text-acento' : 'border-linea text-tinta-2'} rounded-lg`}>
          {soloZona ? '✓ ' : ''}Solo mi zona
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-tarjeta border border-linea p-6 text-center rounded-xl">
          <p className="text-[17px] text-tinta">No hay necesidades publicadas {soloZona ? 'en tu zona ' : ''}por ahora.</p>
          <p className="text-[15px] text-tenue mt-1">Te avisamos por correo cuando un comprador busque en los municipios donde tienes propiedades.</p>
        </div>
      ) : visibles.map((n) => (
        <div key={n.id} className={`bg-tarjeta border p-4 md:p-5 flex flex-col gap-2.5 ${n.enMiZona ? 'border-gold-500/50' : 'border-linea'} rounded-xl`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[18px] text-tinta font-medium">{n.resumen}</p>
            {n.enMiZona && <span className="font-sans text-[13px] text-navy-950 bg-gold-500 px-2 py-1 shrink-0 rounded-lg">TU ZONA</span>}
          </div>
          {n.detalle.length > 0 && <p className="text-[15px] text-tenue">{n.detalle.join(' · ')}</p>}
          <p className="text-[15px] text-tenue">
            {n.proposito === 'invertir' ? 'Para invertir · ' : n.proposito === 'vivir' ? 'Para vivir o usarla · ' : ''}
            {n.propuestasTotal} {n.propuestasTotal === 1 ? 'propuesta' : 'propuestas'} · publicada {hace(n.created_at)}
            {n.misPropuestas.length > 0 ? ` · ya propusiste ${n.misPropuestas.length}` : ''}
          </p>

          {n.detallePropuestas.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-linea pt-2.5">
              <span className="font-sans text-[13px] text-tenue">Tus propuestas · precio contra mercado</span>
              {n.detallePropuestas.map((d) => (
                <p key={d.activoId} className="text-[15px] text-tinta-2">
                  <span className="text-tinta">{d.nombre}</span>
                  {' · '}
                  {d.precioMercado?.estado
                    ? <span style={{ color: SEMAFORO[d.precioMercado.estado][1] }}>{SEMAFORO[d.precioMercado.estado][0]}</span>
                    : <span className="text-tenue">{d.precioMercado ? 'Sin comparables suficientes' : 'Calculando…'}</span>}
                </p>
              ))}
            </div>
          )}

          {n.puedeProponer ? (
            <button onClick={() => abrir(n.id)} className="w-fit bg-gold-500 text-navy-950 font-sans text-[15px] px-4 py-2.5 hover:bg-gold-400 rounded-lg">
              {abierta === n.id ? 'Cerrar' : 'Proponer propiedad'}
            </button>
          ) : <p className="text-[15px] text-tinta-2">Llegaste al máximo de {MAX_PROPUESTAS_POR_BROKER} propuestas en esta necesidad.</p>}

          {abierta === n.id && (
            <div className="border-t border-linea pt-3 flex flex-col gap-2.5">
              {n.compatibles.length === 0 ? (
                <p className="text-[16px] text-tinta-2">
                  Ninguna propiedad de tu cartera cumple esta ficha (tipo, zona, precio con ±10 % y tamaño).{' '}
                  <button onClick={() => router.push('/activo/nuevo')} className="text-acento underline underline-offset-2">Cargar una propiedad</button>
                </p>
              ) : (
                <>
                  <span className="font-sans text-[13px] text-tenue">De tu cartera, cumplen la ficha</span>
                  {n.compatibles.map((a) => (
                    <label key={a.activoId} className={`flex items-center gap-3 p-3 border cursor-pointer ${elegida === a.activoId ? 'border-gold-500 bg-gold-500/10' : 'border-linea'}`}>
                      <input type="radio" name={`prop-${n.id}`} checked={elegida === a.activoId} onChange={() => setElegida(a.activoId)} />
                      <span className="flex flex-col">
                        <span className="text-[17px] text-tinta">{a.nombre}</span>
                        <span className="text-[15px] text-tenue">{[a.precio_total ? millones(a.precio_total) : null, a.superficie ? `${a.superficie.toLocaleString('es-MX')} m²` : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-start gap-2.5 text-[15px] text-tinta-2 cursor-pointer">
                    <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5" />
                    <span>Acepto los términos: si cierro la operación con este comprador, SMTBROKER cobra un porcentaje de mi comisión, según los términos vigentes de la plataforma.</span>
                  </label>
                  <button onClick={() => proponer(n.id)} disabled={!elegida || !acepto || enviando}
                    className="w-fit bg-gold-500 text-navy-950 font-sans text-[15px] px-4 py-2.5 hover:bg-gold-400 disabled:opacity-50 rounded-lg">
                    {enviando ? 'Enviando…' : 'Enviar propuesta'}
                  </button>
                </>
              )}
            </div>
          )}
          {mensaje?.id === n.id && <p className={`text-[15px] ${mensaje.ok ? 'text-verde' : 'text-error'}`}>{mensaje.texto}</p>}
        </div>
      ))}
    </div>
  )
}
