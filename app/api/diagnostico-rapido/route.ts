import { NextRequest, NextResponse } from 'next/server'
import { consultarNormativaReal } from '@smt/shared-realestate'
import { sesionServidor } from '@/lib/sesionServidor'
import { puedeAccederActivo } from '@/lib/accesoActivo'
import { mismoMundo } from '@/lib/mundo'
import { documentosFaltantes, listoParaCertificar, type ActivoExpediente } from '@/lib/expediente'

// Diagnóstico RÁPIDO (Documento Maestro V6.3, §13) — gratis, sin LLM, se calcula en cada visita:
//   - uso de suelo oficial cuando hay GIS municipal (hoy solo San Pedro Garza García, mismo motor
//     que usa el Agente Legal), y
//   - la lista de documentos que faltan para pedir la certificación legal (lib/expediente.ts).
// Junto con el Agente de Mercado (precio con comparables, plusvalía SHF, absorción SNIIV) forma el
// diagnóstico gratis. El dictamen legal completo solo corre dentro de una certificación.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { activoId } = await req.json().catch(() => ({}))
    if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

    const { data } = await s.admin.from('activos')
      .select('id, usuario_id, broker_id, es_demo, municipio, lat, lng, folio_real, clave_catastral, escritura_publica, gravamenes_conocidos, uso_suelo_declarado')
      .eq('id', activoId).maybeSingle()
    const activo = data as (ActivoExpediente & {
      usuario_id: string; broker_id: string | null; es_demo: boolean; municipio: string | null
      lat: number | null; lng: number | null
    }) | null
    const acceso = activo && (puedeAccederActivo(activo, s.uid) || (s.esOperacion && mismoMundo(s.esDemo, activo.es_demo)))
    if (!activo || !acceso) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })

    const esSanPedro = /san\s*pedro/i.test(activo.municipio || '')
    const gis = esSanPedro && typeof activo.lat === 'number' && typeof activo.lng === 'number'
      ? await consultarNormativaReal(activo.lat, activo.lng).catch(() => null)
      : null

    const { data: cert } = await s.admin.from('certificaciones')
      .select('id, estado, created_at, actualizado_at, dictamen_id')
      .eq('activo_id', activoId).order('created_at', { ascending: false }).limit(1).maybeSingle()

    return NextResponse.json({
      usoSuelo: gis?.uso
        ? { uso: gis.uso.uso, descripcion: gis.uso.descripcion, distrito: gis.uso.distrito, fuente: 'GIS municipal de San Pedro Garza García' }
        : null,
      gisDisponible: esSanPedro,
      usoSueloDeclarado: activo.uso_suelo_declarado ?? null,
      faltantes: documentosFaltantes(activo),
      listoParaCertificar: listoParaCertificar(activo),
      certificacion: cert ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
