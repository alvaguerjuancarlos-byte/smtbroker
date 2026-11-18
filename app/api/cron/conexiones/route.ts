import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { avisarUsuario } from '@/lib/avisos'
import { tocaSieteDias, seguimientoPendiente, DIAS_SEGUIMIENTO } from '@/lib/conexion'
import { COLS_CONEXION, type FilaConexion } from '@/lib/conexionServidor'

// Cron diario de las conexiones (Documento Maestro V8, Parte 3; vercel.json, 9:00 de Monterrey):
//   - V10 §25.3: "¿Cómo va con esta propiedad?" a los 7 días de validada, una vez;
//   - "¿ya compraste?" a los 30, 60 y 90 días sin cierre (§21.7; en renta "¿ya rentaste?" a 30 y 60).
// V10 §25.6: se retiraron el recordatorio de visita y el "¿cómo te fue?" (ya no hay visita agendada).
// Vercel manda `Authorization: Bearer $CRON_SECRET` cuando la variable existe; sin ella, solo se
// acepta la llamada del propio cron de Vercel (user-agent vercel-cron).

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET?.trim()
  const autorizado = secreto
    ? req.headers.get('authorization') === `Bearer ${secreto}`
    : (req.headers.get('user-agent') || '').startsWith('vercel-cron')
  if (!autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data } = await admin.from('conexiones').select(COLS_CONEXION).eq('estado', 'activa')
  const C = (data as FilaConexion[]) || []
  const ids = [...new Set(C.map((c) => c.activo_id))]
  const { data: activos } = ids.length ? await admin.from('activos').select('id, nombre').in('id', ids) : { data: [] }
  const nombreDe = new Map(((activos as { id: string; nombre: string }[]) || []).map((a) => [a.id, a.nombre]))
  const ahora = new Date().toISOString()
  const cuenta = { sieteDias: 0, seguimientos: 0 }

  // Qué conexiones son de renta: por su ficha o, sin ficha, porque la propiedad solo está en renta.
  const idsNec = [...new Set(C.map((c) => c.necesidad_id).filter((x): x is string => !!x))]
  const [{ data: necs }, { data: acts }] = await Promise.all([
    idsNec.length ? admin.from('necesidades').select('id, operacion').in('id', idsNec) : Promise.resolve({ data: [] }),
    C.length ? admin.from('activos').select('id, operacion').in('id', [...new Set(C.map((c) => c.activo_id))]) : Promise.resolve({ data: [] }),
  ])
  const opNec = new Map(((necs as { id: string; operacion: string }[]) || []).map((n) => [n.id, n.operacion]))
  const opAct = new Map(((acts as { id: string; operacion: string | null }[]) || []).map((a) => [a.id, a.operacion]))
  const rentas = new Set(C.filter((c) => (c.necesidad_id ? opNec.get(c.necesidad_id) === 'renta' : opAct.get(c.activo_id) === 'renta')).map((c) => c.id))

  for (const c of C) {
    const nombre = nombreDe.get(c.activo_id) ?? 'la propiedad'
    const enlace = { texto: 'Abrir la conexión', ruta: `/conexion/${c.id}` }
    if (tocaSieteDias(c)) {
      await avisarUsuario(admin, c.comprador_id, {
        asunto: `¿Cómo va con ${nombre}?`, titulo: '¿Cómo va con esta propiedad?',
        lineas: ['Márcalo con un toque: ya la visité, negociando, cerré o la descarté. Así te avisamos qué sigue.'], enlace,
      }, { esDemo: c.es_demo })
      await admin.from('conexiones').update({ siete_dias_enviado_at: ahora }).eq('id', c.id)
      cuenta.sieteDias++
    }
    // V9 (§22.5): en renta, a los 30 y 60 días y preguntando "¿ya rentaste?".
    const op = rentas.has(c.id) ? 'renta' : 'compra'
    const dias = seguimientoPendiente(c, Date.now(), op)
    if (dias) {
      const verbo = op === 'renta' ? 'rentaste' : 'compraste'
      await avisarUsuario(admin, c.comprador_id, {
        asunto: `¿Ya ${verbo}? · ${nombre}`, titulo: `¿Ya ${verbo}?`,
        lineas: [`Hace ${dias} días conectaste con ${nombre}. ¿Ya ${verbo} esta, otra, o sigues buscando?`], enlace,
      }, { esDemo: c.es_demo })
      // Si el cron se saltó un umbral, no se repite: cuenta todos los ya vencidos.
      await admin.from('conexiones').update({ seguimientos_enviados: DIAS_SEGUIMIENTO.indexOf(dias) + 1 }).eq('id', c.id)
      cuenta.seguimientos++
    }
  }
  return NextResponse.json({ ok: true, revisadas: C.length, ...cuenta })
}
