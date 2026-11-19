import { NextRequest, NextResponse } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { resumenNecesidad, type Necesidad } from '@/lib/necesidad'
import { COLS_NECESIDAD, type FilaNecesidad } from '@/lib/necesidadServidor'
import type { ItemRegistro, ResumenRegistro } from '@/lib/registroBusqueda'

// "Lo que encontró la búsqueda" en la consola de Operación (guion v12, momento 3; JC, 19-nov-2026).
//   GET            → las 50 búsquedas más recientes con su resumen (revisadas, fuentes, cumplen).
//   GET ?id=<nec>  → el detalle: cada propiedad, anuncio y comparable revisado, su fuente y si pasó
//                    o por qué no.
// Solo Operación y solo en su mundo (lib/mundo.ts). Datos: tabla busquedas_registro.

export async function GET(req: NextRequest) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!s.esOperacion) return NextResponse.json({ error: 'Solo Operación' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    const { data, error } = await (id
      ? s.admin.from('busquedas_registro').select('necesidad_id, usuario_id, resumen, items, created_at').eq('necesidad_id', id).eq('es_demo', s.esDemo)
      : s.admin.from('busquedas_registro').select('necesidad_id, usuario_id, resumen, created_at').eq('es_demo', s.esDemo).order('created_at', { ascending: false }).limit(50))
    // Sin la migración 20261119000000 la tabla no existe: la vista lo dice en lugar de fallar.
    if (error) return NextResponse.json({ busquedas: [], sinTabla: /busquedas_registro/.test(error.message) })
    const filas = (data as { necesidad_id: string; usuario_id: string; resumen: ResumenRegistro; items?: ItemRegistro[]; created_at: string }[]) || []

    const [{ data: N }, { data: U }] = await Promise.all([
      s.admin.from('necesidades').select(COLS_NECESIDAD).in('id', filas.map((f) => f.necesidad_id)),
      s.admin.from('usuarios').select('id, nombre').in('id', filas.map((f) => f.usuario_id)),
    ])
    const nec = new Map(((N as FilaNecesidad[]) || []).map((n) => [n.id, n]))
    const nombre = new Map(((U as { id: string; nombre: string | null }[]) || []).map((u) => [u.id, u.nombre]))
    const busquedas = filas.map((f) => {
      const n = nec.get(f.necesidad_id)
      return {
        id: f.necesidad_id, fecha: f.created_at, cliente: nombre.get(f.usuario_id) ?? 'Cliente',
        busca: n ? resumenNecesidad(n as Necesidad) : 'Búsqueda borrada',
        zonas: n ? (n.zonas ?? []).map((z) => z.nombre || z.colonias?.[0] || z.municipio) : [],
        resumen: f.resumen, ...(id ? { items: f.items ?? [] } : {}),
      }
    })
    return NextResponse.json({ busquedas })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
