import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { validarNecesidad } from '@/lib/necesidad'
import { inventarioQueCumple, anunciosDePortales, mercadoDeZonas } from '@/lib/necesidadServidor'
import { sesionServidor } from '@/lib/sesionServidor'

// Búsqueda directa ANTES de crear la cuenta (Documento Maestro V8, §19.2 y §19.5 regla 1: se pide
// cuenta después de la ficha, cuando el cliente ya vio sus primeros resultados). Sin sesión.
//
// Devuelve solo lo público: de la plataforma, propiedades de particulares (como el Radar de quien va
// por su cuenta, V7.2) con las columnas de activos_publicos; de los portales, título y liga.
// Sin sesión, mundo real siempre. Con sesión (el mundo demo entra primero, guion v12) busca en el mundo
// de la cuenta, para que lo que ve antes de guardar sea lo mismo que verá en su tablero.
//
// La búsqueda en portales cuesta (Serper): máximo 10 por IP por hora, contadas en memoria de la
// instancia. Es un freno para abusos, no un límite exacto.

const MAX_POR_IP_HORA = 10
const usos = new Map<string, number[]>()
const ipDe = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'

export async function POST(req: NextRequest) {
  try {
    const r = validarNecesidad(await req.json().catch(() => ({})))
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    const n = r.necesidad

    const ip = ipDe(req)
    const ahora = Date.now()
    const recientes = (usos.get(ip) ?? []).filter((t) => ahora - t < 3600_000)
    const conPortales = recientes.length < MAX_POR_IP_HORA
    if (conPortales) usos.set(ip, [...recientes, ahora])

    // V9 (§23): todo por zona, más "lo que rinde tu dinero" en cada una (cuesta igual que los portales).
    const [plataforma, portales, mercado] = await Promise.all([
      inventarioQueCumple(getSupabaseAdmin(), n, { esDemo: (await sesionServidor(req))?.esDemo ?? false, incluirBrokers: false }),
      conPortales ? anunciosDePortales(n) : Promise.resolve([]),
      conPortales ? mercadoDeZonas(n) : Promise.resolve(n.zonas.map(() => null)),
    ])
    return NextResponse.json({ zonas: n.zonas.map((z, i) => ({ ...z, mercado: mercado[i] })), plataforma, portales })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
