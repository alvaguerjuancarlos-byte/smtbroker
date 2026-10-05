import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { puntuarMatch, esMatchValido, type ResultadoMatch } from '@/lib/matching'

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

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

const COLS_ACTIVO = 'id, nombre, tipo, municipio, colonia, estado, superficie, precio_total, status, broker_id, usuario_id, created_at'
const COLS_PERFIL = 'id, usuario_id, broker_id, alias_cliente, presupuesto, zona, tipo_activo_interes'

interface Activo {
  id: string; nombre: string; tipo: string; municipio: string; colonia: string | null; estado: string
  superficie: number | null; precio_total: number | null; status: string | null
  broker_id: string | null; usuario_id: string; created_at: string
}
interface Perfil {
  id: string; usuario_id: string | null; broker_id: string | null; alias_cliente: string | null
  presupuesto: string | null; zona: string | null; tipo_activo_interes: string | null
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
  const { data: perfil } = await admin.from('usuarios').select('rol').eq('id', data.user.id).single()
  return { uid: data.user.id, rol: (perfil as { rol: string | null } | null)?.rol ?? null, admin }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { uid, rol, admin } = auth

    const [{ data: activos }, { data: perfiles }, { data: solicitudes }] = await Promise.all([
      admin.from('activos').select(COLS_ACTIVO).neq('status', 'cerrado'),
      admin.from('perfiles_intencion').select(COLS_PERFIL),
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

    if (rol === 'broker') {
      const misClientes = P.filter((p) => p.broker_id === uid && p.usuario_id === null)
      const miPortafolio = A.filter((a) => a.broker_id === uid)

      const paraMisClientes = porScore(misClientes.flatMap((p) => A.flatMap((a) => {
        const r = valido(a, p)
        if (!r) return []
        const propio = a.broker_id === uid
        return [{
          perfilId: p.id, activoId: a.id, cliente: p.alias_cliente, score: r.score, razones: r.razones,
          activo: activoPublico(a),
          representacion: propio ? 'Tu portafolio'
            : a.broker_id ? 'Representada por otro broker de la red' : 'Directo con el propietario',
          solicitud: solicitud(a, p),
        }]
      })))

      const paraMiPortafolio = porScore(miPortafolio.flatMap((a) => P.flatMap((p) => {
        const r = valido(a, p)
        if (!r) return []
        const contraparte = p.broker_id === uid ? `Tu cliente: ${p.alias_cliente}`
          : p.broker_id ? 'Cliente de otro broker' : 'Comprador directo'
        return [{
          activoId: a.id, perfilId: p.id, activo: a.nombre, score: r.score, razones: r.razones,
          contraparte, criterios: criterios(p), solicitud: solicitud(a, p),
        }]
      })))

      return NextResponse.json({ rol, paraMisClientes, paraMiPortafolio })
    }

    if (rol === 'inversionista') {
      const miPerfil = P.find((p) => p.usuario_id === uid)
      if (!miPerfil) return NextResponse.json({ rol, coincidencias: [] })
      const coincidencias = porScore(A.flatMap((a) => {
        const r = valido(a, miPerfil)
        return r ? [{ activoId: a.id, perfilId: miPerfil.id, score: r.score, razones: r.razones, activo: activoPublico(a), solicitud: solicitud(a, miPerfil) }] : []
      }))
      return NextResponse.json({ rol, coincidencias })
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
    const { uid, rol, admin } = auth
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

    // Solo puede pedir la conexión quien es dueño de una de las dos partes.
    const esDueno =
      (rol === 'broker' && (activo.broker_id === uid || (perfil.broker_id === uid && perfil.usuario_id === null))) ||
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
    return NextResponse.json({ ok: true, estado: 'solicitado' })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
