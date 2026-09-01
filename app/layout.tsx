import type { Metadata } from 'next'
import { Geist, Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { AppProvider } from './providers'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

// Tipografía del rediseño (navy/dorado, ver /login) — declaradas aquí para que Next las
// optimice y precargue, aunque hoy solo las use esa pantalla. Variables aditivas: no cambian
// la tipografía por default de ninguna página existente.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-fraunces' })
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-sans' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' })

export const metadata: Metadata = {
  title: 'SMTBROKER — Plataforma IA de Ventas Inmobiliarias',
  description: 'Valuación, marketing y cierre de activos inmobiliarios con inteligencia artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  )
}
