import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { AppProvider } from './providers'

// Texto: Inter desde el nuevo look (JC 11-nov-2026, estilo C); antes Geist + IBM Plex Sans/Mono.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' })

// Tipografía del rediseño (navy/dorado, ver /login) — declaradas aquí para que Next las
// optimice y precargue, aunque hoy solo las use esa pantalla. Variables aditivas: no cambian
// la tipografía por default de ninguna página existente.
// Títulos y cifras (clase font-display): Space Grotesk desde 2026-10-31, antes Fraunces (serif) — JC la
// quería moderna, digital y minimalista.
const display = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'SMTBROKER — Plataforma IA de Ventas Inmobiliarias',
  description: 'Valuación, marketing y cierre de activos inmobiliarios con inteligencia artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-fondo text-tinta">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  )
}
