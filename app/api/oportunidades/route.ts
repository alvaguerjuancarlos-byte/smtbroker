import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { perfilesBrokers } from '@/lib/nivelServidor'
import { ORDEN_NIVEL } from '@/lib/nivelesBroker'
import { municipioCanonico } from '@/lib/matching'
import { documentosFaltantes } from '@/lib/expediente'
import { avisarUsuario } from '@/lib/avisos'

// Oportunidades: el cliente elige un broker verificado (Documento Maestro V6.3 §15; V7: por
// ambos lados; migraciones 20261008000400 y 20261031000000). Toda la escritura pasa por aquí.
// Una oportunidad es de un ACTIVO (el propietario elige quién lo representa) o de un PERFIL de
// búsqueda (el comprador que llegó directo elige quién lo representa).
//
// GET  → para el broker: las oportunidades que ha recibido. De un activo, sus datos públicos y un
//        resumen del diagnóstico rápido; de un comprador, lo que busca y, solo si ya la aceptó,
//        su nombre y correo (decisión de JC 2026-10-31: el comprador lo eligió para que lo
//        represente). Aún no representa al cliente, así que la RLS no se lo deja leer: se arma
//        con service_role y solo columnas públicas.
// POST → {activoId | perfilId, brokerId}: el cliente se ofrece a un broker. Se revalida aquí que el
//        broker sea elegible (zona, nivel ≥ Plata, mismo mundo); nunca se confía en el navegador.
//
// Aceptar o rechazar: app/api/oportunidades/[id]/route.ts.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

