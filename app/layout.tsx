import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { AppProvider } from './providers'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'SMTBROKER — Plataforma IA de Ventas Inmobiliarias',
  description: 'Valuación, marketing y cierre de activos inmobiliarios con inteligencia artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  )
}
