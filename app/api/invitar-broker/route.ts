import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Envía la invitación real por correo cuando el Broker Maestro aprueba una solicitud en /panel
// — antes solo se cambiaba el status, sin crear cuenta ni avisar a nadie (gap ya documentado en
// HANDOFF.md desde mayo). Requiere SUPABASE_SERVICE_ROLE_KEY (ver plan) — el Admin API de
// Supabase (inviteUserByEmail) no funciona con el anon key.
export async function POST(req: NextRequest) {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Solo exige sesión válida — mismo nivel de protección mínima que ya tiene /panel hoy (sin
  // restricción por rol, ese control no existe todavía en ningún lado del proyecto).
  const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token)
  if (callerError || !caller?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { email, nombre, rol } = await req.json()
  if (!email) return NextResponse.json({ error: 'Falta el correo' }, { status: 400 })

  const redirectTo = `${req.nextUrl.origin}/establecer-password`

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { nombre: nombre || null, rol: rol || null },
    redirectTo,
  })

  if (error) {
    // Supabase reporta un correo ya registrado como error genérico de creación — se distingue
    // aquí para que /panel pueda mostrar un mensaje claro en vez de "algo falló".
    const yaExiste = error.status === 422 || /already.*registered|already.*exists/i.test(error.message)
    if (yaExiste) {
      return NextResponse.json({ error: 'Ya existe una cuenta con este correo.', code: 'ya_existe' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // usuarios.id debe coincidir con auth.users.id (ver HANDOFF.md) — se crea aquí con el cliente
  // admin (bypassa RLS del lado servidor) para que el nombre ya esté listo cuando la persona
  // entre por primera vez.
  if (data?.user?.id) {
    await supabaseAdmin.from('usuarios').upsert({ id: data.user.id, nombre: nombre || null, rol: rol || null })
  }

  return NextResponse.json({ ok: true })
}
