import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { reindexarMotor } from '@/lib/motorBusqueda'

// Después de cargar o editar una propiedad: el motor de búsqueda (§29) vuelve a leer el inventario.
// Solo con sesión; responde enseguida y el trabajo corre después de la respuesta.
export async function POST(req: NextRequest) {
  const s = await sesionServidor(req)
  if (!s) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  after(reindexarMotor)
  return NextResponse.json({ ok: true })
}
