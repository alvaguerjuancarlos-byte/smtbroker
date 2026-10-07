import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Cuenta una visita a la página pública de una propiedad (/p/[id]; Documento Maestro V6.3 §14.1:
// "métricas reales"). Sin sesión. El navegador la manda una sola vez por sesión
// (app/p/[id]/RegistrarVisita.tsx); aquí solo se acepta si la propiedad está publicada.

export async function POST(req: NextRequest) {
  try {
    const { activoId } = await req.json().catch(() => ({}))
    if (typeof activoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(activoId)) return NextResponse.json({ ok: false }, { status: 400 })
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('activos').select('publicada_at, status').eq('id', activoId).maybeSingle()
    const a = data as { publicada_at: string | null; status: string | null } | null
    if (!a?.publicada_at || a.status === 'cerrado') return NextResponse.json({ ok: false }, { status: 404 })
    await admin.from('visitas_publicas').insert({ activo_id: activoId })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
