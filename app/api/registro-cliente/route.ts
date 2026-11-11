import { NextRequest, NextResponse, after } from 'next/server'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { avisarOperacion } from '@/lib/avisos'
import { validarNecesidad, resumenNecesidad, validarOperacionActivo } from '@/lib/necesidad'
import { guardarNecesidad } from '@/lib/necesidadServidor'

// Registro inmediato de un cliente desde el recorrido guiado /empezar (Documento Maestro V7.2,
// decisión de JC del 1-nov-2026). Sin sesión. Crea en un paso:
//   - la cuenta (correo y contraseña, ya confirmada: el cliente sigue el recorrido sin esperar);
//   - su fila en `usuarios` (propietario o comprador) y su WhatsApp en contactos_cliente;
//   - su propiedad (vender) o lo que busca (comprar).
// Los brokers NO se registran aquí: siguen pasando por /bienvenida y la aprobación de Operación.
//
// Mundo demo (lib/mundo.ts): un correo @demo.smtbroker.mx se registra en el mundo demo -- así se
// graba el recorrido para el video sin crear cuentas reales (el grabador las borra al terminar).
//
// Defensas: campo trampa `sitio_web`; máximo 5 registros por IP por hora (la IP se guarda solo
// como hash); correo ya registrado → 409 (que inicie sesión). El Agente de Mercado reusa el
// diagnóstico guardado, así que una cuenta no lo dispara más de una vez por propiedad.

