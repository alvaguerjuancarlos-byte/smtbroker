import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarUsuario } from '@/lib/avisos'
import { CANALES, ESTADOS_INVITACION, INVITACION_CERRADA, mensajeInvitacion, normalizarLiga, type EstadoInvitacion } from '@/lib/radar'

// Radar de mercado desde la consola de Operación (Documento Maestro V7.1 §18, fase 1 asistida).
//   GET   -> anuncios con sus compradores interesados, más los compradores por su cuenta (para
//            agregarles opciones) y el mensaje de invitación listo para copiar.
//   POST  -> {perfilId, url, titulo?, precio?, tipo?, municipio?}: Operación agrega una opción que
//            encontró a mano al Radar de un comprador por su cuenta.
//   PATCH -> {anuncioId, ...}: datos del anuncio, contacto del anunciante e invitación. Al cerrar la
//            invitación se borra el contacto; si acepta, se avisa a los compradores interesados.
// Solo Operación y solo en su mundo (lib/mundo.ts).

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }
const SITIO = (process.env.NEXT_PUBLIC_SITE_URL || 'https://smtbroker.vercel.app').replace(/\/$/, '')
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const numero = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : undefined)

interface Anuncio {
  id: string; url: string; fuente: string; titulo: string | null; precio: number | null; tipo: string | null; municipio: string | null
  anunciante_contacto: string | null; invitacion_estado: EstadoInvitacion; invitacion_canal: string | null
  invitacion_enviada_at: string | null; activo_id: string | null; created_at: string
}
interface Opcion { anuncio_id: string; perfil_id: string; origen: string; nota: string | null; interesado_at: string | null }

async function operacion(req: NextRequest) {
  const s = await sesionServidor(req)
  if (!s) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  if (!s.esOperacion) return { error: NextResponse.json({ error: 'Solo Operación' }, { status: 403 }) }
  return { s }
}

