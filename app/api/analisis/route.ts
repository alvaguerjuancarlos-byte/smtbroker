import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { analizarPropiedad, COLS_ACTIVO_ANALISIS, type ActivoParaAnalisis } from '@/lib/analisisServidor'
import { COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'
import { etiquetaTipo } from '@/lib/necesidad'

// Análisis para el comprador (Documento Maestro V8, Parte 2, §20).
//
// POST {activoId | anuncioId, necesidadId?, actualizar?}: "Me interesa". Reglas (§20.5):
//   - solo lo que está en su bandeja: las propiedades que un broker le propuso, las que ve por la
//     búsqueda directa (particulares; con broker, toda la red, V7.2), o un anuncio de portal de su
//     Radar con precio y m² (leídos de la página o capturados por él: opción 2, 10-nov-2026);
//   - NO revela al comprador: el dueño, el broker o el anunciante no se enteran;
//   - hasta 5 a la vez en su comparativo (los no descartados);
//   - el análisis básico es ilimitado; el análisis por tipo (costo total, renta, uso de suelo) tiene
//     tope de 5 al mes;
//   - si ya hay uno de menos de 7 días, se devuelve ese (salvo `actualizar`).
// GET: su comparativo (el análisis más reciente de cada propiedad o anuncio no descartado).

const MAX_A_LA_VEZ = 5
const MAX_POR_TIPO_MES = 5
const SIETE_DIAS = 7 * 86400_000

interface FilaAnalisis {
  id: string; activo_id: string | null; anuncio_id: string | null; necesidad_id: string | null
  resultado: Record<string, unknown>; por_tipo: boolean; descartado: boolean; created_at: string
}
const clave = (a: Pick<FilaAnalisis, 'activo_id' | 'anuncio_id'>) => (a.activo_id ?? a.anuncio_id)!
const COLS = 'id, activo_id, anuncio_id, necesidad_id, resultado, por_tipo, descartado, created_at'

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { data } = await s.admin.from('analisis').select(COLS)
      .eq('usuario_id', s.uid).eq('descartado', false).order('created_at', { ascending: false })
    const vistos = new Set<string>()
    const analisis = ((data as FilaAnalisis[]) || []).filter((a) => !vistos.has(clave(a)) && vistos.add(clave(a)))
    return NextResponse.json({ analisis, maximo: MAX_A_LA_VEZ })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

interface AnuncioRadar {
  id: string; url: string; fuente: string; titulo: string | null; precio: number | null; superficie: number | null
  tipo: string | null; municipio: string | null; colonia: string | null; lectura: string | null; es_demo: boolean
}

export async function POST(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (s.rol !== 'inversionista') return NextResponse.json({ error: 'El análisis es para compradores' }, { status: 403 })
    const b = await req.json().catch(() => ({})) as { activoId?: string; anuncioId?: string; necesidadId?: string; actualizar?: boolean }

    const [{ data: necs }, { data: perfil }, { data: previos }] = await Promise.all([
      s.admin.from('necesidades').select(COLS_NECESIDAD).eq('usuario_id', s.uid).order('created_at', { ascending: false }),
      s.admin.from('perfiles_intencion').select('id, representado_por').eq('usuario_id', s.uid).maybeSingle(),
      s.admin.from('analisis').select(COLS).eq('usuario_id', s.uid).order('created_at', { ascending: false }),
    ])
    const N = (necs as FilaNecesidad[]) || []
    const P = (previos as FilaAnalisis[]) || []
    const p = perfil as { id: string; representado_por: string | null } | null

    // Qué se analiza: una propiedad de la plataforma o un anuncio de portal del Radar.
    let a: ActivoParaAnalisis, columna: 'activo_id' | 'anuncio_id', necesidad: FilaNecesidad | null
    let origen: Record<string, unknown> | null = null
    if (b.anuncioId) {
      const { data: op } = p ? await s.admin.from('radar_opciones').select('id').eq('perfil_id', p.id).eq('anuncio_id', b.anuncioId).maybeSingle() : { data: null }
      const { data: an } = await s.admin.from('radar_anuncios').select('id, url, fuente, titulo, precio, superficie, tipo, municipio, colonia, lectura, es_demo').eq('id', b.anuncioId).maybeSingle()
      const x = an as AnuncioRadar | null
      if (!op || !x || x.es_demo !== s.esDemo) return NextResponse.json({ error: 'Este anuncio no está en tu bandeja' }, { status: 403 })
      if (!x.precio || !x.superficie) return NextResponse.json({ error: 'Primero lee el anuncio o escribe su precio y sus m²' }, { status: 409 })
      necesidad = N.find((n) => n.id === b.necesidadId) ?? N[0] ?? null
      columna = 'anuncio_id'
      a = {
        id: x.id, nombre: x.titulo || `Anuncio de ${x.fuente}`, tipo: x.tipo || (necesidad ? etiquetaTipo(necesidad.tipo) : 'Casa'),
        municipio: x.municipio || necesidad?.municipio || '', colonia: x.colonia, estado: necesidad?.estado || 'Nuevo León',
        superficie: x.superficie, precio_total: x.precio, broker_id: null, usuario_id: '', status: null, es_demo: x.es_demo, lat: null, lng: null,
      }
      origen = { portal: x.fuente, url: x.url, lectura: x.lectura }
    } else {
      const { data: ad } = await s.admin.from('activos').select(COLS_ACTIVO_ANALISIS).eq('id', b.activoId ?? '').maybeSingle()
      const x = ad as ActivoParaAnalisis | null
      if (!x || x.es_demo !== s.esDemo || x.status === 'cerrado') return NextResponse.json({ error: 'Propiedad no disponible' }, { status: 404 })
      // ¿Está en su bandeja?
      const { data: props } = N.length
        ? await s.admin.from('propuestas').select('necesidad_id').eq('activo_id', x.id).in('necesidad_id', N.map((n) => n.id))
        : { data: [] }
      const propuesta = ((props as { necesidad_id: string }[]) || [])[0]
      if (!propuesta && x.broker_id && !p?.representado_por) return NextResponse.json({ error: 'Esta propiedad no está en tu bandeja' }, { status: 403 })
      a = x
      columna = 'activo_id'
      necesidad = N.find((n) => n.id === b.necesidadId) ?? N.find((n) => n.id === propuesta?.necesidad_id) ?? N[0] ?? null
    }

    const lleno = `Ya tienes ${MAX_A_LA_VEZ} propiedades en tu comparativo. Quita una para agregar otra.`
    const previo = P.find((x) => clave(x) === a.id)
    if (previo && !b.actualizar && Date.now() - new Date(previo.created_at).getTime() < SIETE_DIAS) {
      if (previo.descartado) {
        const enComparativo = new Set(P.filter((x) => !x.descartado).map(clave))
        if (enComparativo.size >= MAX_A_LA_VEZ) return NextResponse.json({ error: lleno }, { status: 409 })
        await s.admin.from('analisis').update({ descartado: false }).eq('usuario_id', s.uid).eq(columna, a.id)
      }
      return NextResponse.json({ ok: true, id: previo.id, nuevo: false })
    }

    const enComparativo = new Set(P.filter((x) => !x.descartado).map(clave))
    if (!enComparativo.has(a.id) && enComparativo.size >= MAX_A_LA_VEZ) return NextResponse.json({ error: lleno }, { status: 409 })
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const conTipoEsteMes = new Set(P.filter((x) => x.por_tipo && new Date(x.created_at) >= inicioMes).map(clave))
    const porTipo = conTipoEsteMes.has(a.id) || conTipoEsteMes.size < MAX_POR_TIPO_MES

    const resultado = await analizarPropiedad(s.admin, a, necesidad, { porTipo })
    const { data: fila, error } = await s.admin.from('analisis').insert({
      usuario_id: s.uid, [columna]: a.id, necesidad_id: necesidad?.id ?? null, por_tipo: porTipo,
      resultado: {
        ...resultado, ...(origen ? { origen } : {}),
        ...(porTipo ? {} : { topeMensual: `Llegaste al tope de ${MAX_POR_TIPO_MES} análisis completos este mes: este incluye precio, plusvalía y cumplimiento de tu ficha.` }),
      },
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Los análisis anteriores de lo mismo salen del comparativo: queda el más reciente.
    await s.admin.from('analisis').update({ descartado: true }).eq('usuario_id', s.uid).eq(columna, a.id).neq('id', (fila as { id: string }).id)
    return NextResponse.json({ ok: true, id: (fila as { id: string }).id, nuevo: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
