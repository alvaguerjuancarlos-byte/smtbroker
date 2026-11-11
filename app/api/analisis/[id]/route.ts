import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor } from '@/lib/sesionServidor'
import { avisarOperacion, avisarUsuario } from '@/lib/avisos'

// Acciones del comprador sobre uno de sus análisis (Documento Maestro V8, Parte 2):
//   PATCH {descartar: true}              lo quita de su comparativo (libera lugar de los 5)
//   POST  {accion: 'pedir_certificacion'} la propiedad no está certificada y el comprador pide que se
//         certifique (§20.3). Se avisa a Operación y a quien la ofrece SIN decir quién es el
//         comprador: "un comprador interesado" (§20.5 regla 2).

async function propio(req: NextRequest, id: string) {
  const s = await sesionServidor(req)
  if (!s) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { data } = await s.admin.from('analisis').select('id, activo_id, resultado').eq('id', id).eq('usuario_id', s.uid).maybeSingle()
  const a = data as { id: string; activo_id: string; resultado: Record<string, unknown> } | null
  if (!a) return { error: NextResponse.json({ error: 'Análisis no encontrado' }, { status: 404 }) }
  return { s, a }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await propio(req, (await ctx.params).id)
  if ('error' in r) return r.error
  const b = await req.json().catch(() => ({})) as { descartar?: boolean }
  if (b.descartar !== true) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })
  await r.s.admin.from('analisis').update({ descartado: true }).eq('usuario_id', r.s.uid).eq('activo_id', r.a.activo_id)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await propio(req, (await ctx.params).id)
  if ('error' in r) return r.error
  const b = await req.json().catch(() => ({})) as { accion?: string }
  if (b.accion !== 'pedir_certificacion') return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  if ((r.a.resultado.legal as { certificada?: boolean } | undefined)?.certificada) return NextResponse.json({ error: 'Esta propiedad ya está certificada' }, { status: 409 })
  if (r.a.resultado.certificacionPedidaAt) return NextResponse.json({ ok: true, yaPedida: true })

  const { data } = await r.s.admin.from('activos').select('nombre, usuario_id, broker_id, es_demo').eq('id', r.a.activo_id).maybeSingle()
  const activo = data as { nombre: string; usuario_id: string; broker_id: string | null; es_demo: boolean } | null
  if (!activo) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
  await r.s.admin.from('analisis').update({ resultado: { ...r.a.resultado, certificacionPedidaAt: new Date().toISOString() } }).eq('id', r.a.id)

  const mundo = { esDemo: activo.es_demo }
  after(async () => {
    await avisarOperacion({
      asunto: `Un comprador pidió certificar: ${activo.nombre}`,
      titulo: 'Un comprador interesado pidió la certificación',
      lineas: [`${activo.nombre}.`, 'Contacta a quien la ofrece para iniciar la certificación.'],
      enlace: { texto: 'Abrir la consola', ruta: '/panel' },
    }, mundo)
    await avisarUsuario(r.s.admin, activo.broker_id ?? activo.usuario_id, {
      asunto: `Un comprador interesado quiere tu propiedad certificada: ${activo.nombre}`,
      titulo: 'Certifica tu propiedad',
      lineas: [`Un comprador interesado en ${activo.nombre} pidió que esté certificada.`, 'Las propiedades certificadas generan más confianza y se venden más rápido. La plataforma se encarga de la certificación por ti.'],
      enlace: { texto: 'Pedir la certificación', ruta: `/activo/${r.a.activo_id}` },
    }, mundo)
  })
  return NextResponse.json({ ok: true })
}
