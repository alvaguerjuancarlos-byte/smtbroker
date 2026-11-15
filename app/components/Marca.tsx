import Image from 'next/image'

// Marca EslAix (Documento Maestro V10 §26): el símbolo de los dos eslabones + el nombre.
// EslAix = eslabón + AI; se escribe con "A" mayúscula e "i" minúscula y el "Ai" en verde.
// Nombre en Ubuntu Bold (--font-marca, ver layout.tsx): su "l" con curvita no se pierde junto a la "A".
// Hay dos variantes del símbolo y el CSS (globals.css, .marca-claro/.marca-oscuro/.marca-nombre) muestra
// la que toca según el fondo: azul y verde en fondo claro; blanco y verde dentro de .tema-oscuro.
const PROPORCION = 164 / 128 // ancho / alto de public/marca/eslaix-simbolo*.png
export const SLOGAN = 'Conecta con certeza'

export function SimboloEslAix({ alto = 26, className = '' }: { alto?: number; className?: string }) {
  const ancho = Math.round(alto * PROPORCION)
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ width: ancho, height: alto }}>
      <Image src="/marca/eslaix-simbolo.png" alt="" width={ancho} height={alto} className="marca-claro" priority />
      <Image src="/marca/eslaix-simbolo-oscuro.png" alt="" width={ancho} height={alto} className="marca-oscuro" priority />
    </span>
  )
}

// Símbolo + "EslAix" (+ slogan opcional). `texto` es el tamaño del nombre en px; el símbolo se ajusta a él.
export function Marca({ texto = 19, slogan = false, className = '' }: { texto?: number; slogan?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label={slogan ? `EslAix. ${SLOGAN}` : 'EslAix'}>
      <SimboloEslAix alto={Math.round(texto * (slogan ? 1.9 : 1.45))} />
      <span className="inline-flex flex-col leading-none" aria-hidden="true">
        <span className="marca-nombre" style={{ fontSize: texto }}>
          Esl<span className="marca-ai">Ai</span>x
        </span>
        {slogan && <span className="marca-slogan" style={{ fontSize: Math.max(11, Math.round(texto * 0.36)) }}>{SLOGAN}</span>}
      </span>
    </span>
  )
}
