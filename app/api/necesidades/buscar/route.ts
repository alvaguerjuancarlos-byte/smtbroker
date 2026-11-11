import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { validarNecesidad } from '@/lib/necesidad'
import { inventarioQueCumple, anunciosDePortales } from '@/lib/necesidadServidor'

// Búsqueda directa ANTES de crear la cuenta (Documento Maestro V8, §19.2 y §19.5 regla 1: se pide
// cuenta después de la ficha, cuando el cliente ya vio sus primeros resultados). Sin sesión.
//
// Devuelve solo lo público: de la plataforma, propiedades de particulares (como el Radar de quien va
// por su cuenta, V7.2) con las columnas de activos_publicos; de los portales, título y liga.
// Mundo real siempre: el mundo demo se registra con su correo y ve lo suyo en su panel.
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

    const [plataforma, portales] = await Promise.all([
      inventarioQueCumple(getSupabaseAdmin(), n, { esDemo: false, incluirBrokers: false }),
      conPortales ? anunciosDePortales(n) : Promise.resolve([]),
    ])
    return NextResponse.json({ plataforma, portales })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
