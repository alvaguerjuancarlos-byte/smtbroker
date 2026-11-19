import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { COLS_ACTIVO_FICHA, COLS_NECESIDAD, vigente, type FilaNecesidad } from '@/lib/necesidadServidor'
import { cumpleNecesidad, type ActivoPropuesta, type Operacion } from '@/lib/necesidad'

// Tablero del dueño (Documento Maestro V10, §24.2 y §27 "Dueño"): para UNA propiedad suya,
//   - demanda: cuántas fichas vigentes de quienes buscan cumple hoy (misma regla que el panel de
//     asesores, §19.3: tipo, zona, ±10 % de presupuesto, superficie), separadas en compra y renta;
//   - cuántas más buscan lo mismo en su zona pero su precio les queda arriba (pista para el precio);
//   - interesados: conexiones (quien pidió conectar) e interesados de su página.
// Todo es conteo: nunca se dice quién busca (la ficha es anónima, §19.3).
// Body: {activoId}. Solo el dueño de la propiedad.

type Fila = ActivoPropuesta & { id: string; usuario_id: string }

const esPorPrecio = (m: string) => m.startsWith('Su precio') || m.startsWith('Su renta')

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { activoId } = await req.json().catch(() => ({}))
    if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

    const { data: a } = await s.admin.from('activos').select(COLS_ACTIVO_FICHA + ', usuario_id').eq('id', activoId).maybeSingle()
    const activo = a as unknown as Fila | null
    if (!activo || activo.usuario_id !== s.uid) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })

    const [{ data: ns }, { data: cs }, { count: leads }] = await Promise.all([
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('es_demo', s.esDemo).eq('activa', true).neq('usuario_id', s.uid),
      s.admin.from('conexiones').select('estado').eq('activo_id', activoId),
      s.admin.from('leads').select('id', { count: 'exact', head: true }).eq('activo_id', activoId),
    ])

    const demanda: Record<Operacion, number> = { compra: 0, renta: 0 }
    const arribaDePresupuesto: Record<Operacion, number> = { compra: 0, renta: 0 }
    for (const n of ((ns as unknown as FilaNecesidad[]) || []).filter(vigente)) {
      const op: Operacion = n.operacion ?? 'compra'
      const { cumple, motivos } = cumpleNecesidad(activo, n)
      if (cumple) demanda[op]++
      // Solo le falla el precio: buscan lo mismo en su zona, con menos presupuesto.
      else if (motivos.length === 1 && esPorPrecio(motivos[0])) {
        const max = n.presupuesto_max
        const precio = op === 'renta' ? activo.renta_mensual : activo.precio_total
        if (precio && max && precio > max) arribaDePresupuesto[op]++
      }
    }

    const conexiones = ((cs as { estado: string }[]) || []).filter((c) => c.estado !== 'rechazada')
    return NextResponse.json({
      operacion: activo.operacion ?? 'venta',
      precioPedido: activo.precio_total ?? null,
      rentaPedida: activo.renta_mensual ?? null,
      demanda, arribaDePresupuesto,
      interesados: {
        conexiones: conexiones.length,
        activas: conexiones.filter((c) => c.estado === 'activa').length,
        porValidar: conexiones.filter((c) => c.estado === 'por_validar').length,
        dePagina: leads ?? 0,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
