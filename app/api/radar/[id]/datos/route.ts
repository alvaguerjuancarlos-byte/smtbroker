import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { leerYGuardar } from '@/lib/lecturaAnuncioServidor'
import { TIPOS_NECESIDAD } from '@/lib/necesidad'

// Datos de un anuncio de portal de la bandeja del comprador (Documento Maestro V8; opción 2):
//   {accion: 'leer'}                       la plataforma lee ESA página y saca precio, m², colonia
//                                          y tipo (lib/lecturaAnuncioServidor.ts)
//   {accion: 'capturar', precio, superficie, tipo?}  si el portal no deja leer (o se leyó mal), el
//                                          comprador escribe lo que vio
// Solo el comprador que tiene la opción en su Radar. Nunca se guarda nada del anunciante.

const numero = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await ctx.params
    const { data } = await s.admin.from('radar_opciones').select('id, anuncio_id, perfiles_intencion(usuario_id)').eq('id', id).maybeSingle()
    const op = data as unknown as { anuncio_id: string; perfiles_intencion: { usuario_id: string | null } | null } | null
    if (!op || op.perfiles_intencion?.usuario_id !== s.uid) return NextResponse.json({ error: 'Anuncio no encontrado' }, { status: 404 })

    const b = await req.json().catch(() => ({})) as { accion?: string; precio?: unknown; superficie?: unknown; tipo?: unknown }
    if (b.accion === 'leer') {
      const r = await leerYGuardar(s.admin, op.anuncio_id)
      const { data: a } = await s.admin.from('radar_anuncios').select('lectura, precio, superficie, tipo, municipio, colonia, datos').eq('id', op.anuncio_id).single()
      return NextResponse.json({ ok: true, nueva: !!r, anuncio: a })
    }
    if (b.accion === 'capturar') {
      const precio = numero(b.precio), superficie = numero(b.superficie)
      if (!precio || !superficie) return NextResponse.json({ error: 'Escribe el precio y los m² que viste en el anuncio' }, { status: 400 })
      const tipo = TIPOS_NECESIDAD.find((t) => t.etiqueta === b.tipo)?.etiqueta
      const ahora = new Date().toISOString()
      await s.admin.from('radar_anuncios').update({
        precio, superficie, ...(tipo ? { tipo } : {}), lectura: 'capturado', lectura_at: ahora, actualizado_at: ahora,
      }).eq('id', op.anuncio_id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
