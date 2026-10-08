import { NextRequest, NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { avisarOperacion } from '@/lib/avisos'
import { etiquetaRol } from '@/lib/roles'

// Solicitud de registro desde /bienvenida (propietario, broker o comprador). Sin sesión. Antes el
// navegador insertaba directo en `solicitudes` y Operación no se enteraba hasta abrir /panel; los
// brokers del piloto se registran justo por aquí, así que ahora pasa por el servidor para avisar a
// Operación (paso 2 del plan V6.3, hallazgo de la prueba de JC del 2026-10-07).
//
// Defensas contra spam (sin migración):
//   - campo trampa `sitio_web` (oculto): si viene lleno se responde OK sin guardar;
//   - máximo 3 solicitudes por correo por hora;
//   - si en la última hora ya llegaron más de 20 solicitudes, se guardan pero NO se manda aviso
//     (para que una ráfaga no llene la bandeja de Operación).
// La política RLS de insert para anon (status = 'pendiente') sigue vigente como defensa.

const ROLES = ['propietario', 'broker', 'inversionista']
const MAX_POR_CORREO = 3
const MAX_AVISOS_POR_HORA = 20
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (texto(body.sitio_web, 200)) return NextResponse.json({ ok: true })

    const rol = ROLES.includes(body.rol) ? (body.rol as string) : null
    const nombre = texto(body.nombre, 120)
    const email = texto(body.email, 160).toLowerCase()
    const telefono = texto(body.telefono, 40)
    const empresa = texto(body.empresa, 160)
    const datos: Record<string, string> = {}
    if (body.datos && typeof body.datos === 'object') {
      for (const [k, v] of Object.entries(body.datos as Record<string, unknown>).slice(0, 6)) datos[k.slice(0, 40)] = texto(v, 300)
    }

    if (!rol) return NextResponse.json({ error: 'Elige cómo quieres participar' }, { status: 400 })
    if (nombre.length < 2) return NextResponse.json({ error: 'Escribe tu nombre' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Escribe un correo válido' }, { status: 400 })

    const admin = getSupabaseAdmin()
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()
    const { count: delCorreo } = await admin.from('solicitudes').select('id', { count: 'exact', head: true })
      .eq('email', email).gte('created_at', haceUnaHora)
    if ((delCorreo ?? 0) >= MAX_POR_CORREO) {
      return NextResponse.json({ error: 'Ya recibimos tu solicitud; te contactaremos pronto' }, { status: 429 })
    }

    const { error } = await admin.from('solicitudes').insert({ nombre, email, telefono, rol, empresa, datos, status: 'pendiente' })
    if (error) return NextResponse.json({ error: 'Error al enviar la solicitud. Intenta de nuevo.' }, { status: 500 })

    const { count: recientes } = await admin.from('solicitudes').select('id', { count: 'exact', head: true }).gte('created_at', haceUnaHora)
    if ((recientes ?? 0) <= MAX_AVISOS_POR_HORA) {
      const detalle = Object.values(datos).filter(Boolean).join(' · ')
      after(() => avisarOperacion({
        asunto: `Nueva solicitud de registro · ${etiquetaRol(rol)}`,
        titulo: `Quiere unirse como ${etiquetaRol(rol).toLowerCase()}`,
        lineas: [
          `${nombre}${empresa ? ` (${empresa})` : ''}.`,
          ...(detalle ? [detalle] : []),
          'Apruébala en /panel para enviarle la invitación por correo.',
        ],
        enlace: { texto: 'Revisar solicitudes en /panel', ruta: '/panel' },
      }, { esDemo: false }))
    } else {
      console.warn(`[solicitudes] ${recientes} solicitudes en la última hora: aviso omitido`)
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error al enviar la solicitud. Intenta de nuevo.' }, { status: 500 })
  }
}
