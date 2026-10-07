// Avisos por correo (paso 2 del plan V6.3; requisito 2 del Plan Piloto: "sin avisos, las
// solicitudes podrían quedarse días sin atender"). SOLO servidor.
//
// Envía con la API HTTP de Resend (sin dependencias), desde el dominio ya verificado
// mail.mindbridge.com.mx. Reglas:
//   - Nunca rompe la acción que lo dispara: si falla, solo queda en el log. Las rutas lo llaman
//     dentro de `after()` (next/server) para no retrasar la respuesta.
//   - Sin RESEND_API_KEY no envía: registra el aviso en el log (así funciona igual en local).
//   - El mundo demo NUNCA envía correos (lib/mundo.ts): las cuentas del video no deben llenar
//     bandejas reales.
// Variables: RESEND_API_KEY, OPERACION_EMAIL (a quién le llegan los avisos de Operación) y,
// opcional, NEXT_PUBLIC_SITE_URL para los enlaces.
import type { SupabaseClient } from '@supabase/supabase-js'

const REMITENTE = 'SMTBROKER <notificaciones@mail.mindbridge.com.mx>'
// RESEND_API_URL solo para pruebas: scripts/verificar-avisos.mjs apunta a un receptor local.
const URL_RESEND = process.env.RESEND_API_URL || 'https://api.resend.com/emails'
const SITIO = (process.env.NEXT_PUBLIC_SITE_URL || 'https://smtbroker.vercel.app').replace(/\/$/, '')

export interface Aviso {
  asunto: string
  titulo: string
  lineas: string[]
  enlace?: { texto: string; ruta: string }
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function html(a: Aviso): string {
  const boton = a.enlace
    ? `<p style="margin:24px 0"><a href="${SITIO}${a.enlace.ruta}" style="background:#c9a227;color:#070f1c;padding:12px 20px;text-decoration:none;font-family:monospace">${escapar(a.enlace.texto)}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a2233">
<p style="font-family:monospace;font-size:12px;color:#8a6d14;letter-spacing:1px">SMTBROKER</p>
<h2 style="font-weight:500">${escapar(a.titulo)}</h2>
${a.lineas.map((l) => `<p style="margin:6px 0">${escapar(l)}</p>`).join('\n')}
${boton}
<p style="font-size:11px;color:#888;margin-top:32px">Aviso automático de SMTBROKER by MindBridge.</p>
</div>`
}

const texto = (a: Aviso) =>
  [a.titulo, '', ...a.lineas, ...(a.enlace ? ['', `${a.enlace.texto}: ${SITIO}${a.enlace.ruta}`] : [])].join('\n')

async function enviar(para: string, a: Aviso): Promise<void> {
  const llave = process.env.RESEND_API_KEY?.trim()
  if (!llave) {
    console.info(`[aviso sin enviar: falta RESEND_API_KEY] para=${para} asunto="${a.asunto}"`)
    return
  }
  try {
    const r = await fetch(URL_RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [para], subject: a.asunto, html: html(a), text: texto(a) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) console.error(`[aviso] Resend respondió ${r.status}: ${(await r.text()).slice(0, 300)}`)
  } catch (e) {
    console.error('[aviso] no se pudo enviar:', e instanceof Error ? e.message : e)
  }
}

/** Aviso al equipo de Operación MindBridge (OPERACION_EMAIL). */
export async function avisarOperacion(a: Aviso, mundo: { esDemo: boolean }): Promise<void> {
  if (mundo.esDemo) return
  const para = process.env.OPERACION_EMAIL?.trim()
  if (!para) {
    console.info(`[aviso sin enviar: falta OPERACION_EMAIL] asunto="${a.asunto}"`)
    return
  }
  await enviar(para, a)
}

/** Aviso a un usuario de la plataforma (su correo de Auth). */
export async function avisarUsuario(admin: SupabaseClient, uid: string, a: Aviso, mundo: { esDemo: boolean }): Promise<void> {
  if (mundo.esDemo) return
  try {
    const { data } = await admin.auth.admin.getUserById(uid)
    const para = data?.user?.email
    if (para) await enviar(para, a)
  } catch (e) {
    console.error('[aviso] no se encontró el correo del usuario:', e instanceof Error ? e.message : e)
  }
}
