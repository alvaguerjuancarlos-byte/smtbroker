// Tipografía del Agente Legal (Fraunces/IBM Plex) — ya documentada desde el handoff técnico de
// mayo, pero nunca aplicada en código (globals.css sigue en Arial/Geist para todo el resto del
// sitio). Alcance acotado a las pantallas nuevas de catastro/diagnóstico legal — ver plan: no se
// toca `body` en globals.css, así que login/dashboard/marketing/leads no cambian.
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

export const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'], variable: '--font-legal-serif' })
export const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-legal-sans' })
export const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-legal-mono' })

// Aplicar en el wrapper raíz de cada sección nueva: className={legalFontVars}
export const legalFontVars = `${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`
