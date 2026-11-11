import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarOperacion } from '@/lib/avisos'
import { cumpleNecesidad } from '@/lib/necesidad'
import { COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'
import { COLS_ACTIVO_ANALISIS, type ActivoParaAnalisis } from '@/lib/analisisServidor'
import { fase, rolEn, TEXTO_FASE, ladoComprador } from '@/lib/conexion'
import { COLS_CONEXION, avisarPartes, nombresDe, type FilaConexion } from '@/lib/conexionServidor'

// Conexiones (Documento Maestro V8, Parte 3, §21).
//
// POST {activoId}: "Quiero verla". Solo el comprador y solo sobre una propiedad que ya analizó
// (Parte 2). Es el único momento en que se revela su nombre (§21.1). Con quién lo conecta (§21.2):
//   - la propuso un broker en el panel  → ese broker; validación AUTOMÁTICA (broker verificado y la
//     propiedad ya cumplió la ficha al proponerla);
//   - de un particular                   → el dueño; validación MANUAL (Operación);
//   - de un broker, y el comprador tiene broker propio (ve toda la red) → el broker de la propiedad;
//     automática si cumple la ficha, si no, manual.
// Queda registrado qué aportó la plataforma (§21.6): necesidad, propuesta con términos aceptados,
// análisis y conexión, con fecha.
// GET: las conexiones del usuario (comprador, quien ofrece o broker del comprador); Operación con
// ?vista=operacion ve las que esperan validación y las alertas de seguimiento.

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const operacion = s.esOperacion && req.nextUrl.searchParams.get('vista') === 'operacion'

    let q = s.admin.from('conexiones').select(COLS_CONEXION).eq('es_demo', s.esDemo).order('actualizado_at', { ascending: false })
    q = operacion
      ? q.or('estado.eq.por_validar,compro_respuesta.eq.si_esta')
      : q.or(`comprador_id.eq.${s.uid},contraparte_id.eq.${s.uid},broker_comprador_id.eq.${s.uid}`)
    const { data } = await q
    const C = (data as FilaConexion[]) || []
    const ids = [...new Set(C.map((c) => c.activo_id))]
    const { data: activos } = ids.length ? await s.admin.from('activos').select('id, nombre, municipio, precio_total').in('id', ids) : { data: [] }
    const activoDe = new Map(((activos as { id: string; nombre: string; municipio: string; precio_total: number | null }[]) || []).map((a) => [a.id, a]))
    const nombres = await nombresDe(s.admin, C.flatMap((c) => [c.comprador_id, c.contraparte_id, c.broker_comprador_id ?? '']))

    return NextResponse.json({
      conexiones: C.map((c) => {
        const rol = rolEn(c, s.uid)
        const f = fase(c)
        // Lo que le toca hacer a este usuario, para resaltarlo en la lista.
        const pendiente = f === 'visita_propuesta' && rol === 'contraparte' ? 'Confirma un horario de visita'
          : f === 'visita_realizada' && rol === 'comprador' && !c.visita_resultado ? '¿Cómo te fue en la visita?'
            : f === 'cierre_por_confirmar' && rol === 'comprador' ? 'Confirma el cierre'
              : null
        return {
          id: c.id, rol, fase: f, textoFase: TEXTO_FASE[f], pendiente, actualizado_at: c.actualizado_at,
          activo: activoDe.get(c.activo_id) ?? null,
          otraParte: ladoComprador(rol) ? nombres.get(c.contraparte_id) : nombres.get(c.comprador_id),
          ...(operacion ? {
            comprador: nombres.get(c.comprador_id), contraparte: nombres.get(c.contraparte_id), origen: c.origen,
            alerta: c.compro_respuesta === 'si_esta' && !c.cierre_reportado_at ? 'El comprador dice que ya compró y nadie reportó el cierre' : null,
          } : {}),
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
    if (s.rol !== 'inversionista') return NextResponse.json({ error: 'Solo el comprador pide ver una propiedad' }, { status: 403 })
    const { activoId } = await req.json().catch(() => ({})) as { activoId?: string }

    const { data: previa } = await s.admin.from('conexiones').select('id').eq('comprador_id', s.uid).eq('activo_id', activoId ?? '').maybeSingle()
    if (previa) return NextResponse.json({ ok: true, id: (previa as { id: string }).id, nueva: false })

    const [{ data: ad }, { data: an }, { data: necs }, { data: perfil }] = await Promise.all([
      s.admin.from('activos').select(COLS_ACTIVO_ANALISIS).eq('id', activoId ?? '').maybeSingle(),
      s.admin.from('analisis').select('id, necesidad_id, created_at').eq('usuario_id', s.uid).eq('activo_id', activoId ?? '').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('usuario_id', s.uid),
      s.admin.from('perfiles_intencion').select('representado_por').eq('usuario_id', s.uid).maybeSingle(),
    ])
    const a = ad as ActivoParaAnalisis | null
    if (!a || a.es_demo !== s.esDemo || a.status === 'cerrado') return NextResponse.json({ error: 'Propiedad no disponible' }, { status: 404 })
    if (a.usuario_id === s.uid) return NextResponse.json({ error: 'Es tu propia propiedad' }, { status: 400 })
    const analisis = an as { id: string; necesidad_id: string | null; created_at: string } | null
    if (!analisis) return NextResponse.json({ error: 'Primero marca "Me interesa" para recibir su análisis' }, { status: 409 })

    const N = (necs as FilaNecesidad[]) || []
    const { data: props } = N.length
      ? await s.admin.from('propuestas').select('id, necesidad_id, broker_id, terminos_aceptados_at, created_at').eq('activo_id', a.id).in('necesidad_id', N.map((n) => n.id)).order('created_at').limit(1)
      : { data: [] }
    const propuesta = ((props as { id: string; necesidad_id: string; broker_id: string; terminos_aceptados_at: string; created_at: string }[]) || [])[0]
    const brokerComprador = (perfil as { representado_por: string | null } | null)?.representado_por ?? null
    const necesidad = N.find((n) => n.id === (propuesta?.necesidad_id ?? analisis.necesidad_id)) ?? N[0] ?? null

    let origen: 'propuesta' | 'particular' | 'red', contraparte: string, esBroker: boolean, automatica: boolean
    if (propuesta) { origen = 'propuesta'; contraparte = propuesta.broker_id; esBroker = true; automatica = true }
    else if (!a.broker_id) { origen = 'particular'; contraparte = a.usuario_id; esBroker = false; automatica = false }
    else if (brokerComprador) { origen = 'red'; contraparte = a.broker_id; esBroker = true; automatica = !!necesidad && cumpleNecesidad(a, necesidad).cumple }
    else return NextResponse.json({ error: 'Esta propiedad no está en tu bandeja' }, { status: 403 })

    const ahora = new Date().toISOString()
    const { data: fila, error } = await s.admin.from('conexiones').insert({
      comprador_id: s.uid, activo_id: a.id, necesidad_id: necesidad?.id ?? null, propuesta_id: propuesta?.id ?? null,
      contraparte_id: contraparte, contraparte_es_broker: esBroker, broker_comprador_id: brokerComprador,
      origen, estado: automatica ? 'activa' : 'por_validar', validacion: automatica ? 'automatica' : 'manual',
      validada_at: automatica ? ahora : null,
      aporte: {
        necesidad: necesidad ? { id: necesidad.id, fecha: necesidad.created_at } : null,
        propuesta: propuesta ? { id: propuesta.id, fecha: propuesta.created_at, terminos_aceptados_at: propuesta.terminos_aceptados_at } : null,
        analisis: { id: analisis.id, fecha: analisis.created_at },
        conexion: ahora,
        plataformaAporto: 'comprador',
      },
    }).select(COLS_CONEXION).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const c = fila as FilaConexion

    const [{ data: yo }] = await Promise.all([s.admin.from('usuarios').select('nombre').eq('id', s.uid).single()])
    const nombre = (yo as { nombre: string | null } | null)?.nombre || 'Un comprador'
    after(() => automatica
      ? avisarPartes(s.admin, c, {
        asunto: `${nombre} quiere ver ${a.nombre}`,
        titulo: 'Un comprador quiere ver tu propiedad',
        lineas: [`${nombre} analizó ${a.nombre} y quiere verla.`, 'Escríbele por la plataforma y acuerden la visita.'],
        enlace: { texto: 'Abrir la conversación', ruta: `/conexion/${c.id}` },
      }, s.uid)
      : avisarOperacion({
        asunto: `Conexión por validar: ${a.nombre}`,
        titulo: 'Un comprador quiere ver una propiedad',
        lineas: [`${nombre} → ${a.nombre} (${origen === 'particular' ? 'de un particular' : 'de la red, no cumple toda la ficha'}).`, 'Revísala antes de ponerlos en contacto.'],
        enlace: { texto: 'Abrir la consola', ruta: '/panel' },
      }, { esDemo: s.esDemo }))
    return NextResponse.json({ ok: true, id: c.id, nueva: true, estado: c.estado })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
