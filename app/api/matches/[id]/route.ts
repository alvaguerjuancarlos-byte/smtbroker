import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarUsuario } from '@/lib/avisos'
import { atiendeComprador, atiendeVendedor, contactoDe, type Contacto } from '@/lib/contactoConexion'
import { mismoMundo } from '@/lib/mundo'

// Operación decide sobre una solicitud de conexión: {estado: 'en_contacto' | 'descartado' | 'cerrado'}.
// V7.1 (Documento Maestro §15, decisión (a) de JC): al ponerla en contacto, cada lado recibe por
// correo el contacto de quien atiende el otro lado -- su broker o, si va por su cuenta, el cliente
// mismo -- y lo ve también en su portal (app/api/matches GET). A quien va sin broker se le sugiere
// uno para visitas, negociación y cierre: hasta aquí acompaña la plataforma.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

const ESTADOS = ['en_contacto', 'descartado', 'cerrado']

export async function POST(req: NextRequest, ctx: RouteContext<'/api/matches/[id]'>) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!s.esOperacion) return NextResponse.json({ error: 'Solo Operación valida conexiones' }, { status: 403 })
    const { id } = await ctx.params
    const { estado } = await req.json().catch(() => ({}))
    if (!ESTADOS.includes(estado)) return NextResponse.json({ error: `estado debe ser ${ESTADOS.join(', ')}` }, { status: 400 })

    const { data: m } = await s.admin.from('matches').select('id, activo_id, perfil_id, estado').eq('id', id).maybeSingle()
    const match = m as { activo_id: string; perfil_id: string; estado: string } | null
    if (!match) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    const [{ data: a }, { data: p }] = await Promise.all([
      s.admin.from('activos').select('id, nombre, broker_id, usuario_id, es_demo').eq('id', match.activo_id).single(),
      s.admin.from('perfiles_intencion').select('broker_id, usuario_id, representado_por').eq('id', match.perfil_id).single(),
    ])
    const activo = a as { id: string; nombre: string; broker_id: string | null; usuario_id: string; es_demo: boolean }
    const perfil = p as { broker_id: string | null; usuario_id: string | null; representado_por: string | null }
    if (!mismoMundo(s.esDemo, activo.es_demo)) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (estado === 'en_contacto' && match.estado !== 'solicitado') {
      return NextResponse.json({ error: 'Solo una solicitud pendiente se puede poner en contacto' }, { status: 409 })
    }

    const { error } = await s.admin.from('matches').update({ estado, actualizado_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (estado === 'en_contacto') {
      const vendedor = atiendeVendedor(activo)
      const comprador = atiendeComprador(perfil)
      const [cV, cC] = await Promise.all([contactoDe(s.admin, vendedor), contactoDe(s.admin, comprador)])
      const datos = (c: Contacto) => `${c.nombre}${c.esBroker ? ' (broker)' : ''}${c.correo ? ` · ${c.correo}` : ''}`
      const sugerencia = 'Vas por tu cuenta: si quieres que alguien te acompañe en visitas, negociación y cierre, puedes elegir un broker en la plataforma.'
      after(async () => {
        await avisarUsuario(s.admin, vendedor.id, {
          asunto: `Conexión validada · ${activo.nombre}`,
          titulo: 'Te pusimos en contacto con un comprador',
          lineas: [`Propiedad: ${activo.nombre}.`, `Contacto del lado comprador: ${datos(cC)}.`, ...(vendedor.esBroker ? [] : [sugerencia])],
          enlace: { texto: 'Ver la conexión', ruta: vendedor.esBroker ? '/portal-broker' : `/activo/${activo.id}/leads` },
        }, { esDemo: activo.es_demo })
        await avisarUsuario(s.admin, comprador.id, {
          asunto: `Conexión validada · ${activo.nombre}`,
          titulo: 'Te pusimos en contacto con el vendedor',
          lineas: [`Propiedad: ${activo.nombre}.`, `Contacto del lado vendedor: ${datos(cV)}.`, ...(comprador.esBroker ? [] : [sugerencia])],
          enlace: { texto: 'Ver la conexión', ruta: comprador.esBroker ? '/portal-broker' : '/portal-inversion' },
        }, { esDemo: activo.es_demo })
      })
    }
    return NextResponse.json({ ok: true, estado })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
