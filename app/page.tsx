import { redirect } from 'next/navigation'

// La raíz manda a /bienvenida. Excepción: los correos de Supabase (invitación o recuperación de
// contraseña) arman su enlace con {{ .RedirectTo }}; cuando el correo se dispara desde el dashboard
// de Supabase (p. ej. "Send password recovery"), RedirectTo cae en la raíz del sitio y el enlace
// llega aquí con ?token_hash=...&type=... Se reenvía a /establecer-password con los mismos
// parámetros para no perder el código (hallazgo 2026-10-07).
export default async function Home(props: PageProps<'/'>) {
  const sp = await props.searchParams
  const tokenHash = typeof sp.token_hash === 'string' ? sp.token_hash : null
  const tipo = typeof sp.type === 'string' ? sp.type : null
  if (tokenHash && tipo) {
    redirect(`/establecer-password?${new URLSearchParams({ token_hash: tokenHash, type: tipo })}`)
  }
  redirect('/bienvenida')
}