const MAX_POR_IP_HORA = 5
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const numero = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
const ipDe = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()
  try {
    const b = await req.json().catch(() => ({}))
    if (texto(b.sitio_web, 200)) return NextResponse.json({ ok: true, trampa: true })

    const quiere = b.quiere === 'vender' || b.quiere === 'comprar' ? b.quiere as 'vender' | 'comprar' : null
    const nombre = texto(b.nombre, 120)
    const email = texto(b.email, 160).toLowerCase()
    const password = typeof b.password === 'string' ? b.password : ''
    const telefono = texto(b.telefono, 40)
    if (!quiere) return NextResponse.json({ error: 'Elige si quieres vender o comprar' }, { status: 400 })
    if (nombre.length < 2) return NextResponse.json({ error: 'Escribe tu nombre' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Escribe un correo válido' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    if (telefono.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Escribe tu WhatsApp a 10 dígitos' }, { status: 400 })

    // Lo de la propiedad o la búsqueda, validado ANTES de crear la cuenta.
    const p = (b.propiedad ?? {}) as Record<string, unknown>
    const s = (b.busqueda ?? {}) as Record<string, unknown>
    const propiedad = {
      tipo: texto(p.tipo, 40), superficie: numero(p.superficie), municipio: texto(p.municipio, 80),
      colonia: texto(p.colonia, 80), precio: numero(p.precio),
    }
    const busqueda = { busca: texto(s.busca, 120), zona: texto(s.zona, 120), presupuesto: texto(s.presupuesto, 40) }
    // V9 (§22.3): la propiedad está en venta, en renta o en las dos, con su precio y/o su renta.
    const op = validarOperacionActivo(p)
    if (quiere === 'vender' && (!propiedad.tipo || !propiedad.municipio)) {
      return NextResponse.json({ error: 'Faltan el tipo o el municipio de tu propiedad' }, { status: 400 })
    }
    if (quiere === 'vender' && 'error' in op) return NextResponse.json({ error: op.error }, { status: 400 })
    // V8 (§19): quien compra llega con su ficha de necesidad completa. La forma vieja (qué busca,
    // zona y presupuesto en texto) se acepta mientras quede alguna página que la mande.
    const ficha = quiere === 'comprar' && b.necesidad ? validarNecesidad(b.necesidad) : null
    if (ficha && 'error' in ficha) return NextResponse.json({ error: ficha.error }, { status: 400 })
    if (quiere === 'comprar' && !ficha && (!busqueda.busca || !busqueda.zona || !busqueda.presupuesto)) {
      return NextResponse.json({ error: 'Falta qué buscas, la zona o el presupuesto' }, { status: 400 })
    }

    const esDemo = email.endsWith('@demo.smtbroker.mx')
    const ipHash = createHash('sha256').update(ipDe(req)).digest('hex').slice(0, 32)
    const { count } = await admin.from('contactos_cliente').select('usuario_id', { count: 'exact', head: true })
      .eq('registro_ip_hash', ipHash).gte('created_at', new Date(Date.now() - 3600 * 1000).toISOString())
    if ((count ?? 0) >= MAX_POR_IP_HORA) return NextResponse.json({ error: 'Demasiados registros desde esta conexión. Intenta en una hora.' }, { status: 429 })

    const { data: creado, error: eUser } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (eUser || !creado?.user) {
      const ya = /already|registered|exists/i.test(eUser?.message ?? '')
      return NextResponse.json({ error: ya ? 'Ese correo ya tiene cuenta: inicia sesión' : (eUser?.message ?? 'No se pudo crear la cuenta'), yaExiste: ya }, { status: ya ? 409 : 500 })
    }
    const uid = creado.user.id
    // Si algo de aquí en adelante falla, se borra la cuenta: no quedan cuentas a medias.
    const deshacer = async () => { await admin.auth.admin.deleteUser(uid) }

    const rol = quiere === 'vender' ? 'propietario' : 'inversionista'
    const { error: eU } = await admin.from('usuarios').upsert({ id: uid, nombre, rol, es_demo: esDemo })
    if (eU) { await deshacer(); return NextResponse.json({ error: eU.message }, { status: 500 }) }
    await admin.from('contactos_cliente').insert({ usuario_id: uid, telefono, registro_ip_hash: ipHash })

    let activoId: string | null = null
    if (quiere === 'vender') {
      const lugar = propiedad.colonia || propiedad.municipio
      const { data, error } = await admin.from('activos').insert({
        usuario_id: uid, cargado_por: 'propietario', nombre: `${propiedad.tipo} en ${lugar}`, tipo: propiedad.tipo,
        superficie: propiedad.superficie, municipio: propiedad.municipio, colonia: propiedad.colonia || null,
        estado: 'Nuevo León', status: 'ingresado', es_demo: esDemo,
        ...('error' in op ? {} : { precio_total: op.precio_total, operacion: op.operacion, renta_mensual: op.renta_mensual, renta: op.renta }),
      }).select('id').single()
      if (error) { await deshacer(); return NextResponse.json({ error: error.message }, { status: 500 }) }
      activoId = (data as { id: string }).id
    } else if (ficha) {
      const g = await guardarNecesidad(admin, uid, ficha.necesidad, { esDemo })
      if ('error' in g) { await deshacer(); return NextResponse.json({ error: g.error }, { status: g.status }) }
    } else {
      const { error } = await admin.from('perfiles_intencion').insert({
        usuario_id: uid, tipo_activo_interes: busqueda.busca, zona: busqueda.zona, presupuesto: busqueda.presupuesto,
        fuente_captura: 'registro_directo', es_demo: esDemo,
      })
      if (error) { await deshacer(); return NextResponse.json({ error: error.message }, { status: 500 }) }
    }

    after(() => avisarOperacion({
      asunto: `Nuevo cliente: ${nombre} quiere ${quiere}`,
      titulo: `Se registró un cliente que quiere ${quiere}`,
      lineas: [quiere === 'vender'
        ? `${propiedad.tipo} en ${propiedad.colonia ? `${propiedad.colonia}, ` : ''}${propiedad.municipio}.`
        : ficha && 'necesidad' in ficha ? `${resumenNecesidad(ficha.necesidad)}.` : `Busca ${busqueda.busca} en ${busqueda.zona} · ${busqueda.presupuesto}.`],
      enlace: { texto: 'Abrir la consola', ruta: '/panel' },
    }, { esDemo }))
    return NextResponse.json({ ok: true, activoId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
