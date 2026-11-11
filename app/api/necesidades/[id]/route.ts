import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { DIAS_VIGENCIA, MAX_NECESIDADES_ACTIVAS } from '@/lib/necesidad'
import { avisarBrokersZona, vigente, COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'

// PATCH: el comprador administra una de sus fichas (Documento Maestro V8, §19.5).
//   {accion: 'renovar'}   otros 30 días (la necesidad vence a los 30 para no llenar el panel)
//   {accion: 'pausar'}    deja de verse en el panel y de buscar
//   {accion: 'activar'}   vuelve (cuenta para el tope de 3 activas)
//   {publicada_brokers?, busqueda_directa?}  enciende o apaga cada camino (al menos uno encendido)

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await ctx.params
    const { data } = await s.admin.from('necesidades').select(COLS_NECESIDAD).eq('id', id).eq('usuario_id', s.uid).maybeSingle()
    const n = data as FilaNecesidad | null
    if (!n) return NextResponse.json({ error: 'Búsqueda no encontrada' }, { status: 404 })

    const b = await req.json().catch(() => ({})) as { accion?: string; publicada_brokers?: boolean; busqueda_directa?: boolean }
    const cambios: Record<string, unknown> = {}
    const reactiva = b.accion === 'renovar' || b.accion === 'activar'
    if (reactiva && !vigente(n)) {
      const { data: otras } = await s.admin.from('necesidades').select('id, activa, vence_at').eq('usuario_id', s.uid).neq('id', id)
      if (((otras as FilaNecesidad[]) || []).filter(vigente).length >= MAX_NECESIDADES_ACTIVAS) {
        return NextResponse.json({ error: `Ya tienes ${MAX_NECESIDADES_ACTIVAS} búsquedas activas. Pausa una primero.` }, { status: 409 })
      }
    }
    if (b.accion === 'renovar') Object.assign(cambios, { activa: true, vence_at: new Date(Date.now() + DIAS_VIGENCIA * 86400_000).toISOString() })
    else if (b.accion === 'activar') {
      cambios.activa = true
      if (new Date(n.vence_at).getTime() <= Date.now()) cambios.vence_at = new Date(Date.now() + DIAS_VIGENCIA * 86400_000).toISOString()
    } else if (b.accion === 'pausar') cambios.activa = false
    if (typeof b.publicada_brokers === 'boolean') cambios.publicada_brokers = b.publicada_brokers
    if (typeof b.busqueda_directa === 'boolean') cambios.busqueda_directa = b.busqueda_directa
    const final = { ...n, ...cambios } as FilaNecesidad
    if (!final.publicada_brokers && !final.busqueda_directa) return NextResponse.json({ error: 'Deja encendida al menos una forma de buscar' }, { status: 400 })
    if (!Object.keys(cambios).length) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })

    const { error } = await s.admin.from('necesidades').update(cambios).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Recién publicada en el panel (o reactivada ya publicada): se avisa a los brokers de la zona.
    const sePublica = final.publicada_brokers && vigente(final) && (!n.publicada_brokers || !vigente(n))
    if (sePublica) after(() => avisarBrokersZona(s.admin, final, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
