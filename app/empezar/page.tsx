import Recorrido, { type Opcion } from './Recorrido'

// Recorrido guiado del cliente (Documento Maestro V7.2, V10 §24.1): ?quiere=comprar|rentar|vender|poner_renta salta el paso 1
// cuando viene de una de las puertas de /bienvenida.
export default async function EmpezarPage(props: PageProps<'/empezar'>) {
  const sp = await props.searchParams
  const OPS = ['comprar', 'rentar', 'vender', 'poner_renta'] as const
  const quiere = (OPS as readonly string[]).includes(sp.quiere as string) ? (sp.quiere as Opcion) : null
  // ?mundo=demo: entrada simple sin contraseña (app/entrar, guion v12); el cliente ya llega con sesión.
  return <Recorrido inicial={quiere} demo={sp.mundo === 'demo'} />
}
