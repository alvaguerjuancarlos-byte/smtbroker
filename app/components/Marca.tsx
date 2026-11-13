import Image from 'next/image'

// Marca Ciertix (Documento Maestro V10 §26): el símbolo de los dos eslabones + el nombre.
// Hay dos variantes del símbolo y el CSS (globals.css, .marca-claro/.marca-oscuro) muestra la que
// toca según el fondo: azul y verde en fondo claro; blanco y verde dentro de .tema-oscuro, donde el
// azul se pierde contra el azul marino.
const PROPORCION = 164 / 128 // ancho / alto de public/marca/ciertix-simbolo*.png

export function SimboloCiertix({ alto = 26, className = '' }: { alto?: number; className?: string }) {
  const ancho = Math.round(alto * PROPORCION)
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ width: ancho, height: alto }}>
      <Image src="/marca/ciertix-simbolo.png" alt="" width={ancho} height={alto} className="marca-claro" priority />
      <Image src="/marca/ciertix-simbolo-oscuro.png" alt="" width={ancho} height={alto} className="marca-oscuro" priority />
    </span>
  )
}

// Símbolo + "Ciertix". `texto` es el tamaño de la letra en px; el símbolo se ajusta a él.
export function Marca({ texto = 19, className = '' }: { texto?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Ciertix">
      <SimboloCiertix alto={Math.round(texto * 1.45)} />
      <span className="font-display font-semibold tracking-tight text-tinta" style={{ fontSize: texto }}>Ciertix</span>
    </span>
  )
}
