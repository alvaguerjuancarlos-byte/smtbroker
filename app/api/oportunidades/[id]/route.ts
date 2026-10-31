import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'

// El broker responde una oportunidad (Documento Maestro V6.3 §15; V7: también de compradores):
// {accion: 'aceptar' | 'rechazar'}.
//   - De un activo: al aceptar pasa a representarlo (activos.broker_id), con service_role: el broker
//     todavía no tiene permiso de escritura sobre un activo que no representa. `cargado_por` se
//     queda en 'propietario', así que el CHECK de representación (que aplica a lo que carga un
//     broker) no aplica, y el trigger anti-robo solo protege usuario_id y cargado_por: el dueño
//     sigue siendo el propietario.
//   - De un comprador: al aceptar pasa a representarlo (perfiles_intencion.representado_por), que
//     solo service_role puede escribir (trigger de la migración 20261031000000).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest, ctx: RouteContext<'/api/oportunidades/[id]'>) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await ctx.params
    const { accion } = await req.json().catch(() => ({}))
    if (accion !== 'aceptar' && accion !== 'rechazar') {
      return NextResponse.json({ error: "accion debe ser 'aceptar' o 'rechazar'" }, { status: 400 })
    }

    const { data } = await s.admin.from('oportunidades').select('id, activo_id, perfil_id, broker_id, estado').eq('id', id).maybeSingle()
    const op = data as { activo_id: string | null; perfil_id: string | null; broker_id: string; estado: string } | null
    if (!op || op.broker_id !== s.uid) return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 })
    if (op.estado !== 'ofrecida') return NextResponse.json({ error: 'Esta oportunidad ya fue respondida' }, { status: 409 })

    if (accion === 'aceptar') {
      // Solo si el cliente sigue sin broker (por si lo asignó por otra vía).
      const { data: asignado, error } = op.activo_id
        ? await s.admin.from('activos').update({ broker_id: s.uid }).eq('id', op.activo_id).is('broker_id', null).select('id')
        : await s.admin.from('perfiles_intencion').update({ representado_por: s.uid }).eq('id', op.perfil_id!).is('representado_por', null).select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!asignado?.length) return NextResponse.json({ error: op.activo_id ? 'Este activo ya tiene broker' : 'Este comprador ya tiene broker' }, { status: 409 })
    }

    const estado = accion === 'aceptar' ? 'aceptada' : 'rechazada'
    const { error } = await s.admin.from('oportunidades')
      .update({ estado, respondida_at: new Date().toISOString() }).eq('id', id).eq('estado', 'ofrecida')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, estado })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
