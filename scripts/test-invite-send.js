// Prueba puntual: llama a inviteUserByEmail directo (sin pasar por la ruta /api/invitar-broker,
// que exige un Bearer token de sesión) para aislar si el problema está en Supabase/Resend o en
// la ruta de la app. Usa un correo NUEVO (no un auth.users existente) para que sea una invitación
// real, no un "ya existe".
const { createClient } = require('@supabase/supabase-js')

const email = process.argv[2]
if (!email) { console.error('Uso: node scripts/test-invite-send.js correo@ejemplo.com'); process.exit(1) }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { nombre: 'Prueba SMTP' },
    redirectTo: 'https://smtbroker.vercel.app/establecer-password',
  })

  if (error) {
    console.error('inviteUserByEmail devolvió error:')
    console.error('  status:', error.status)
    console.error('  message:', error.message)
    process.exit(1)
  }

  console.log('inviteUserByEmail OK — Supabase aceptó la llamada.')
  console.log('  user.id:', data.user.id)
  console.log('  invited_at:', data.user.invited_at)
  console.log('\nRevisa ahora bandeja de entrada Y spam de', email)
}

main()
