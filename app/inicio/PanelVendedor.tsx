'use client'

// Panel de quien vende (ver app/inicio/page.tsx). Trabaja sobre su propiedad más reciente.
// V10 (§24.2, §27 "Dueño"): es su tablero: su precio contra el mercado, cuántas personas buscan algo
// como lo suyo (conteo anónimo, app/api/tablero-dueno) y sus interesados.
import { EncabezadoPantalla } from '../components/Banda'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ListaConexiones from '../components/ListaConexiones'

interface Activo {
  id: string; nombre: string; colonia: string | null; municipio: string | null
  broker_id: string | null; publicada_at: string | null
  operacion?: 'venta' | 'renta' | 'ambas' | null
}
// V9 (§22.3): en renta, la renta realista al mes; en venta y renta, las dos cifras.
type Precio = { salida: number | null; renta: number | null; operacion: 'venta' | 'renta' | 'ambas'; frase: string | null } | 'calculando' | 'error'
type Tablero = {
  operacion: 'venta' | 'renta' | 'ambas'; precioPedido: number | null; rentaPedida: number | null
  demanda: { compra: number; renta: number }; arribaDePresupuesto: { compra: number; renta: number }
  interesados: { conexiones: number; activas: number; porValidar: number; dePagina: number }
}
type Ficha = { titular: string; puntos: string[]; whatsapp: string | null } | 'preparando' | 'error' | null

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const tarjeta = 'bg-tarjeta border p-4 md:p-5 flex flex-col gap-2 rounded-xl'
const etiqueta = 'font-sans text-[14px]'
const boton = 'font-sans text-[16px] font-medium px-4 py-3 text-center transition-colors'

// Su precio (o renta) contra el realista de mercado. ±5 % se lee "en línea".
function contraMercado(pedido: number | null, realista: number | null, renta: boolean) {
  if (!pedido || !realista) return null
  const pct = Math.round((pedido / realista - 1) * 100)
  const cifra = renta ? `${mxn(pedido)} al mes` : mxn(pedido)
  if (Math.abs(pct) < 5) return { texto: `Tu ${renta ? 'renta' : 'precio'} (${cifra}) está en línea con el mercado.`, color: 'var(--c-verde, #2f7d32)' }
  return pct > 0
    ? { texto: `Tu ${renta ? 'renta' : 'precio'} (${cifra}) está ~${pct} % arriba del mercado.${pct > 10 ? ' Así le llega a menos personas.' : ''}`, color: pct > 10 ? 'var(--c-aviso, #b54708)' : 'var(--c-tinta-2)' }
    : { texto: `Tu ${renta ? 'renta' : 'precio'} (${cifra}) está ~${-pct} % abajo del mercado: se ${renta ? 'rentará' : 'venderá'} rápido, pero revisa que no estés dejando dinero.`, color: 'var(--c-tinta-2)' }
}
const personas = (n: number) => `${n} ${n === 1 ? 'persona busca' : 'personas buscan'}`

