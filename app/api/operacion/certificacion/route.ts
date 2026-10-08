import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { mismoMundo } from '@/lib/mundo'
import { avisarUsuario } from '@/lib/avisos'

// Operación cierra una certificación legal: {certificacionId, estado: 'certificada' | 'rechazada',
// dictamenId?}. Pasa por el servidor (antes era un update desde /panel) para avisar por correo a
// quien la pidió -- la pantalla del activo le promete "Te avisamos al terminar".
// Solo Operación, y solo dentro de su mundo (lib/mundo.ts).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!s.esOperacion) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { certificacionId, estado, dictamenId } = await req.json().catch(() => ({}))
    if (!certificacionId || (estado !== 'certificada' && estado !== 'rechazada')) {
      return NextResponse.json({ error: "Faltan certificacionId y estado ('certificada' o 'rechazada')" }, { status: 400 })
    }
    if (estado === 'certificada' && !dictamenId) return NextResponse.json({ error: 'Para certificar hace falta el dictamen' }, { status: 400 })

    const { data } = await s.admin.from('certificaciones')
      .select('id, activo_id, solicitado_por, estado, activos(nombre, es_demo)').eq('id', certificacionId).maybeSingle()
    const cert = data as unknown as {
      activo_id: string; solicitado_por: string; estado: string; activos: { nombre: string; es_demo: boolean } | null
    } | null
    if (!cert || !cert.activos || !mismoMundo(s.esDemo, cert.activos.es_demo)) {
      return NextResponse.json({ error: 'Certificación no encontrada' }, { status: 404 })
    }
    if (cert.estado !== 'en_revision') return NextResponse.json({ error: 'Esta certificación ya se cerró' }, { status: 409 })

    const { error } = await s.admin.from('certificaciones').update({
      estado, dictamen_id: dictamenId ?? null, revisado_por: s.uid, actualizado_at: new Date().toISOString(),
    }).eq('id', certificacionId).eq('estado', 'en_revision')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { nombre, es_demo: esDemoActivo } = cert.activos
    after(() => avisarUsuario(s.admin, cert.solicitado_por, estado === 'certificada'
      ? {
          asunto: `Certificada: ${nombre}`,
          titulo: 'Tu propiedad quedó certificada',
          lineas: [
            `${nombre} ya tiene el sello de inventario certificado.`,
            'Puedes ver el dictamen y descargar el Reporte de Transparencia para compartirlo con compradores.',
          ],
          enlace: { texto: 'Ver la propiedad', ruta: `/activo/${cert.activo_id}` },
        }
      : {
          asunto: `Certificación no aprobada: ${nombre}`,
          titulo: 'La certificación no se aprobó',
          lineas: [
            `Revisamos el expediente de ${nombre} y por ahora no se puede certificar.`,
            'Revisa los datos del expediente; puedes volver a solicitarla cuando estén completos.',
          ],
          enlace: { texto: 'Ver la propiedad', ruta: `/activo/${cert.activo_id}` },
        },
    { esDemo: esDemoActivo }))
    return NextResponse.json({ ok: true, estado })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
