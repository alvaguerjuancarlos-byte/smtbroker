import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { puedeAccederActivo } from '@/lib/accesoActivo'
import { documentosFaltantes, type ActivoExpediente } from '@/lib/expediente'
import { avisarOperacion } from '@/lib/avisos'

// Solicitar la CERTIFICACIÓN legal de un activo (Documento Maestro V6.3, §13; migración
// 20261008000200_certificaciones.sql). La pide el dueño o el broker que lo representa, y solo con
// el expediente completo -- sin folio, escritura, clave catastral, gravámenes y uso de suelo no
// hay nada que dictaminar. Después Operación confirma el pago, corre el dictamen y certifica
// (app/panel/ValidacionOperacion.tsx).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { activoId } = await req.json().catch(() => ({}))
    if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

    const { data } = await s.admin.from('activos')
      .select('id, nombre, municipio, usuario_id, broker_id, folio_real, clave_catastral, escritura_publica, gravamenes_conocidos, uso_suelo_declarado')
      .eq('id', activoId).maybeSingle()
    const activo = data as ({ nombre: string; municipio: string; usuario_id: string; broker_id: string | null } & ActivoExpediente) | null
    if (!activo || !puedeAccederActivo(activo, s.uid)) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
    }

    const faltantes = documentosFaltantes(activo)
    if (faltantes.length) {
      return NextResponse.json({ error: 'Completa el expediente antes de pedir la certificación', faltantes }, { status: 422 })
    }

    const { data: abierta } = await s.admin.from('certificaciones').select('id, estado')
      .eq('activo_id', activoId).in('estado', ['solicitada', 'pagada']).maybeSingle()
    if (abierta) return NextResponse.json({ ok: true, certificacion: abierta, yaExistia: true })

    const { data: nueva, error } = await s.admin.from('certificaciones')
      .insert({ activo_id: activoId, solicitado_por: s.uid })
      .select('id, estado').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    after(() => avisarOperacion({
      asunto: `Certificación solicitada · ${activo.nombre}`,
      titulo: 'Solicitaron una certificación legal',
      lineas: [
        `Propiedad: ${activo.nombre} (${activo.municipio}). El expediente está completo.`,
        'Siguiente paso: confirmar el pago (o cortesía Pionero) y correr el dictamen.',
      ],
      enlace: { texto: 'Abrir certificaciones en /panel', ruta: '/panel' },
    }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true, certificacion: nueva, yaExistia: false })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