export default function PanelVendedor({ uid, nombre, conBroker }: { uid: string; nombre: string; conBroker: boolean }) {
  const [activos, setActivos] = useState<Activo[]>([])
  const [activo, setActivo] = useState<Activo | null | undefined>(undefined)
  const [precio, setPrecio] = useState<Precio>('calculando')
  const [cert, setCert] = useState<string | null>(null)
  const [ficha, setFicha] = useState<Ficha>(null)
  const [tablero, setTablero] = useState<Tablero | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('activos').select('id, nombre, colonia, municipio, broker_id, publicada_at, operacion')
        .eq('usuario_id', uid).order('created_at', { ascending: false })
      const lista = (data as Activo[]) || []
      setActivos(lista)
      setActivo(lista[0] ?? null)
    }
    init()
  }, [uid])

  // Lo que la plataforma prepara para la propiedad elegida (la más reciente, o la del selector).
  const activoId = activo?.id
  useEffect(() => {
    if (!activoId) return
    const cargar = async () => {
      setPrecio('calculando'); setCert(null); setFicha(null); setTablero(null)
      const a = { id: activoId }
      const { data: c } = await supabase.from('certificaciones').select('estado').eq('activo_id', a.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setCert((c as { estado: string } | null)?.estado ?? null)
      // El Agente de Mercado devuelve el diagnóstico guardado o lo calcula la primera vez.
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      // Demanda e interesados: no esperan al análisis de mercado.
      fetch('/api/tablero-dueno', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ activoId: a.id }),
      }).then((r) => (r.ok ? r.json() : null)).then((t) => setTablero(t as Tablero | null)).catch(() => {})
      try {
        const r = await fetch('/api/agentes/mercado', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ activoId: a.id }),
        })
        const d = await r.json().catch(() => ({}))
        const frase = typeof d.interpretacion === 'string' ? d.interpretacion.split(/(?<=[.!?])\s+/)[0] : null
        setPrecio(r.ok ? { salida: d.precioSalidaRecomendadoMXN ?? null, renta: d.renta?.rentaRealistaMXN ?? null, operacion: d.operacion ?? 'venta', frase } : 'error')
        if (!r.ok) { setFicha('error'); return }
      } catch { setPrecio('error'); setFicha('error'); return }
      // Con el diagnóstico listo, la plataforma escribe la ficha de venta (o devuelve la guardada):
      // el dueño solo revisa y presiona "Publicar" (JC, 1-nov-2026).
      setFicha('preparando')
      try {
        const r = await fetch('/api/agentes/ficha', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ activoId: a.id }),
        })
        const f = await r.json().catch(() => ({}))
        setFicha(r.ok && f.titular ? { titular: f.titular, puntos: (f.puntosFuertes ?? []).slice(0, 2), whatsapp: f.mensajeWhatsApp ?? null } : 'error')
      } catch { setFicha('error') }
    }
    cargar()
  }, [activoId])

  const [publicando, setPublicando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const publicar = async () => {
    if (!activo) return
    setPublicando(true)
    const publicada_at = new Date().toISOString()
    const { error } = await supabase.from('activos').update({ publicada_at }).eq('id', activo.id)
    setPublicando(false)
    if (error) return
    const nuevo = { ...activo, publicada_at }
    setActivo(nuevo)
    setActivos((xs) => xs.map((x) => (x.id === nuevo.id ? nuevo : x)))
  }

  if (activo === undefined) return null
  if (activo === null) {
    return (
      <div className={`${tarjeta} border-linea`}>
        <p className="text-[18px]">Aún no registras una propiedad.</p>
        <Link href="/activo/nuevo" className="text-acento underline underline-offset-2 text-[16px]">Registrar mi propiedad</Link>
      </div>
    )
  }

  const lugar = activo.colonia || activo.municipio
  const soloRenta = activo.operacion === 'renta'
  const tarjetaBroker = !activo.broker_id && (
    <div className={`${tarjeta} ${conBroker ? 'border-gold-500' : 'border-linea'}`}>
      <span className={`${etiqueta} ${conBroker ? 'text-acento' : 'text-tenue'}`}>{conBroker ? 'Elige tu asesor verificado' : '¿Quieres llegar a toda la red?'}</span>
      <p className="text-[17px]">Un asesor verificado presenta tu propiedad a {soloRenta ? 'quienes buscan rentar en' : 'los compradores de'} todos los asesores y te acompaña hasta {soloRenta ? 'la firma del contrato' : 'el cierre'}.</p>
      <a href={`/activo/${activo.id}#elegir-broker`} className={conBroker ? `${boton} bg-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg` : 'font-sans text-[15px] text-acento'}>
        {conBroker ? 'Ver asesores de mi zona' : 'Ver asesores de mi zona →'}
      </a>
    </div>
  )

  return (
    <>
      <EncabezadoPantalla ancho="max-w-[860px]" titulo={`Listo${nombre ? `, ${nombre}` : ''}.`}
        subtitulo={<>SMT Match ya está analizando tu propiedad: <span className="text-tinta">{activo.nombre}</span>{lugar && !activo.nombre.includes(lugar) ? `, ${lugar}` : ''}. Esto es lo que preparamos para ti:</>}>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          {activos.length > 1 && (
            <label className="flex items-center gap-2 text-[15px] text-tenue">
              Ver otra propiedad:
              <select value={activo.id} onChange={(e) => setActivo(activos.find((x) => x.id === e.target.value) ?? activo)}
                className="bg-tarjeta border border-linea text-tinta text-[16px] px-2 py-1.5 rounded-xl">
                {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </label>
          )}
          {/* El dueño puede cargar más de una propiedad; antes solo lo encontraba en el menú ("Registrar activo"). */}
          <Link href="/activo/nuevo"
            className="inline-flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-navy-950 font-medium text-[15px] px-3.5 py-2 rounded-xl transition-colors">
            <span aria-hidden="true">+</span> Cargar otra propiedad
          </Link>
        </div>
      </EncabezadoPantalla>

      {conBroker && tarjetaBroker}

      <div className={`${tarjeta} border-gold-500`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`${etiqueta} text-acento`} data-precio-realista>{typeof precio === 'object' && precio.operacion === 'renta' ? 'Tu renta realista de mercado' : typeof precio === 'object' && precio.operacion === 'ambas' ? 'Tu precio y tu renta realistas' : 'Tu precio realista de mercado'}</span>
          {typeof precio === 'object' && (precio.salida || precio.renta) && <span className="font-sans text-[13px] text-navy-950 bg-gold-500 px-1.5 py-0.5 rounded-lg">LISTO</span>}
        </div>
        {precio === 'calculando' ? (
          <div className="flex items-center gap-3 py-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-pulse shrink-0" />
            <p className="text-[17px] text-tinta-2">Analizando el mercado de tu zona… Te avisamos por correo cuando esté listo.</p>
          </div>
        ) : precio === 'error' || (!precio.salida && !precio.renta) ? (
          <p className="text-[17px] text-tinta-2">Tu análisis de mercado queda en tu propiedad. <a href={`/activo/${activo.id}`} className="text-acento underline underline-offset-2">Verlo</a></p>
        ) : (
          <>
            {precio.salida && <span className="font-display text-[32px] font-medium">{mxn(precio.salida)}{precio.operacion === 'ambas' && <span className="text-[17px] text-tinta-2 font-sans"> en venta</span>}</span>}
            {precio.renta && <span className="font-display text-[32px] font-medium" data-renta-realista>{mxn(precio.renta)}<span className="text-[17px] text-tinta-2 font-sans"> al mes{precio.operacion === 'ambas' ? ' en renta' : ''}</span></span>}
            {precio.operacion !== 'venta' && !precio.renta && <p className="text-[16px] text-tinta-2">Renta realista: sin dato todavía (pocas rentas comparables en tu zona).</p>}
            {tablero && [contraMercado(tablero.precioPedido, precio.salida, false), contraMercado(tablero.rentaPedida, precio.renta, true)]
              .filter((m): m is NonNullable<typeof m> => !!m)
              .map((m) => <p key={m.texto} className="text-[16px] font-medium" style={{ color: m.color }} data-contra-mercado>{m.texto}</p>)}
            {precio.frase && <p className="text-[16px] text-tinta-2">{precio.frase}</p>}
            <a href={`/activo/${activo.id}`} className="font-sans text-[15px] text-acento">Ver análisis completo →</a>
          </>
        )}
      </div>

      {tablero && (() => {
        const ops = (tablero.operacion === 'ambas' ? ['compra', 'renta'] : [tablero.operacion === 'renta' ? 'renta' : 'compra']) as ('compra' | 'renta')[]
        const total = ops.reduce((t, o) => t + tablero.demanda[o], 0)
        const i = tablero.interesados
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`${tarjeta} border-linea`} data-demanda>
              <span className={`${etiqueta} text-acento`}>Quién busca algo como lo tuyo</span>
              <span className="font-display text-[32px] font-medium leading-none">{total}</span>
              {total === 0 && ops.every((o) => !tablero.arribaDePresupuesto[o]) ? (
                <p className="text-[16px] text-tinta-2">Hoy nadie busca exactamente algo como tu propiedad. En cuanto alguien registre una búsqueda que coincida, lo verás aquí.</p>
              ) : ops.map((o) => (
                <p key={o} className="text-[16px] text-tinta-2">
                  {personas(tablero.demanda[o])} {o === 'renta' ? 'rentar' : 'comprar'} algo como tu propiedad, en tu zona y con tu {o === 'renta' ? 'renta' : 'precio'}.
                  {tablero.arribaDePresupuesto[o] > 0 && <> <span className="text-tinta">{tablero.arribaDePresupuesto[o]} más</span> {tablero.arribaDePresupuesto[o] === 1 ? 'busca' : 'buscan'} lo mismo con menos presupuesto.</>}
                </p>
              ))}
              <p className="text-[14px] text-tenue">{activo.publicada_at ? 'A quienes coinciden les mostramos tu propiedad.' : 'Publica tu página para que les aparezca.'} No te compartimos sus datos: tú decides con quién conectar.</p>
            </div>
            <div className={`${tarjeta} border-linea`} data-interesados>
              <span className={`${etiqueta} text-acento`}>Interesados</span>
              <span className="font-display text-[32px] font-medium leading-none">{i.conexiones + i.dePagina}</span>
              <p className="text-[16px] text-tinta-2">
                {i.conexiones === 0 && i.dePagina === 0 ? 'Todavía nadie. Te avisamos por correo en cuanto alguien quiera conectar.' : <>
                  {i.conexiones > 0 && <>{i.conexiones} {i.conexiones === 1 ? 'quiere' : 'quieren'} conectar contigo{i.porValidar ? ` (${i.porValidar} en revisión)` : ''}. </>}
                  {i.dePagina > 0 && <>{i.dePagina} {i.dePagina === 1 ? 'dejó' : 'dejaron'} sus datos en tu página.</>}
                </>}
              </p>
              {(i.conexiones > 0 || i.dePagina > 0) && <a href={`/activo/${activo.id}/leads`} className="font-sans text-[15px] text-acento">Ver interesados →</a>}
            </div>
          </div>
        )
      })()}

      <div className={`${tarjeta} border-linea`}>
        <span className={`${etiqueta} text-acento`}>Certifica tu propiedad</span>
        {cert === 'certificada' ? (
          <p className="text-[17px]">Tu propiedad está certificada. <a href={`/activo/${activo.id}/reporte`} className="text-acento underline underline-offset-2">Ver reporte</a></p>
        ) : cert === 'solicitada' || cert === 'pagada' ? (
          <p className="text-[17px]">Tu certificación está en revisión. Te avisamos al terminar.</p>
        ) : (
          <>
            <p className="text-[17px]">Las propiedades certificadas generan más confianza y {soloRenta ? 'se rentan' : 'se venden'} más rápido. <span className="text-tinta-2">La plataforma se encarga de la certificación por ti.</span></p>
            <p className="text-[15px] text-tenue">{soloRenta ? 'Te pediremos escritura y predial (la certificación de renta es más ligera).' : 'Te pediremos escritura, folio real y predial.'}</p>
            <a href={`/activo/${activo.id}#expediente`} className={`${boton} bg-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg`}>Certificar mi propiedad</a>
          </>
        )}
      </div>

      <div className={`${tarjeta} border-linea`}>
        {activo.publicada_at ? (
          <>
            <span className={`${etiqueta} text-acento`}>Tu página está publicada</span>
            <p className="text-[17px]">La ven los compradores que coinciden y todos los asesores de SMT Match. Compártela también por tus canales.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${activo.id}`); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
                className="font-sans text-[15px] px-3 py-2.5 bg-gold-500 text-navy-950 hover:bg-gold-400 rounded-lg">{copiado ? '¡Copiado!' : 'Copiar enlace'}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${typeof ficha === 'object' && ficha?.whatsapp ? ficha.whatsapp + ' ' : ''}${typeof window !== 'undefined' ? window.location.origin : ''}/p/${activo.id}`)}`}
                target="_blank" rel="noopener noreferrer" className="font-sans text-[15px] px-3 py-2.5 border border-[#3fbe72]/50 text-exito hover:border-[#3fbe72] rounded-lg">Compartir por WhatsApp</a>
              <a href={`/activo/${activo.id}/leads`} className="font-sans text-[15px] px-3 py-2.5 border border-linea hover:border-linea-fuerte rounded-lg">Ver interesados</a>
            </div>
          </>
        ) : ficha === 'preparando' || (ficha === null && precio === 'calculando') ? (
          <>
            <span className={`${etiqueta} text-tenue`}>Tu página de {soloRenta ? 'renta' : 'venta'}</span>
            <div className="flex items-center gap-3 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-pulse shrink-0" />
              <p className="text-[17px] text-tinta-2">{ficha === 'preparando' ? 'Escribiendo tu ficha y armando tu página…' : 'Tu ficha y tu página se preparan en cuanto esté tu precio.'}</p>
            </div>
          </>
        ) : typeof ficha === 'object' && ficha ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className={`${etiqueta} text-acento`}>Tu página de {soloRenta ? 'renta' : 'venta'} está lista</span>
              <span className="font-sans text-[13px] text-navy-950 bg-gold-500 px-1.5 py-0.5 rounded-lg">LISTA</span>
            </div>
            <div className="border border-linea bg-fondo/50 p-3 flex flex-col gap-1.5">
              <p className="font-display text-[18px] font-medium">{ficha.titular}</p>
              {ficha.puntos.map((p) => <p key={p} className="text-[15px] text-tinta-2">✓ {p}</p>)}
            </div>
            <p className="text-[16px] text-tinta-2">Al publicarla, la ven los compradores que coinciden y todos los asesores de SMT Match.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={publicar} disabled={publicando} className={`${boton} bg-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-60 rounded-lg`}>{publicando ? 'Publicando…' : 'Publicar'}</button>
              <a href={`/activo/${activo.id}/marketing`} className={`${boton} border border-linea hover:border-linea-fuerte`}>Revisar y editar</a>
            </div>
          </>
        ) : (
          <>
            <span className={`${etiqueta} text-tenue`}>Tu página de {soloRenta ? 'renta' : 'venta'}</span>
            <p className="text-[17px]">Escribimos tu ficha y armamos tu página para que la publiques.</p>
            <a href={`/activo/${activo.id}/marketing`} className={`${boton} border border-linea hover:border-linea-fuerte`}>Preparar mi página</a>
          </>
        )}
      </div>

      {!conBroker && tarjetaBroker}
      {/* V8 Parte 3: compradores que pidieron ver su propiedad (validados por Operación) */}
      <ListaConexiones titulo="Quienes quieren conectar" vacio="" acento="#d9b45a" ocultarVacia />
    </>
  )
}
