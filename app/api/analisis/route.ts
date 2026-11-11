import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { analizarPropiedad, COLS_ACTIVO_ANALISIS, type ActivoParaAnalisis } from '@/lib/analisisServidor'
import { COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'

// Análisis para el comprador (Documento Maestro V8, Parte 2, §20).
//
// POST {activoId, necesidadId?, actualizar?}: "Me interesa". Reglas (§20.5):
//   - solo propiedades de su bandeja: las que un broker le propuso, o las que ve por la búsqueda
//     directa (particulares; con broker, toda la red, V7.2), del mismo mundo y sin cerrar;
//   - NO revela al comprador: el dueño y el broker no se enteran;
//   - hasta 5 propiedades a la vez en su comparativo (las no descartadas);
//   - el análisis básico es ilimitado; el análisis por tipo (costo total, renta, uso de suelo) tiene
//     tope de 5 propiedades al mes;
//   - si ya hay uno de menos de 7 días, se devuelve ese (salvo `actualizar`).
// GET: su comparativo (el análisis más reciente de cada propiedad no descartada).

const MAX_A_LA_VEZ = 5
const MAX_POR_TIPO_MES = 5
const SIETE_DIAS = 7 * 86400_000

interface FilaAnalisis { id: string; activo_id: string; necesidad_id: string | null; resultado: Record<string, unknown>; por_tipo: boolean; descartado: boolean; created_at: string }

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { data } = await s.admin.from('analisis').select('id, activo_id, necesidad_id, resultado, por_tipo, descartado, created_at')
      .eq('usuario_id', s.uid).eq('descartado', false).order('created_at', { ascending: false })
    const vistos = new Set<string>()
    const analisis = ((data as FilaAnalisis[]) || []).filter((a) => !vistos.has(a.activo_id) && vistos.add(a.activo_id))
    return NextResponse.json({ analisis, maximo: MAX_A_LA_VEZ })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'inversionista') return NextResponse.json({ error: 'El análisis es para compradores' }, { status: 403 })
    const b = await req.json().catch(() => ({})) as { activoId?: string; necesidadId?: string; actualizar?: boolean }

    const [{ data: ad }, { data: necs }, { data: perfil }, { data: previos }] = await Promise.all([
      s.admin.from('activos').select(COLS_ACTIVO_ANALISIS).eq('id', b.activoId ?? '').maybeSingle(),
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('usuario_id', s.uid),
      s.admin.from('perfiles_intencion').select('representado_por').eq('usuario_id', s.uid).maybeSingle(),
      s.admin.from('analisis').select('id, activo_id, necesidad_id, resultado, por_tipo, descartado, created_at').eq('usuario_id', s.uid).order('created_at', { ascending: false }),
    ])
    const a = ad as ActivoParaAnalisis | null
    if (!a || a.es_demo !== s.esDemo || a.status === 'cerrado') return NextResponse.json({ error: 'Propiedad no disponible' }, { status: 404 })
    const N = (necs as FilaNecesidad[]) || []
    const P = (previos as FilaAnalisis[]) || []

    // ¿Está en su bandeja?
    const { data: props } = N.length
      ? await s.admin.from('propuestas').select('necesidad_id').eq('activo_id', a.id).in('necesidad_id', N.map((n) => n.id))
      : { data: [] }
    const propuesta = ((props as { necesidad_id: string }[]) || [])[0]
    const conBroker = !!(perfil as { representado_por: string | null } | null)?.representado_por
    if (!propuesta && a.broker_id && !conBroker) return NextResponse.json({ error: 'Esta propiedad no está en tu bandeja' }, { status: 403 })

    const necesidad = N.find((n) => n.id === b.necesidadId) ?? N.find((n) => n.id === propuesta?.necesidad_id) ?? N[0] ?? null

    const previo = P.find((x) => x.activo_id === a.id)
    if (previo && !b.actualizar && Date.now() - new Date(previo.created_at).getTime() < SIETE_DIAS) {
      if (previo.descartado) {
        const enComparativo = new Set(P.filter((x) => !x.descartado).map((x) => x.activo_id))
        if (enComparativo.size >= MAX_A_LA_VEZ) return NextResponse.json({ error: `Ya tienes ${MAX_A_LA_VEZ} propiedades en tu comparativo. Quita una para agregar otra.` }, { status: 409 })
        await s.admin.from('analisis').update({ descartado: false }).eq('usuario_id', s.uid).eq('activo_id', a.id)
      }
      return NextResponse.json({ ok: true, id: previo.id, nuevo: false })
    }

    const enComparativo = new Set(P.filter((x) => !x.descartado).map((x) => x.activo_id))
    if (!enComparativo.has(a.id) && enComparativo.size >= MAX_A_LA_VEZ) {
      return NextResponse.json({ error: `Ya tienes ${MAX_A_LA_VEZ} propiedades en tu comparativo. Quita una para agregar otra.` }, { status: 409 })
    }
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const conTipoEsteMes = new Set(P.filter((x) => x.por_tipo && new Date(x.created_at) >= inicioMes).map((x) => x.activo_id))
    const porTipo = conTipoEsteMes.has(a.id) || conTipoEsteMes.size < MAX_POR_TIPO_MES

    const resultado = await analizarPropiedad(s.admin, a, necesidad, { porTipo })
    const { data: fila, error } = await s.admin.from('analisis').insert({
      usuario_id: s.uid, activo_id: a.id, necesidad_id: necesidad?.id ?? null, por_tipo: porTipo,
      resultado: { ...resultado, ...(porTipo ? {} : { topeMensual: `Llegaste al tope de ${MAX_POR_TIPO_MES} análisis completos este mes: este incluye precio, plusvalía y cumplimiento de tu ficha.` }) },
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Los análisis anteriores de la misma propiedad salen del comparativo: queda el más reciente.
    await s.admin.from('analisis').update({ descartado: true }).eq('usuario_id', s.uid).eq('activo_id', a.id).neq('id', (fila as { id: string }).id)
    return NextResponse.json({ ok: true, id: (fila as { id: string }).id, nuevo: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
