// Diagnóstico puntual — confirma si Supabase de verdad creó/invitó al usuario de prueba, para
// distinguir "nuestra llamada falló" de "Supabase la aceptó pero el correo no llegó" (spam,
// rate limit del servicio de correo integrado, etc.). Variables via env (ver comando de
// invocación) — mismo uso ya configurado para app/api/invitar-broker.
const { createClient } = require('@supabase/supabase-js')

const email = process.argv[2]
if (!email) { console.error('Uso: node scripts/diag-invite.js correo@ejemplo.com'); process.exit(1) }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) { console.error('Error listando usuarios:', error.message); process.exit(1) }

  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.log(`No existe ningún usuario con el correo ${email} en auth.users.`)
    console.log('Esto significa que la llamada a inviteUserByEmail NUNCA llegó a crear la cuenta — el problema está antes del envío del correo, no en la entrega.')
    return
  }

  console.log('Usuario encontrado en auth.users:')
  console.log('  id:', user.id)
  console.log('  email:', user.email)
  console.log('  created_at:', user.created_at)
  console.log('  invited_at:', user.invited_at)
  console.log('  confirmed_at:', user.confirmed_at)
  console.log('  last_sign_in_at:', user.last_sign_in_at)
  console.log('  email_confirmed_at:', user.email_confirmed_at)
  console.log('  user_metadata:', JSON.stringify(user.user_metadata))

  if (user.invited_at && !user.confirmed_at) {
    console.log('\n→ Supabase SÍ registró la invitación (invited_at tiene fecha) pero el usuario todavía no confirmó/entró.')
    console.log('  Esto confirma que nuestro código funcionó — Supabase aceptó la invitación.')
    console.log('  El correo no llegando es un problema de ENTREGA (spam, límite de envíos del servicio de correo integrado de Supabase), no de nuestro código.')
  }
}

main()
