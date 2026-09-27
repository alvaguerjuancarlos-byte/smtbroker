import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Envía la invitación real por correo — se usa para los cuatro roles (propietario, broker,
// inversionista, y brokers que llegan por prospección en vez de /bienvenida), no solo brokers;
// de ahí el nombre de la ruta (antes era /api/invitar-broker). Requiere SUPABASE_SERVICE_ROLE_KEY
// — el Admin API de Supabase (inviteUserByEmail) no funciona con el anon key.
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

  const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token)
  if (callerError || !caller?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Solo Broker Maestro puede invitar -- antes esto solo se exigía en el cliente (/panel,
  // /panel/prospectos-broker), así que cualquier usuario autenticado podía llamar este endpoint
  // directo y crear una cuenta con rol "broker_maestro" (escalación de privilegios real,
  // hallazgo 2026-09-27). Se usa supabaseAdmin (bypassa RLS) porque este check corre server-side
  // antes de decidir si la petición procede, no depende de la sesión del propio caller.
  const { data: callerProfile } = await supabaseAdmin.from('usuarios').select('rol').eq('id', caller.user.id).single()
  if (callerProfile?.rol !== 'broker_maestro') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { email, nombre, rol } = await req.json()
  if (!email) return NextResponse.json({ error: 'Falta el correo' }, { status: 400 })

  const ROLES_VALIDOS = ['propietario', 'inversionista', 'broker', 'broker_maestro']
  if (rol && !ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: `Rol inválido: ${rol}` }, { status: 400 })
  }

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
