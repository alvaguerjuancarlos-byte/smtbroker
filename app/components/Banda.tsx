// Banda azul marino del encabezado de cada pantalla (nuevo look, estilo C, JC 11-nov-2026): va justo
// debajo del Topbar y lleva el título, el saludo o las pestañas. Dentro de .tema-oscuro los tokens
// semánticos (text-tinta, text-tenue, border-linea…) toman sus valores oscuros; el resto de la
// pantalla queda en claro.
import { Marca } from './Marca'

export default function Banda({ children, ancho = 'max-w-[1180px]', sinPie = false }: {
  children: React.ReactNode
  ancho?: string
  sinPie?: boolean
}) {
  return (
    <section className="tema-oscuro bg-superficie text-tinta px-4 md:px-8">
      <div className={`w-full ${ancho} mx-auto pt-7 md:pt-9 ${sinPie ? '' : 'pb-7 md:pb-9'}`}>{children}</div>
    </section>
  )
}

// Pestañas subrayadas para colocar al pie de una Banda.
export function PestanasBanda<T extends string>({ items, activa, onCambiar }: {
  items: { id: T; label: string; n?: number | null }[]
  activa: T
  onCambiar: (id: T) => void
}) {
  return (
    <nav className="flex gap-6 md:gap-8 overflow-x-auto mt-6 -mb-px">
      {items.map((t) => {
        const on = t.id === activa
        return (
          <button key={t.id} type="button" onClick={() => onCambiar(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap py-3 border-b-[3px] text-[17px] transition-colors ${
              on ? 'border-gold-500 text-tinta font-semibold' : 'border-transparent text-tinta-2 hover:text-tinta'
            }`}>
            {t.label}
            {t.n != null && <span className={`text-[14px] ${on ? 'text-acento' : 'text-tenue'}`}>{t.n}</span>}
          </button>
        )
      })}
    </nav>
  )
}

// Encabezado de pantalla a todo lo ancho para usar DENTRO de un contenedor angosto (p. ej. los
// paneles de /inicio): rompe el contenedor con w-screen y centra su contenido al ancho indicado.
// El <main> que lo contiene no debe tener padding superior.
export function EncabezadoPantalla({ titulo, subtitulo, derecha, children, ancho = 'max-w-[960px]' }: {
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  derecha?: React.ReactNode
  children?: React.ReactNode
  ancho?: string
}) {
  return (
    <section className="tema-oscuro bg-superficie text-tinta w-screen relative left-1/2 -translate-x-1/2 px-4 md:px-8 mb-3">
      <div className={`w-full ${ancho} mx-auto py-8 md:py-10 flex flex-col gap-5`}>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] md:text-[46px] font-medium leading-[1.1]">{titulo}</h1>
            {subtitulo && <p className="text-[19px] md:text-[20px] text-tinta-2 max-w-[720px] leading-relaxed">{subtitulo}</p>}
          </div>
          {derecha}
        </div>
        {children}
      </div>
    </section>
  )
}

// Banda de un paso del recorrido (/empezar, /buscar): barra superior (marca e iniciar sesión),
// regresar, avance y título del paso, a todo lo ancho aunque el recorrido sea una columna.
export function BandaPaso({ barra, atras, avance, etiqueta, titulo, subtitulo, ancho = 'max-w-[640px]' }: {
  barra?: React.ReactNode
  atras?: React.ReactNode
  avance?: React.ReactNode
  etiqueta?: React.ReactNode
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  ancho?: string
}) {
  return (
    <section className="tema-oscuro bg-superficie text-tinta w-screen relative left-1/2 -translate-x-1/2 px-5 md:px-8">
      {barra && <div className={`w-full ${ancho} mx-auto h-16 flex items-center justify-between border-b border-linea`}>{barra}</div>}
      <div className={`w-full ${ancho} mx-auto pt-6 pb-8 md:pb-10 flex flex-col gap-4`}>
        {(atras || avance || etiqueta) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {atras}
            {avance}
            {etiqueta && <span className="text-[16px] font-medium text-tinta-2">{etiqueta}</span>}
          </div>
        )}
        <h1 className="font-display text-[36px] md:text-[46px] font-medium leading-[1.1]">{titulo}</h1>
        {subtitulo && <p className="text-[19px] md:text-[20px] text-tinta-2 leading-relaxed">{subtitulo}</p>}
      </div>
    </section>
  )
}

// Marca de la barra superior del recorrido.
export function MarcaBarra({ href = '/bienvenida' }: { href?: string }) {
  return (
    <a href={href} className="flex items-center gap-2.5">
      <Marca texto={19} />
    </a>
  )
}

// Barras de avance de un recorrido.
export function Avance({ total, hechos, color = 'var(--c-acento)' }: { total: number; hechos: number; color?: string }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, k) => (
        <div key={k} className="w-10 h-1.5 rounded-full" style={{ background: k < hechos ? color : 'var(--c-linea-fuerte)' }} />
      ))}
    </div>
  )
}
