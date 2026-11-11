import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarUsuario } from '@/lib/avisos'
import { cumpleNecesidad, etiquetaTipo, dinero, precioPara, MAX_PROPUESTAS_POR_BROKER, type OperacionActivo, type RentaActivo } from '@/lib/necesidad'
import { vigente, COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'
import { datosDeMercado, COLS_ACTIVO_ANALISIS, type ActivoParaAnalisis } from '@/lib/analisisServidor'
import { precioContraMercado } from '@/lib/analisis'

// POST {necesidadId, activoId, aceptoTerminos}: un broker propone una propiedad de su cartera a una
// necesidad del panel (Documento Maestro V8, §19.3). Reglas, todas revisadas aquí y no en el
// navegador:
//   - el broker acepta los términos AL PROPONER (§21.6): si cierra con ese cliente, SMTBROKER cobra
//     un porcentaje de su comisión;
//   - la propiedad es suya y cumple la ficha: tipo, municipio/colonias, precio con ±10 %, tamaño;
//   - hasta 3 propuestas por broker en cada necesidad; una propiedad se propone una sola vez;
//   - mismo mundo (demo/real).
// La propiedad se vuelve visible para ESE comprador en su bandeja, que recibe un aviso. El broker no
// conoce al comprador hasta que este pida contacto (Parte 3).
//
// V8 Parte 2 (§20.5 regla 4): al proponer se calcula el precio contra mercado de la propiedad
// (propuestas.precio_mercado). Es lo único del análisis que ve el broker, y no depende de que el
// comprador se interese.
//
// V9 (§22): en una ficha de renta se compara la RENTA mensual contra comparables de renta; la
// comisión que acepta el broker es un mes de renta (§22.5).

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'broker') return NextResponse.json({ error: 'Solo los brokers proponen propiedades' }, { status: 403 })
    const b = await req.json().catch(() => ({})) as { necesidadId?: string; activoId?: string; aceptoTerminos?: boolean }
    if (b.aceptoTerminos !== true) return NextResponse.json({ error: 'Para proponer, acepta los términos' }, { status: 400 })

    const [{ data: nd }, { data: ad }] = await Promise.all([
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('id', b.necesidadId ?? '').maybeSingle(),
      s.admin.from('activos').select('id, nombre, tipo, municipio, colonia, superficie, precio_total, operacion, renta_mensual, renta, broker_id, status, es_demo').eq('id', b.activoId ?? '').maybeSingle(),
    ])
    const n = nd as FilaNecesidad | null
    const a = ad as { id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; superficie: number | null; precio_total: number | null; broker_id: string | null; status: string | null; es_demo: boolean
      operacion: OperacionActivo | null; renta_mensual: number | null; renta: RentaActivo | null } | null
    if (!n || n.es_demo !== s.esDemo || !vigente(n) || !n.publicada_brokers) return NextResponse.json({ error: 'Esta necesidad ya no está publicada' }, { status: 404 })
    if (!a || a.broker_id !== s.uid || a.es_demo !== s.esDemo) return NextResponse.json({ error: 'Solo puedes proponer propiedades de tu cartera' }, { status: 403 })
    if (a.status === 'cerrado') return NextResponse.json({ error: 'Esa propiedad ya se cerró' }, { status: 409 })

    const c = cumpleNecesidad(a, n)
    if (!c.cumple) return NextResponse.json({ error: `No cumple la ficha: ${c.motivos.join('; ')}` }, { status: 422 })

    const { count } = await s.admin.from('propuestas').select('id', { count: 'exact', head: true }).eq('necesidad_id', n.id).eq('broker_id', s.uid)
    if ((count ?? 0) >= MAX_PROPUESTAS_POR_BROKER) return NextResponse.json({ error: `Máximo ${MAX_PROPUESTAS_POR_BROKER} propuestas por necesidad` }, { status: 409 })

    const { data: nueva, error } = await s.admin.from('propuestas').insert({
      necesidad_id: n.id, activo_id: a.id, broker_id: s.uid, terminos_aceptados_at: new Date().toISOString(),
    }).select('id').single()
    if (error) {
      const dup = /duplicate|unique/i.test(error.message)
      return NextResponse.json({ error: dup ? 'Esa propiedad ya se propuso a esta necesidad' : error.message }, { status: dup ? 409 : 500 })
    }

    after(async () => {
      const { data: completo } = await s.admin.from('activos').select(COLS_ACTIVO_ANALISIS).eq('id', a.id).single()
      const enRenta = n.operacion === 'renta'
      const m = await datosDeMercado(s.admin, completo as ActivoParaAnalisis, enRenta ? 'renta' : 'venta')
      await s.admin.from('propuestas').update({
        precio_mercado: { ...m, operacion: enRenta ? 'renta' : 'venta', semaforo: precioContraMercado(precioPara(a, n.operacion), m.precio) },
      }).eq('id', (nueva as { id: string }).id)
    })
    const precio = precioPara(a, n.operacion)
    after(() => avisarUsuario(s.admin, n.usuario_id, {
      asunto: `Un broker verificado te propone una opción en ${a.municipio}: ${etiquetaTipo(n.tipo).toLowerCase()}`,
      titulo: 'Tienes una propuesta nueva',
      lineas: [`${a.nombre}${precio ? ` · ${dinero(precio, n.operacion)}` : ''}.`, 'Cumple lo que buscas. Revísala en tu bandeja.'],
      enlace: { texto: 'Ver mi bandeja', ruta: '/inicio' },
    }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
