import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarOperacion } from '@/lib/avisos'

// El broker reporta un cierre (Documento Maestro V6.1 §6.2; V6.3 §16: los cierres verificados son
// la base del índice de precios y de la monetización). Antes el portal del broker insertaba directo
// en cierres_reportados desde el navegador; pasa por aquí para poder avisar a Operación (paso 2 del
// plan V6.3) -- sin aviso, el cierre se quedaba sin verificar hasta que alguien abriera /panel.
//
// Valida lo mismo que la política RLS "broker reporta cierres de sus activos" (que sigue vigente
// como defensa): quien reporta es el broker que representa el activo y el reporte nace 'pendiente'.
// También marca el activo como cerrado (lo que antes hacía el navegador).

const ORIGENES = ['mi_cliente', 'otro_broker', 'comprador_directo', 'fuera_de_plataforma']
const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'broker') return NextResponse.json({ error: 'Solo un broker reporta cierres' }, { status: 403 })

    const { activoId, precio, fecha, origen } = await req.json().catch(() => ({}))
    const precioNum = Number(precio)
    if (!activoId || !(precioNum > 0)) return NextResponse.json({ error: 'Captura el precio de cierre' }, { status: 400 })
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    if (!ORIGENES.includes(origen)) return NextResponse.json({ error: 'Origen del comprador inválido' }, { status: 400 })

    const { data } = await s.admin.from('activos').select('id, nombre, municipio, broker_id').eq('id', activoId).maybeSingle()
    const activo = data as { id: string; nombre: string; municipio: string; broker_id: string | null } | null
    if (!activo || activo.broker_id !== s.uid) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

    const { error } = await s.admin.from('cierres_reportados').insert({
      activo_id: activoId, broker_id: s.uid, precio_cierre: precioNum, fecha_cierre: fecha, origen_comprador: origen,
    })
    if (error) return NextResponse.json({ error: 'No se pudo reportar. Intenta de nuevo.' }, { status: 500 })
    await s.admin.from('activos').update({ status: 'cerrado' }).eq('id', activoId)

    after(() => avisarOperacion({
      asunto: `Cierre por verificar · ${activo.nombre}`,
      titulo: 'Un broker reportó un cierre',
      lineas: [
        `Propiedad: ${activo.nombre} (${activo.municipio}).`,
        `Precio de cierre: ${mxn(precioNum)} · fecha ${fecha}.`,
        'Verifícalo para que cuente en el nivel del broker y en el índice de precios de cierre.',
      ],
      enlace: { texto: 'Verificar en la consola de Operación', ruta: '/panel' },
    }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
