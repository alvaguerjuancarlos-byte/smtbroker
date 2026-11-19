import { redirect } from 'next/navigation'
import EntradaDemo from './EntradaDemo'

// Entrada simple tipo chat (guion v12, momento 1; JC, 19-nov-2026). Por ahora solo en el mundo demo
// (/entrar?mundo=demo): el mundo real sigue en /login hasta que se decida cómo se verifica.
// ?quiere=comprar|rentar|vender|poner_renta viene de una puerta de /bienvenida y se respeta al terminar.
export default async function EntrarPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams
  if (sp.mundo !== 'demo') redirect('/login')
  const OPS = ['comprar', 'rentar', 'vender', 'poner_renta']
  const quiere = OPS.includes(sp.quiere as string) ? (sp.quiere as string) : null
  return <EntradaDemo quiere={quiere} />
}
