import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { municipioCanonico } from '@/lib/matching'

// Brokers verificados de la zona de un cliente sin broker (Documento Maestro V6.3 §15; V7: por
// ambos lados). Body: {activoId} para el DUEÑO de un activo sin broker, o {perfilId} para el
// COMPRADOR que llegó directo (su perfil de búsqueda) y aún no tiene broker. Devuelve solo
// desempeño público -- nombre, nivel, propiedades certificadas y cierres verificados --, nunca
// teléfono ni correo: el contacto lo inicia el broker al aceptar la oportunidad.
//   - Zona: municipios donde el broker tiene propiedades (lib/nivelServidor.ts). Para el
//     comprador, la zona que escribió en su perfil.
//   - Nivel Plata o más (los Pioneros ya cuentan como Plata). Aliado nunca se muestra (§15).
//   - Mismo mundo (demo/real) que el cliente.
// Si el comprador ya tiene broker responde {asignado} con su perfil público, para mostrarlo.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { activoId, perfilId } = await req.json().catch(() => ({}))
    if (!activoId && !perfilId) return NextResponse.json({ error: 'Falta activoId o perfilId' }, { status: 400 })

    let zonaCruda: string | null
    let asignadoId: string | null = null
    if (activoId) {
      const { data } = await s.admin.from('activos').select('id, usuario_id, broker_id, municipio').eq('id', activoId).maybeSingle()
      const activo = data as { usuario_id: string; broker_id: string | null; municipio: string | null } | null
      if (!activo || activo.usuario_id !== s.uid) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
      if (activo.broker_id) return NextResponse.json({ error: 'Este activo ya tiene broker' }, { status: 409 })
      zonaCruda = activo.municipio
    } else {
      const { data } = await s.admin.from('perfiles_intencion').select('id, usuario_id, zona, representado_por').eq('id', perfilId).maybeSingle()
      const perfil = data as { usuario_id: string | null; zona: string | null; representado_por: string | null } | null
      if (!perfil || perfil.usuario_id !== s.uid) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
      zonaCruda = perfil.zona
      asignadoId = perfil.representado_por
    }

    const zona = municipioCanonico(zonaCruda)
    const todos = await perfilesBrokers(s.admin, s.esDemo)
    const publico = (b: (typeof todos)[number]) => ({
      id: b.id, nombre: b.nombre, nivel: b.nivel.nombre, pionero: b.pionero,
      certificadas: b.certificadas, cierresVerificados: b.cierresVerificados, propiedades: b.propiedades,
    })
    if (asignadoId) {
      const b = todos.find((x) => x.id === asignadoId)
      return NextResponse.json({ zona, asignado: b ? publico(b) : { id: asignadoId, nombre: 'Tu broker' }, brokers: [], oportunidades: [] })
    }

    const brokers = todos
      .filter((b) => b.id !== s.uid && b.municipios.has(zona) && ORDEN_NIVEL[b.nivel.id] >= ORDEN_NIVEL.plata)
      .sort((a, b) => (ORDEN_NIVEL[b.nivel.id] - ORDEN_NIVEL[a.nivel.id])
        || (b.cierresVerificados - a.cierresVerificados) || (b.certificadas - a.certificadas))
      .map(publico)

    const { data: ops } = await s.admin.from('oportunidades')
      .select('id, broker_id, estado, created_at, respondida_at')
      .eq(activoId ? 'activo_id' : 'perfil_id', activoId ?? perfilId).order('created_at', { ascending: false })
    return NextResponse.json({ zona, brokers, oportunidades: ops ?? [] })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
