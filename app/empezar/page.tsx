import Recorrido from './Recorrido'

// Recorrido guiado del cliente (Documento Maestro V7.2): ?quiere=vender|comprar salta el paso 1
// cuando viene de una de las puertas de /bienvenida.
export default async function EmpezarPage(props: PageProps<'/empezar'>) {
  const sp = await props.searchParams
  const quiere = sp.quiere === 'vender' || sp.quiere === 'comprar' ? sp.quiere : null
  return <Recorrido inicial={quiere} />
}
