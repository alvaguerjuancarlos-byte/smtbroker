import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { municipioCanonico } from '@/lib/matching'

// Brokers certificados de la zona de un activo (Documento Maestro V6.3, §15). Solo para el DUEÑO
// de un activo que todavía no tiene broker. Devuelve solo desempeño público -- nombre, nivel,
// propiedades certificadas y cierres verificados --, nunca teléfono ni correo: el contacto lo
// inicia el broker al aceptar la oportunidad.
//   - Zona: municipios donde el broker tiene propiedades (lib/nivelServidor.ts).
//   - Nivel Plata o más (los Pioneros ya cuentan como Plata). Aliado nunca se muestra (§15).
//   - Mismo mundo (demo/real) que el propietario.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { activoId } = await req.json().catch(() => ({}))
    if (!activoId) return NextResponse.json({ error: 'Falta activoId' }, { status: 400 })

    const { data } = await s.admin.from('activos').select('id, usuario_id, broker_id, municipio').eq('id', activoId).maybeSingle()
    const activo = data as { usuario_id: string; broker_id: string | null; municipio: string | null } | null
    if (!activo || activo.usuario_id !== s.uid) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
    if (activo.broker_id) return NextResponse.json({ error: 'Este activo ya tiene broker' }, { status: 409 })

    const zona = municipioCanonico(activo.municipio)
    const brokers = (await perfilesBrokers(s.admin, s.esDemo))
      .filter((b) => b.id !== s.uid && b.municipios.has(zona) && ORDEN_NIVEL[b.nivel.id] >= ORDEN_NIVEL.plata)
      .sort((a, b) => (ORDEN_NIVEL[b.nivel.id] - ORDEN_NIVEL[a.nivel.id])
        || (b.cierresVerificados - a.cierresVerificados) || (b.certificadas - a.certificadas))
      .map((b) => ({
        id: b.id, nombre: b.nombre, nivel: b.nivel.nombre, pionero: b.pionero,
        certificadas: b.certificadas, cierresVerificados: b.cierresVerificados, propiedades: b.propiedades,
      }))

    const { data: ops } = await s.admin.from('oportunidades')
      .select('id, broker_id, estado, created_at, respondida_at').eq('activo_id', activoId).order('created_at', { ascending: false })
    return NextResponse.json({ zona, brokers, oportunidades: ops ?? [] })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
