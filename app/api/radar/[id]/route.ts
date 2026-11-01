import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarOperacion } from '@/lib/avisos'
import { perfilDelComprador } from '@/lib/radarServidor'

// "Me interesa" sobre una opción que Operación le agregó al Radar del comprador (Documento Maestro
// V7.1 §18): pide que se invite al anunciante a certificar. Si el anuncio ya tiene invitación en
// curso, solo se suma como un comprador interesado más.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest, ctx: RouteContext<'/api/radar/[id]'>) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const r = await perfilDelComprador(s)
    if ('error' in r) return r.error
    const { id } = await ctx.params

    const { data } = await s.admin.from('radar_opciones')
      .select('id, perfil_id, interesado_at, anuncio_id, radar_anuncios(url, fuente, invitacion_estado)').eq('id', id).maybeSingle()
    const op = data as unknown as {
      perfil_id: string; interesado_at: string | null; anuncio_id: string
      radar_anuncios: { url: string; fuente: string; invitacion_estado: string }
    } | null
    if (!op || op.perfil_id !== r.perfilId) return NextResponse.json({ error: 'Opción no encontrada' }, { status: 404 })
    if (op.interesado_at) return NextResponse.json({ ok: true })

    const ahora = new Date().toISOString()
    await s.admin.from('radar_opciones').update({ interesado_at: ahora }).eq('id', id)
    if (op.radar_anuncios.invitacion_estado === 'sin_invitar') {
      await s.admin.from('radar_anuncios').update({ invitacion_estado: 'pendiente', actualizado_at: ahora }).eq('id', op.anuncio_id)
    }
    after(() => avisarOperacion({
      asunto: `Radar: a un comprador le interesa un anuncio de ${op.radar_anuncios.fuente}`,
      titulo: 'Hay un anuncio por invitar a certificar',
      lineas: [`Liga: ${op.radar_anuncios.url}`],
      enlace: { texto: 'Abrir el Radar en la consola', ruta: '/panel#radar' },
    }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
