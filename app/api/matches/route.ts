import { NextRequest, NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { avisarOperacion, avisarUsuario } from '@/lib/avisos'
import { puntuarMatch, esMatchValido, type ResultadoMatch } from '@/lib/matching'
import { mismoMundo } from '@/lib/mundo'
import { atiendeComprador, atiendeVendedor, contactoDe, type Contacto } from '@/lib/contactoConexion'

// Matches v0 (Documento Maestro V6.1, §4 y §6). Corre en el servidor con service_role porque
// cruza datos que la RLS oculta a propósito entre brokers -- por eso esta ruta es la que
// garantiza la privacidad (V6.1 §6.2): de un activo ajeno solo se devuelven las columnas públicas
// de activos_publicos, y de un perfil ajeno solo sus criterios (presupuesto, zona, tipo), NUNCA
// el alias del cliente ni quién es el broker o el comprador de la otra parte.
//
// GET  → sugerencias según el rol (broker: para sus clientes y para su portafolio; comprador:
//        coincidencias con su perfil).
// POST → {activoId, perfilId}: "me interesa conectar". Recalcula el score aquí (nunca confía en
//        el que mande el navegador) y crea la solicitud que Operación valida a mano.
//
// V7.1 (dos caminos): un lado sin broker también se conecta. Cuando Operación pone un match en
// contacto (app/api/matches/[id]), esta ruta le da a cada parte el contacto de quien atiende el
// otro lado -- su broker o, si va por su cuenta, el cliente mismo (lib/contactoConexion.ts).
//
// Mundos (lib/mundo.ts, migración 20261008000000): una cuenta real solo cruza datos reales y una
// cuenta demo solo datos demo -- los brokers del piloto nunca ven a los personajes del video.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

const COLS_ACTIVO = 'id, nombre, tipo, municipio, colonia, estado, superficie, precio_total, status, broker_id, usuario_id, created_at, es_demo'
const COLS_PERFIL = 'id, usuario_id, broker_id, representado_por, alias_cliente, presupuesto, zona, tipo_activo_interes, es_demo'

interface Activo {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; estado: string
  superficie: number | null; precio_total: number | null; status: string | null
  broker_id: string | null; usuario_id: string; created_at: string; es_demo: boolean
}
interface Perfil {
  id: string; usuario_id: string | null; broker_id: string | null; representado_por: string | null; alias_cliente: string | null
  presupuesto: string | null; zona: string | null; tipo_activo_interes: string | null; es_demo: boolean
}

// Lo único que se expone de un activo que no es del usuario: las columnas de activos_publicos.
const activoPublico = (a: Activo) => ({
  id: a.id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, estado: a.estado,
  superficie: a.superficie, precio_total: a.precio_total,
})

const criterios = (p: Perfil) => ({ presupuesto: p.presupuesto, zona: p.zona, tipo: p.tipo_activo_interes })

async function autenticar(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: perfil } = await admin.from('usuarios').select('rol, es_demo').eq('id', data.user.id).single()
  const u = perfil as { rol: string | null; es_demo: boolean | null } | null
  return { uid: data.user.id, rol: u?.rol ?? null, esDemo: !!u?.es_demo, admin }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { uid, rol, esDemo, admin } = auth

    const [{ data: activos }, { data: perfiles }, { data: solicitudes }] = await Promise.all([
      admin.from('activos').select(COLS_ACTIVO).neq('status', 'cerrado').eq('es_demo', esDemo),
      admin.from('perfiles_intencion').select(COLS_PERFIL).eq('es_demo', esDemo),
      admin.from('matches').select('activo_id, perfil_id, estado'),
    ])
    const A = (activos as Activo[]) || []
    const P = (perfiles as Perfil[]) || []
    const estadoDe = new Map(((solicitudes as { activo_id: string; perfil_id: string; estado: string }[]) || [])
      .map((s) => [`${s.activo_id}:${s.perfil_id}`, s.estado]))
    const solicitud = (a: Activo, p: Perfil) => estadoDe.get(`${a.id}:${p.id}`) ?? null
    const valido = (a: Activo, p: Perfil): ResultadoMatch | null => {
      const r = puntuarMatch(a, p)
      return esMatchValido(a, r) ? r : null
    }
    const porScore = <T extends { score: number }>(xs: T[]) => xs.sort((x, y) => y.score - x.score)
    // Contacto de la otra parte, solo en los matches que Operación ya puso en contacto.
    const cache = new Map<string, Promise<Contacto>>()
    const contacto = (lado: { id: string; esBroker: boolean }) => {
      if (!cache.has(lado.id)) cache.set(lado.id, contactoDe(admin, lado))
      return cache.get(lado.id)!
    }
    const conContacto = async <T extends { solicitud: string | null }>(xs: T[], lado: (x: T) => { id: string; esBroker: boolean }) =>
      Promise.all(xs.map(async (x) => (x.solicitud === 'en_contacto' ? { ...x, contacto: await contacto(lado(x)) } : x)))
    const activoDe = new Map(A.map((a) => [a.id, a]))
    const perfilDe = new Map(P.map((p) => [p.id, p]))

    if (rol === 'broker') {
      // Sus clientes: los que registró él (alias) y los compradores directos que lo eligieron (V7).
      const misClientes = P.filter((p) => (p.broker_id === uid && p.usuario_id === null) || p.representado_por === uid)
      const miPortafolio = A.filter((a) => a.broker_id === uid)
      const representados = misClientes.flatMap((p) => (p.representado_por === uid && p.usuario_id ? [p.usuario_id] : []))
      const { data: nombres } = representados.length
        ? await admin.from('usuarios').select('id, nombre').in('id', representados)
        : { data: [] }
      const nombreDe = new Map(((nombres as { id: string; nombre: string | null }[]) || []).map((u) => [u.id, u.nombre || 'Comprador']))
      const aliasDe = (p: Perfil) => p.alias_cliente ?? (p.usuario_id ? nombreDe.get(p.usuario_id) : null) ?? 'Cliente'
      const esMio = (p: Perfil) => (p.broker_id === uid && p.usuario_id === null) || p.representado_por === uid

      const paraMisClientes = porScore(misClientes.flatMap((p) => A.flatMap((a) => {
        const r = valido(a, p)
        if (!r) return []
        const propio = a.broker_id === uid
        return [{
          perfilId: p.id, activoId: a.id, cliente: aliasDe(p), score: r.score, razones: r.razones,
          activo: activoPublico(a),
          representacion: propio ? 'Tu portafolio'
            : a.broker_id ? 'Representada por otro broker de la red' : 'Del propietario, por su cuenta',
          solicitud: solicitud(a, p),
        }]
      })))

      const paraMiPortafolio = porScore(miPortafolio.flatMap((a) => P.flatMap((p) => {
        const r = valido(a, p)
        if (!r) return []
        const contraparte = esMio(p) ? `Tu cliente: ${aliasDe(p)}`
          : p.broker_id || p.representado_por ? 'Cliente de otro broker' : 'Comprador por su cuenta'
        return [{
          activoId: a.id, perfilId: p.id, activo: a.nombre, score: r.score, razones: r.razones,
          contraparte, criterios: criterios(p), solicitud: solicitud(a, p),
        }]
      })))

      return NextResponse.json({
        rol,
        paraMisClientes: await conContacto(paraMisClientes, (x) => atiendeVendedor(activoDe.get(x.activoId)!)),
        paraMiPortafolio: await conContacto(paraMiPortafolio, (x) => atiendeComprador(perfilDe.get(x.perfilId)!)),
      })
    }

    if (rol === 'inversionista') {
      const miPerfil = P.find((p) => p.usuario_id === uid)
      if (!miPerfil) return NextResponse.json({ rol, coincidencias: [], tieneBroker: false })
      const coincidencias = porScore(A.flatMap((a) => {
        const r = valido(a, miPerfil)
        return r ? [{ activoId: a.id, perfilId: miPerfil.id, score: r.score, razones: r.razones, activo: activoPublico(a), solicitud: solicitud(a, miPerfil) }] : []
      }))
      // V7.1: puede conectarse por su cuenta o con el broker que eligió (opcional). Si tiene broker,
      // el contacto del otro lado lo recibe su broker, no él (§17: todo pasa por su broker).
      const tieneBroker = !!miPerfil.representado_por
      return NextResponse.json({
        rol, perfilId: miPerfil.id, tieneBroker,
        coincidencias: tieneBroker ? coincidencias : await conContacto(coincidencias, (x) => atiendeVendedor(activoDe.get(x.activoId)!)),
      })
    }

    // V7.1: el propietario que vende por su cuenta ve los compradores que el motor le conectó. Si su
    // propiedad tiene broker, las conexiones las atiende el broker (no se le da contacto a él).
    if (rol === 'propietario') {
      const mios = A.filter((a) => a.usuario_id === uid && !a.broker_id)
      const conexiones = mios.flatMap((a) => P.flatMap((p) => {
        const est = solicitud(a, p)
        if (!est) return []
        const r = puntuarMatch(a, p)
        return [{ activoId: a.id, perfilId: p.id, score: r.score, razones: r.razones, solicitud: est,
          contraparte: atiendeComprador(p).esBroker ? 'Comprador con broker' : 'Comprador por su cuenta' }]
      }))
      return NextResponse.json({ rol, conexiones: await conContacto(porScore(conexiones), (x) => atiendeComprador(perfilDe.get(x.perfilId)!)) })
    }

    return NextResponse.json({ error: 'Los matches son para brokers y compradores' }, { status: 403 })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { uid, rol, esDemo, admin } = auth
    if (rol !== 'broker' && rol !== 'inversionista') {
      return NextResponse.json({ error: 'Los matches son para brokers y compradores' }, { status: 403 })
    }

    const { activoId, perfilId } = await req.json().catch(() => ({}))
    if (!activoId || !perfilId) return NextResponse.json({ error: 'Faltan activoId y perfilId' }, { status: 400 })

    const [{ data: a }, { data: p }] = await Promise.all([
      admin.from('activos').select(COLS_ACTIVO).eq('id', activoId).maybeSingle(),
      admin.from('perfiles_intencion').select(COLS_PERFIL).eq('id', perfilId).maybeSingle(),
    ])
    const activo = a as Activo | null
    const perfil = p as Perfil | null
    if (!activo || !perfil) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!mismoMundo(esDemo, activo.es_demo, perfil.es_demo)) {
      return NextResponse.json({ error: 'No es un match válido' }, { status: 422 })
    }

    // Solo puede pedir la conexión quien es dueño de una de las dos partes.
    const esDueno =
      (rol === 'broker' && (activo.broker_id === uid || (perfil.broker_id === uid && perfil.usuario_id === null) || perfil.representado_por === uid)) ||
      (rol === 'inversionista' && perfil.usuario_id === uid)
    if (!esDueno) return NextResponse.json({ error: 'No autorizado para este match' }, { status: 403 })

    const r = puntuarMatch(activo, perfil)
    if (!esMatchValido(activo, r)) return NextResponse.json({ error: 'No es un match válido' }, { status: 422 })

    const { data: existente } = await admin.from('matches').select('id, estado')
      .eq('activo_id', activoId).eq('perfil_id', perfilId).maybeSingle()
    if (existente) return NextResponse.json({ ok: true, estado: (existente as { estado: string }).estado })

    const { error } = await admin.from('matches').insert({
      activo_id: activoId, perfil_id: perfilId, solicitado_por: uid, score: r.score, razones: r.razones,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // V7.1: si el propietario vende por su cuenta, se le avisa; el contacto le llega cuando
    // Operación valide la conexión.
    if (!activo.broker_id) {
      after(() => avisarUsuario(admin, activo.usuario_id, {
        asunto: `Un comprador se interesó en ${activo.nombre}`,
        titulo: 'Hay un comprador interesado en tu propiedad',
        lineas: [
          `Coincide ${r.score}/100 con lo que busca: ${r.razones.join(' · ')}.`,
          'Nuestro equipo revisa la conexión y, si procede, te pasa su contacto.',
        ],
        enlace: { texto: 'Ver mis interesados', ruta: `/activo/${activo.id}/leads` },
      }, { esDemo }))
    }
    // Paso 2 V6.3: Operación valida cada conexión a mano; sin aviso se quedaría días sin atender.
    after(() => avisarOperacion({
      asunto: `Nueva solicitud de conexión · ${activo.nombre}`,
      titulo: 'Hay una solicitud de conexión por validar',
      lineas: [
        `Propiedad: ${activo.nombre} (${activo.municipio}).`,
        `Coincidencia ${r.score}/100: ${r.razones.join(' · ')}.`,
        `La pidió un ${rol === 'broker' ? 'broker' : 'comprador'}.`,
      ],
      enlace: { texto: 'Abrir la consola de Operación', ruta: '/panel' },
    }, { esDemo }))
    return NextResponse.json({ ok: true, estado: 'solicitado' })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
