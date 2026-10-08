import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Activa o quita la marca "Pionero" de un broker (Plan Piloto V1; migración
// 20261008000100_broker_fundador.sql, renombrada a pionero en 20261008000300). Solo Operación
// MindBridge (rol interno 'broker_maestro').
// Corre con service_role porque authenticated solo puede editar su propio `nombre` en usuarios --
// a propósito, para que nadie se otorgue la marca a sí mismo.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { data: caller, error } = await admin.auth.getUser(token)
    if (error || !caller?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: yo } = await admin.from('usuarios').select('rol, es_demo').eq('id', caller.user.id).single()
    const operador = yo as { rol: string | null; es_demo: boolean | null } | null
    if (operador?.rol !== 'broker_maestro') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { brokerId, pionero } = await req.json().catch(() => ({}))
    if (!brokerId || typeof pionero !== 'boolean') {
      return NextResponse.json({ error: 'Faltan brokerId y pionero (true/false)' }, { status: 400 })
    }

    const { data: broker } = await admin.from('usuarios').select('rol, es_demo').eq('id', brokerId).maybeSingle()
    const b = broker as { rol: string | null; es_demo: boolean | null } | null
    // La cuenta demo de Operación solo toca el mundo demo (migración 20261008000700).
    if (b && !!b.es_demo !== !!operador.es_demo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    if (b?.rol !== 'broker') {
      return NextResponse.json({ error: 'Solo un broker puede ser Pionero' }, { status: 422 })
    }

    const { error: errUpd } = await admin.from('usuarios').update({ pionero }).eq('id', brokerId)
    if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 })
    return NextResponse.json({ ok: true, pionero })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
