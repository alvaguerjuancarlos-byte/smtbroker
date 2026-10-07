import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { calificarLead, RANGOS_PRESUPUESTO, PLAZOS, FORMAS_PAGO, type Plazo, type FormaPago } from '@/lib/calificacionLeads'

// "Me interesa" de la página pública (Documento Maestro V6.3, §14.2). Sin sesión: lo llena
// cualquier persona interesada. Defensas:
//   - solo para propiedades publicadas y no cerradas;
//   - aceptación del aviso de privacidad obligatoria (LFPDPPP; se guarda la fecha);
//   - campo trampa (`sitio_web`, oculto): si viene lleno es un bot -> se responde OK sin guardar;
//   - máximo 5 envíos por IP por hora (la IP se guarda solo como hash, nunca en claro).
// La calificación (Serio/Calificado/Interesado/Curioso) se calcula AQUÍ con reglas explicables
// (lib/calificacionLeads.ts), nunca se acepta del navegador. El lead lo ven el dueño y el broker
// del activo (RLS) en /activo/[id]/leads.

const LIMITE_POR_HORA = 5

function mensajeError(e: unknown): string { return e instanceof Error ? e.message : String(e) }
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (texto(body.sitio_web, 200)) return NextResponse.json({ ok: true })

    const activoId = texto(body.activoId, 36)
    const nombre = texto(body.nombre, 120)
    const contacto = texto(body.contacto, 160)
    const presupuesto = RANGOS_PRESUPUESTO.includes(body.presupuesto) ? (body.presupuesto as string) : null
    const plazo = (body.plazo in PLAZOS ? body.plazo : null) as Plazo | null
    const formaPago = (body.formaPago in FORMAS_PAGO ? body.formaPago : null) as FormaPago | null
    const mensaje = texto(body.mensaje, 600) || null

    if (!/^[0-9a-f-]{36}$/i.test(activoId)) return NextResponse.json({ error: 'Propiedad no válida' }, { status: 400 })
    if (nombre.length < 2) return NextResponse.json({ error: 'Escribe tu nombre' }, { status: 400 })
    const esCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto)
    const esTelefono = contacto.replace(/\D/g, '').length >= 10
    if (!esCorreo && !esTelefono) return NextResponse.json({ error: 'Escribe un correo o un teléfono a 10 dígitos' }, { status: 400 })
    if (!plazo || !formaPago) return NextResponse.json({ error: 'Indica tu plazo y forma de pago' }, { status: 400 })
    if (body.aceptaAviso !== true) return NextResponse.json({ error: 'Debes aceptar el aviso de privacidad' }, { status: 400 })

    const admin = getSupabaseAdmin()
    const { data } = await admin.from('activos').select('precio_total, publicada_at, status').eq('id', activoId).maybeSingle()
    const activo = data as { precio_total: number | null; publicada_at: string | null; status: string | null } | null
    if (!activo?.publicada_at || activo.status === 'cerrado') return NextResponse.json({ error: 'Esta propiedad ya no está disponible' }, { status: 404 })

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
    const ipHash = createHash('sha256').update(`${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? ''}`).digest('hex')
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin.from('leads').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', haceUnaHora)
    if ((count ?? 0) >= LIMITE_POR_HORA) return NextResponse.json({ error: 'Recibimos varios mensajes desde tu conexión; intenta más tarde' }, { status: 429 })

    const { categoria, razones } = calificarLead({ presupuesto, plazo, formaPago }, activo.precio_total)
    const { error } = await admin.from('leads').insert({
      activo_id: activoId, nombre, contacto, presupuesto, plazo, forma_pago: formaPago, mensaje,
      categoria, razones, consentimiento_at: new Date().toISOString(), ip_hash: ipHash,
    })
    if (error) return NextResponse.json({ error: 'No se pudo enviar. Intenta de nuevo.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 })
  }
}
