import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { municipioCanonico } from '@/lib/matching'
import { documentosFaltantes } from '@/lib/expediente'

// Oportunidades: el propietario elige un broker certificado (Documento Maestro V6.3, §15;
// migración 20261008000400_oportunidades.sql). Toda la escritura pasa por aquí.
//
// GET  → para el broker: las oportunidades que ha recibido, con los datos públicos del activo y un
//        resumen del diagnóstico rápido (para decidir si la toma). Aún no representa el activo, así
//        que la RLS no se lo deja leer: se arma con service_role y solo columnas públicas.
// POST → {activoId, brokerId}: el propietario ofrece su activo a un broker. Se revalida aquí que el
//        broker sea elegible (zona, nivel ≥ Plata, mismo mundo); nunca se confía en el navegador.
//
// Aceptar o rechazar: app/api/oportunidades/[id]/route.ts.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'broker') return NextResponse.json({ error: 'Solo para brokers' }, { status: 403 })

    const { data: ops } = await s.admin.from('oportunidades')
      .select('id, activo_id, estado, created_at, respondida_at').eq('broker_id', s.uid).order('created_at', { ascending: false })
    const lista = (ops as { id: string; activo_id: string; estado: string; created_at: string; respondida_at: string | null }[]) || []
    if (!lista.length) return NextResponse.json({ oportunidades: [] })

    const ids = lista.map((o) => o.activo_id)
    const [{ data: activos }, { data: mercado }] = await Promise.all([
      s.admin.from('activos')
        .select('id, nombre, tipo, municipio, colonia, estado, superficie, precio_total, folio_real, clave_catastral, escritura_publica, gravamenes_conocidos, uso_suelo_declarado')
        .in('id', ids),
      s.admin.from('diagnosticos').select('activo_id, resultado, created_at').eq('agente', 'mercado').in('activo_id', ids)
        .order('created_at', { ascending: false }),
    ])
    const A = (activos as (Record<string, string | number | null> & { id: string })[]) || []
    const M = (mercado as { activo_id: string; resultado: { precioSalidaRecomendadoMXN?: number | null; comparablesAnalizados?: number } }[]) || []

    return NextResponse.json({
      oportunidades: lista.map((o) => {
        const a = A.find((x) => x.id === o.activo_id)
        const m = M.find((x) => x.activo_id === o.activo_id)?.resultado
        return {
          ...o,
          activo: a && {
            id: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, colonia: a.colonia, estado: a.estado,
            superficie: a.superficie, precio_total: a.precio_total,
          },
          diagnostico: a && {
            precioSalidaRecomendadoMXN: m?.precioSalidaRecomendadoMXN ?? null,
            comparables: m?.comparablesAnalizados ?? null,
            documentosFaltantes: documentosFaltantes(a as Parameters<typeof documentosFaltantes>[0]).map((f) => f.documento),
          },
        }
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { activoId, brokerId } = await req.json().catch(() => ({}))
    if (!activoId || !brokerId) return NextResponse.json({ error: 'Faltan activoId y brokerId' }, { status: 400 })

    const { data } = await s.admin.from('activos').select('id, usuario_id, broker_id, municipio').eq('id', activoId).maybeSingle()
    const activo = data as { usuario_id: string; broker_id: string | null; municipio: string | null } | null
    if (!activo || activo.usuario_id !== s.uid) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
    if (activo.broker_id) return NextResponse.json({ error: 'Este activo ya tiene broker' }, { status: 409 })

    const broker = (await perfilesBrokers(s.admin, s.esDemo)).find((b) => b.id === brokerId)
    const elegible = broker && broker.id !== s.uid && broker.municipios.has(municipioCanonico(activo.municipio))
      && ORDEN_NIVEL[broker.nivel.id] >= ORDEN_NIVEL.plata
    if (!elegible) return NextResponse.json({ error: 'Ese broker no está disponible para esta propiedad' }, { status: 422 })

    const { data: nueva, error } = await s.admin.from('oportunidades')
      .insert({ activo_id: activoId, propietario_id: s.uid, broker_id: brokerId })
      .select('id, broker_id, estado, created_at').single()
    if (error) {
      // 23505: ya hay una oportunidad abierta para este activo (índice único parcial).
      if (error.code === '23505') return NextResponse.json({ error: 'Ya estás esperando la respuesta de un broker' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, oportunidad: nueva })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