export async function GET(req: NextRequest) {
  try {
    const o = await operacion(req)
    if ('error' in o) return o.error
    const { s } = o
    const [{ data: an }, { data: perfiles }] = await Promise.all([
      s.admin.from('radar_anuncios').select('*').eq('es_demo', s.esDemo).order('actualizado_at', { ascending: false }),
      s.admin.from('perfiles_intencion').select('id, usuario_id, presupuesto, zona, tipo_activo_interes')
        .eq('es_demo', s.esDemo).not('usuario_id', 'is', null).is('representado_por', null),
    ])
    const anuncios = (an as Anuncio[]) || []
    const P = (perfiles as { id: string; usuario_id: string; presupuesto: string | null; zona: string | null; tipo_activo_interes: string | null }[]) || []
    const { data: ops } = anuncios.length
      ? await s.admin.from('radar_opciones').select('anuncio_id, perfil_id, origen, nota, interesado_at').in('anuncio_id', anuncios.map((a) => a.id))
      : { data: [] }
    const { data: us } = P.length ? await s.admin.from('usuarios').select('id, nombre').in('id', P.map((p) => p.usuario_id)) : { data: [] }
    const nombreDe = new Map(((us as { id: string; nombre: string | null }[]) || []).map((u) => [u.id, u.nombre || 'Comprador']))
    const perfilDe = new Map(P.map((p) => [p.id, p]))
    const O = (ops as Opcion[]) || []

    return NextResponse.json({
      anuncios: anuncios.map((a) => {
        const suyas = O.filter((x) => x.anuncio_id === a.id)
        const interesados = suyas.filter((x) => x.interesado_at)
        return {
          ...a,
          compradores: suyas.map((x) => ({
            nombre: nombreDe.get(perfilDe.get(x.perfil_id)?.usuario_id ?? '') ?? 'Comprador', origen: x.origen, nota: x.nota, interesado: !!x.interesado_at,
          })),
          interesados: interesados.length,
          mensaje: mensajeInvitacion(a, Math.max(1, interesados.length), SITIO),
        }
      }),
      compradores: P.map((p) => ({
        perfilId: p.id, nombre: nombreDe.get(p.usuario_id) ?? 'Comprador',
        busca: [p.tipo_activo_interes, p.zona, p.presupuesto].filter(Boolean).join(' · '),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const o = await operacion(req)
    if ('error' in o) return o.error
    const { s } = o
    const body = await req.json().catch(() => ({}))
    const liga = normalizarLiga(typeof body.url === 'string' ? body.url : '')
    if (!liga) return NextResponse.json({ error: 'Liga inválida' }, { status: 400 })
    const precio = numero(body.precio)
    if (precio === undefined) return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })

    const { data: p } = await s.admin.from('perfiles_intencion').select('id, usuario_id, representado_por, es_demo').eq('id', body.perfilId ?? '').maybeSingle()
    const perfil = p as { usuario_id: string | null; representado_por: string | null; es_demo: boolean } | null
    if (!perfil || perfil.es_demo !== s.esDemo) return NextResponse.json({ error: 'Comprador no encontrado' }, { status: 404 })
    // Regla 2 de §17: al cliente de un broker no se le ofrece nada directo; su broker busca por él.
    if (!perfil.usuario_id || perfil.representado_por) return NextResponse.json({ error: 'Ese comprador tiene broker' }, { status: 409 })

    const datos = { titulo: texto(body.titulo, 160), precio, tipo: texto(body.tipo, 40), municipio: texto(body.municipio, 80) }
    const { data: ex } = await s.admin.from('radar_anuncios').select('id').eq('url', liga.url).eq('es_demo', s.esDemo).maybeSingle()
    let anuncioId = (ex as { id: string } | null)?.id
    if (!anuncioId) {
      const { data, error } = await s.admin.from('radar_anuncios')
        .insert({ url: liga.url, fuente: liga.fuente, es_demo: s.esDemo, ...datos }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      anuncioId = (data as { id: string }).id
    }
    const { error } = await s.admin.from('radar_opciones').upsert(
      { perfil_id: body.perfilId, anuncio_id: anuncioId, origen: 'operacion' },
      { onConflict: 'perfil_id,anuncio_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, anuncioId })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const o = await operacion(req)
    if ('error' in o) return o.error
    const { s } = o
    const body = await req.json().catch(() => ({}))
    const { data: a } = await s.admin.from('radar_anuncios').select('*').eq('id', body.anuncioId ?? '').maybeSingle()
    const anuncio = a as (Anuncio & { es_demo: boolean }) | null
    if (!anuncio || anuncio.es_demo !== s.esDemo) return NextResponse.json({ error: 'Anuncio no encontrado' }, { status: 404 })

    const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString() }
    for (const [k, max] of [['titulo', 160], ['tipo', 40], ['municipio', 80], ['anunciante_contacto', 200]] as const) {
      if (k in body) cambios[k] = texto(body[k], max)
    }
    if ('precio' in body) {
      const precio = numero(body.precio)
      if (precio === undefined) return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })
      cambios.precio = precio
    }
    if ('invitacion_canal' in body) {
      if (body.invitacion_canal && !CANALES.includes(body.invitacion_canal)) return NextResponse.json({ error: 'Canal inválido' }, { status: 400 })
      cambios.invitacion_canal = body.invitacion_canal || null
    }
    const estado = body.invitacion_estado as EstadoInvitacion | undefined
    if (estado !== undefined) {
      if (!ESTADOS_INVITACION.includes(estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
      cambios.invitacion_estado = estado
      if (estado === 'enviada' && !anuncio.invitacion_enviada_at) cambios.invitacion_enviada_at = new Date().toISOString()
      // El contacto del anunciante solo vive mientras dura la invitación (§18).
      if (INVITACION_CERRADA.includes(estado)) cambios.anunciante_contacto = null
    }
    if ('activo_id' in body) {
      if (body.activo_id) {
        const { data: act } = await s.admin.from('activos').select('id, es_demo').eq('id', body.activo_id).maybeSingle()
        if (!act || (act as { es_demo: boolean }).es_demo !== s.esDemo) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
      }
      cambios.activo_id = body.activo_id || null
    }

    const { error } = await s.admin.from('radar_anuncios').update(cambios).eq('id', anuncio.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (estado === 'aceptada' && anuncio.invitacion_estado !== 'aceptada') {
      const { data: ops } = await s.admin.from('radar_opciones').select('perfiles_intencion(usuario_id)')
        .eq('anuncio_id', anuncio.id).not('interesado_at', 'is', null)
      const ids = ((ops as unknown as { perfiles_intencion: { usuario_id: string | null } | null }[]) || [])
        .flatMap((x) => (x.perfiles_intencion?.usuario_id ? [x.perfiles_intencion.usuario_id] : []))
      const nombre = anuncio.titulo ?? `el anuncio de ${anuncio.fuente}`
      after(async () => {
        for (const uid of ids) {
          await avisarUsuario(s.admin, uid, {
            asunto: `El anunciante aceptó certificar ${nombre}`,
            titulo: 'Una propiedad de tu Radar se va a certificar',
            lineas: [`${nombre} entra al proceso de certificación: precio de mercado y revisión de documentos.`,
              'Cuando quede certificada aparecerá en tus coincidencias y podrás pedir la conexión.'],
            enlace: { texto: 'Ver mi Radar', ruta: '/portal-inversion' },
          }, { esDemo: s.esDemo })
        }
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
