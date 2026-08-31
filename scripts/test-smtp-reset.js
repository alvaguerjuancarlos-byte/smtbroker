// Prueba de la hipótesis "sandbox de Resend solo entrega al correo dueño de la cuenta":
// inviteUserByEmail no sirve aquí porque el usuario de prueba ya existe y está confirmado
// (Supabase respondería "already registered" sin siquiera intentar el envío). En su lugar,
// resetPasswordForEmail dispara un correo real por el mismo SMTP custom sin ese obstáculo,
// y funciona igual para un usuario ya confirmado — sirve para aislar si el problema es el
// destinatario (sandbox) o algo más general en la config SMTP.
const { createClient } = require('@supabase/supabase-js')

const email = process.argv[2]
if (!email) { console.error('Uso: node scripts/test-smtp-reset.js correo@ejemplo.com'); process.exit(1) }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://smtbroker.vercel.app/establecer-password',
  })

  if (error) {
    console.error('resetPasswordForEmail devolvió error:')
    console.error('  status:', error.status)
    console.error('  message:', error.message)
    process.exit(1)
  }

  console.log('resetPasswordForEmail OK — Supabase no reportó error enviando a', email)
  console.log('Revisa bandeja de entrada Y spam.')
}

main()
