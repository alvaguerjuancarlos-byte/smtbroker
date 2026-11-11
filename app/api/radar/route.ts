import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilDelComprador } from '@/lib/radarServidor'
import { avisarOperacion } from '@/lib/avisos'
import { estadoParaComprador, normalizarLiga, type EstadoInvitacion } from '@/lib/radar'
import { leerYGuardar } from '@/lib/lecturaAnuncioServidor'

// Radar de mercado del comprador que va por su cuenta (Documento Maestro V7.1 §18, fase 1).
//   GET  -> sus opciones del Radar (las que pegó él y las que le agregó Operación), NO certificadas.
//   POST -> {url, nota?}: pega la liga de un anuncio que vio. Cuenta como "me interesa": Operación
//           invita al anunciante a certificar. V8 (opción 2): la plataforma lee ese anuncio en segundo plano
//           (precio, m², colonia; lib/lecturaAnuncioServidor.ts) para poder analizarlo.
// El comprador con broker no tiene Radar: su broker busca por él (§17). Nunca se le devuelve el
// contacto del anunciante.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

const LIMITE_POR_DIA = 10

interface Opcion {
  id: string; origen: string; nota: string | null; interesado_at: string | null; created_at: string
  radar_anuncios: {
    url: string; fuente: string; titulo: string | null; precio: number | null; tipo: string | null; municipio: string | null
    invitacion_estado: EstadoInvitacion; activo_id: string | null
  }
}

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const r = await perfilDelComprador(s)
    if ('error' in r) return r.error

    const { data } = await s.admin.from('radar_opciones')
      .select('id, origen, nota, interesado_at, created_at, radar_anuncios(url, fuente, titulo, precio, tipo, municipio, invitacion_estado, activo_id)')
      .eq('perfil_id', r.perfilId).order('created_at', { ascending: false })
    const ops = (data as unknown as Opcion[]) || []
    const activos = ops.flatMap((o) => (o.radar_anuncios.activo_id ? [o.radar_anuncios.activo_id] : []))
    const { data: certs } = activos.length
      ? await s.admin.from('certificaciones').select('activo_id').in('activo_id', activos).eq('estado', 'certificada')
      : { data: [] }
    const certificados = new Set(((certs as { activo_id: string }[]) || []).map((c) => c.activo_id))

    return NextResponse.json({
      opciones: ops.map((o) => {
        const a = o.radar_anuncios
        const certificada = !!a.activo_id && certificados.has(a.activo_id)
        return {
          id: o.id, origen: o.origen, nota: o.nota, interesado: !!o.interesado_at,
          url: a.url, fuente: a.fuente, titulo: a.titulo, precio: a.precio, tipo: a.tipo, municipio: a.municipio,
          certificada, estado: estadoParaComprador({ interesado: !!o.interesado_at, invitacion: a.invitacion_estado, certificada }),
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
    const r = await perfilDelComprador(s)
    if ('error' in r) return r.error

    const body = await req.json().catch(() => ({}))
    const liga = normalizarLiga(typeof body.url === 'string' ? body.url : '')
    if (!liga) return NextResponse.json({ error: 'Pega la liga completa del anuncio (empieza con https://)' }, { status: 400 })
    const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 300) || null : null

    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { count } = await s.admin.from('radar_opciones').select('id', { count: 'exact', head: true })
      .eq('perfil_id', r.perfilId).eq('origen', 'comprador').gte('created_at', desde)
    if ((count ?? 0) >= LIMITE_POR_DIA) return NextResponse.json({ error: `Máximo ${LIMITE_POR_DIA} ligas por día` }, { status: 429 })

    // Un anuncio por liga (y por mundo): si otro comprador ya lo pegó, se suma a la misma invitación.
    const { data: existente } = await s.admin.from('radar_anuncios').select('id, invitacion_estado')
      .eq('url', liga.url).eq('es_demo', s.esDemo).maybeSingle()
    let anuncio = existente as { id: string; invitacion_estado: EstadoInvitacion } | null
    if (!anuncio) {
      const { data, error } = await s.admin.from('radar_anuncios')
        .insert({ url: liga.url, fuente: liga.fuente, es_demo: s.esDemo, invitacion_estado: 'pendiente' })
        .select('id, invitacion_estado').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      anuncio = data as { id: string; invitacion_estado: EstadoInvitacion }
    } else if (anuncio.invitacion_estado === 'sin_invitar') {
      await s.admin.from('radar_anuncios').update({ invitacion_estado: 'pendiente', actualizado_at: new Date().toISOString() }).eq('id', anuncio.id)
    }

    const { error } = await s.admin.from('radar_opciones').upsert({
      perfil_id: r.perfilId, anuncio_id: anuncio.id, origen: 'comprador', nota, interesado_at: new Date().toISOString(),
    }, { onConflict: 'perfil_id,anuncio_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    after(() => leerYGuardar(s.admin, anuncio!.id).then(() => undefined))
    after(() => avisarOperacion({
      asunto: `Radar: un comprador pegó un anuncio de ${liga.fuente}`,
      titulo: 'Hay un anuncio por invitar a certificar',
      lineas: [`Liga: ${liga.url}`, ...(nota ? [`Nota del comprador: ${nota}`] : [])],
      enlace: { texto: 'Abrir el Radar en la consola', ruta: '/panel#radar' },
    }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