interface Op { id: string; activo_id: string | null; perfil_id: string | null; estado: string; created_at: string; respondida_at: string | null }
interface PerfilOp {
  id: string; usuario_id: string | null; presupuesto: string | null; zona: string | null
  tipo_activo_interes: string | null; tesis_inversion: string | null
}

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'broker') return NextResponse.json({ error: 'Solo para brokers' }, { status: 403 })

    const { data: ops } = await s.admin.from('oportunidades')
      .select('id, activo_id, perfil_id, estado, created_at, respondida_at').eq('broker_id', s.uid).order('created_at', { ascending: false })
    const lista = (ops as Op[]) || []
    if (!lista.length) return NextResponse.json({ oportunidades: [] })

    const idsActivo = lista.flatMap((o) => (o.activo_id ? [o.activo_id] : []))
    const idsPerfil = lista.flatMap((o) => (o.perfil_id ? [o.perfil_id] : []))
    const [{ data: activos }, { data: mercado }, { data: perfiles }] = await Promise.all([
      s.admin.from('activos')
        .select('id, nombre, tipo, municipio, colonia, estado, superficie, precio_total, folio_real, clave_catastral, escritura_publica, gravamenes_conocidos, uso_suelo_declarado')
        .in('id', idsActivo),
      s.admin.from('diagnosticos').select('activo_id, resultado, created_at').eq('agente', 'mercado').in('activo_id', idsActivo)
        .order('created_at', { ascending: false }),
      s.admin.from('perfiles_intencion').select('id, usuario_id, presupuesto, zona, tipo_activo_interes, tesis_inversion').in('id', idsPerfil),
    ])
    const A = (activos as (Record<string, string | number | null> & { id: string })[]) || []
    const M = (mercado as { activo_id: string; resultado: { precioSalidaRecomendadoMXN?: number | null; comparablesAnalizados?: number } }[]) || []
    const P = (perfiles as PerfilOp[]) || []

    // Nombre y correo del comprador: solo de las oportunidades ya aceptadas.
    const contactoDe = new Map<string, { nombre: string; correo: string | null }>()
    for (const o of lista) {
      const p = P.find((x) => x.id === o.perfil_id)
      if (o.estado !== 'aceptada' || !p?.usuario_id || contactoDe.has(p.usuario_id)) continue
      const [{ data: u }, { data: auth }] = await Promise.all([
        s.admin.from('usuarios').select('nombre').eq('id', p.usuario_id).maybeSingle(),
        s.admin.auth.admin.getUserById(p.usuario_id),
      ])
      contactoDe.set(p.usuario_id, { nombre: (u as { nombre: string | null } | null)?.nombre || 'Comprador', correo: auth?.user?.email ?? null })
    }

    return NextResponse.json({
      oportunidades: lista.map((o) => {
        if (o.perfil_id) {
          const p = P.find((x) => x.id === o.perfil_id)
          return {
            ...o, tipo: 'comprador' as const,
            comprador: p && {
              presupuesto: p.presupuesto, zona: p.zona, tipo: p.tipo_activo_interes, queBusca: p.tesis_inversion,
              contacto: (p.usuario_id && contactoDe.get(p.usuario_id)) || null,
            },
          }
        }
        const a = A.find((x) => x.id === o.activo_id)
        const m = M.find((x) => x.activo_id === o.activo_id)?.resultado
        return {
          ...o, tipo: 'propiedad' as const,
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
    const { activoId, perfilId, brokerId } = await req.json().catch(() => ({}))
    if ((!activoId && !perfilId) || !brokerId) return NextResponse.json({ error: 'Faltan activoId o perfilId, y brokerId' }, { status: 400 })

    // Quién se ofrece y en qué zona: el dueño con su activo, o el comprador con su perfil.
    let zona: string
    let aviso: { asunto: string; titulo: string; lineas: string[] }
    if (activoId) {
      const { data } = await s.admin.from('activos').select('id, nombre, tipo, usuario_id, broker_id, municipio').eq('id', activoId).maybeSingle()
      const activo = data as { nombre: string; tipo: string; usuario_id: string; broker_id: string | null; municipio: string | null } | null
      if (!activo || activo.usuario_id !== s.uid) return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
      if (activo.broker_id) return NextResponse.json({ error: 'Este activo ya tiene broker' }, { status: 409 })
      zona = municipioCanonico(activo.municipio)
      aviso = {
        asunto: `Nueva oportunidad: ${activo.nombre}`,
        titulo: 'Un propietario te eligió para representar su propiedad',
        lineas: [
          `${activo.tipo} en ${activo.municipio}: ${activo.nombre}.`,
          'Te eligió por tu nivel de Broker Verificado SMT. Acéptala o recházala desde tu portal.',
        ],
      }
    } else {
      const { data } = await s.admin.from('perfiles_intencion').select('id, usuario_id, zona, presupuesto, tipo_activo_interes, representado_por').eq('id', perfilId).maybeSingle()
      const perfil = data as { usuario_id: string | null; zona: string | null; presupuesto: string | null; tipo_activo_interes: string | null; representado_por: string | null } | null
      if (!perfil || perfil.usuario_id !== s.uid) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
      if (perfil.representado_por) return NextResponse.json({ error: 'Ya tienes un broker que te representa' }, { status: 409 })
      zona = municipioCanonico(perfil.zona)
      aviso = {
        asunto: 'Nueva oportunidad: un comprador te eligió',
        titulo: 'Un comprador te eligió para representarlo',
        lineas: [
          `Busca ${perfil.tipo_activo_interes || 'propiedad'} en ${perfil.zona || 'tu zona'}${perfil.presupuesto ? `, presupuesto ${perfil.presupuesto}` : ''}.`,
          'Te eligió por tu nivel de Broker Verificado SMT. Acéptalo o recházalo desde tu portal.',
        ],
      }
    }

    const broker = (await perfilesBrokers(s.admin, s.esDemo)).find((b) => b.id === brokerId)
    const elegible = broker && broker.id !== s.uid && broker.municipios.has(zona)
      && ORDEN_NIVEL[broker.nivel.id] >= ORDEN_NIVEL.plata
    if (!elegible) return NextResponse.json({ error: 'Ese broker no está disponible en tu zona' }, { status: 422 })

    const { data: nueva, error } = await s.admin.from('oportunidades')
      .insert({ activo_id: activoId ?? null, perfil_id: activoId ? null : perfilId, propietario_id: s.uid, broker_id: brokerId })
      .select('id, broker_id, estado, created_at').single()
    if (error) {
      // 23505: ya hay una oportunidad abierta para este activo o perfil (índices únicos parciales).
      if (error.code === '23505') return NextResponse.json({ error: 'Ya estás esperando la respuesta de un broker' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    after(() => avisarUsuario(s.admin, brokerId, { ...aviso, enlace: { texto: 'Ver la oportunidad', ruta: '/portal-broker' } }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true, oportunidad: nueva })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
