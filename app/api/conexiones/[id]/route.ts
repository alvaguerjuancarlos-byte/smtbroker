import { NextRequest, NextResponse, after } from 'next/server'
import { sesionServidor, type SesionServidor } from '@/lib/sesionServidor'
import { avisarOperacion } from '@/lib/avisos'
import { millones } from '@/lib/necesidad'
import {
  fase, rolEn, ladoComprador, TEXTO_FASE, validarHorarios, validarOferta, validarCalificacion,
  type ResultadoVisita, type RespuestaCompra,
} from '@/lib/conexion'
import { COLS_CONEXION, avisarPartes, nombresDe, telefonoDe, fechaHora, type FilaConexion } from '@/lib/conexionServidor'

// Una conexión (Documento Maestro V8, Parte 3, §21).
//
// GET  → la conexión para quien es parte de ella (o Operación): la propiedad, las partes, la
//        conversación, la visita y, SOLO con la visita confirmada, los teléfonos (§21.3). Al lado del
//        comprador también le llega la referencia de su análisis para la intención de oferta.
// POST {accion, ...}:
//   validar | rechazar            Operación, cuando la validación es manual (§21.2)
//   mensaje {texto}               cualquiera de las partes (§21.3); se avisa a las demás
//   proponer_horarios {horarios}  lado del comprador: 2 o 3 horarios (§21.4)
//   confirmar_visita {horario}    quien ofrece la propiedad elige uno; se comparten los teléfonos
//   resultado_visita {resultado, motivo?}  el comprador: me interesa / quiero ofertar / la descarto
//   oferta {monto, formaPago}     lado del comprador: intención NO vinculante, se envía como dato (§21.5)
//   reportar_cierre {precio, fecha}  quien ofrece la propiedad (§21.7, paso 1)
//   confirmar_cierre              el comprador (paso 2: doble confirmación)
//   compre {respuesta}            el comprador, en el seguimiento de 30, 60 y 90 días (paso 3)
//   calificar {atencion, rapidez, honestidad, comentario?}  el comprador califica al broker (paso 4)
// La plataforma no negocia: no hay contraoferta ni contrato aquí.

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const FORMA_PAGO: Record<string, string> = { contado: 'contado', credito: 'crédito bancario', infonavit: 'Infonavit / Fovissste' }

async function cargar(s: SesionServidor, id: string) {
  const { data } = await s.admin.from('conexiones').select(COLS_CONEXION).eq('id', id).maybeSingle()
  const c = data as FilaConexion | null
  if (!c || c.es_demo !== s.esDemo) return null
  const rol = rolEn(c, s.uid)
  if (!rol && !s.esOperacion) return null
  return { c, rol }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const r = await cargar(s, (await ctx.params).id)
    if (!r) return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 })
    const { c, rol } = r

    const [{ data: activo }, { data: mens }, nombres, { data: calif }] = await Promise.all([
      s.admin.from('activos').select('id, nombre, tipo, municipio, colonia, superficie, precio_total').eq('id', c.activo_id).single(),
      s.admin.from('mensajes').select('id, autor_id, texto, created_at').eq('conexion_id', c.id).order('created_at'),
      nombresDe(s.admin, [c.comprador_id, c.contraparte_id, c.broker_comprador_id ?? '']),
      s.admin.from('calificaciones').select('atencion, rapidez, honestidad, comentario').eq('conexion_id', c.id).maybeSingle(),
    ])
    // Teléfonos solo con la visita confirmada (§21.3). Del lado del comprador con broker, el de su broker.
    const telefonos = c.visita_confirmada_at ? {
      comprador: await telefonoDe(s.admin, c.broker_comprador_id ?? c.comprador_id, !!c.broker_comprador_id),
      contraparte: await telefonoDe(s.admin, c.contraparte_id, c.contraparte_es_broker),
    } : null
    let referencia = null
    if (ladoComprador(rol)) {
      const { data: an } = await s.admin.from('analisis').select('resultado').eq('usuario_id', c.comprador_id).eq('activo_id', c.activo_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const m = (an as { resultado: { mercado?: { precio?: { rangoMinMXN: number | null; rangoMaxMXN: number | null; precioSalidaRecomendadoMXN: number | null }; semaforo?: { texto: string } } } } | null)?.resultado?.mercado
      referencia = m ? { ...m.precio, texto: m.semaforo?.texto ?? null } : null
    }
    const f = fase(c)
    return NextResponse.json({
      conexion: {
        id: c.id, estado: c.estado, origen: c.origen, validacion: c.validacion, horarios_propuestos: c.horarios_propuestos,
        visita_at: c.visita_at, visita_confirmada_at: c.visita_confirmada_at, visita_resultado: c.visita_resultado,
        oferta_monto: c.oferta_monto, oferta_forma_pago: c.oferta_forma_pago, oferta_at: c.oferta_at,
        cierre_precio: c.cierre_precio, cierre_fecha: c.cierre_fecha, cierre_reportado_at: c.cierre_reportado_at,
        cierre_confirmado_at: c.cierre_confirmado_at, compro_respuesta: c.compro_respuesta, created_at: c.created_at,
        ...(s.esOperacion ? { aporte: c.aporte } : {}),
      },
      rol: rol ?? 'operacion', fase: f, textoFase: TEXTO_FASE[f],
      activo,
      partes: {
        comprador: nombres.get(c.comprador_id), contraparte: nombres.get(c.contraparte_id), contraparteEsBroker: c.contraparte_es_broker,
        brokerComprador: c.broker_comprador_id ? nombres.get(c.broker_comprador_id) : null,
      },
      telefonos, referencia,
      mensajes: ((mens as { id: string; autor_id: string; texto: string; created_at: string }[]) || []).map((m) => ({
        id: m.id, autor: nombres.get(m.autor_id) ?? 'Usuario', mio: m.autor_id === s.uid, texto: m.texto, created_at: m.created_at,
      })),
      calificacion: calif ?? null,
      puedeCalificar: rol === 'comprador' && !!c.cierre_confirmado_at && !calif && (c.contraparte_es_broker || !!c.broker_comprador_id),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await sesionServidor(req)
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const r = await cargar(s, (await ctx.params).id)
    if (!r) return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 })
    const { c, rol } = r
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const ahora = new Date().toISOString()
    const { data: ad } = await s.admin.from('activos').select('id, nombre, broker_id, precio_total').eq('id', c.activo_id).single()
    const activo = ad as { id: string; nombre: string; broker_id: string | null; precio_total: number | null }
    const yo = (await nombresDe(s.admin, [s.uid])).get(s.uid) ?? 'Usuario'
    const enlace = { texto: 'Abrir la conversación', ruta: `/conexion/${c.id}` }
    const actualizar = async (cambios: Record<string, unknown>) => {
      const { error } = await s.admin.from('conexiones').update({ ...cambios, actualizado_at: ahora }).eq('id', c.id)
      return error
    }
    const falla = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
    const listo = () => NextResponse.json({ ok: true })
    const activa = c.estado === 'activa'

    switch (b.accion) {
      case 'validar':
      case 'rechazar': {
        if (!s.esOperacion) return falla('Solo Operación valida conexiones', 403)
        if (c.estado !== 'por_validar') return falla('Esta conexión ya se revisó', 409)
        const err = await actualizar({ estado: b.accion === 'validar' ? 'activa' : 'rechazada', validada_at: ahora })
        if (err) return falla(err.message, 500)
        if (b.accion === 'validar') after(() => avisarPartes(s.admin, c, {
          asunto: `Conexión lista: ${activo.nombre}`, titulo: 'Ya pueden conversar',
          lineas: [`Operación validó la conexión para ${activo.nombre}.`, 'Escríbanse por la plataforma y acuerden la visita.'], enlace,
        }))
        return listo()
      }

      case 'mensaje': {
        if (!rol) return falla('Solo las partes escriben', 403)
        if (!activa) return falla('La conversación no está abierta', 409)
        const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 2000) : ''
        if (!texto) return falla('Escribe un mensaje')
        const { error } = await s.admin.from('mensajes').insert({ conexion_id: c.id, autor_id: s.uid, texto })
        if (error) return falla(error.message, 500)
        await actualizar({})
        // Aviso por correo (el aviso por WhatsApp espera las plantillas aprobadas, §21.3).
        after(() => avisarPartes(s.admin, c, {
          asunto: `Mensaje nuevo de ${yo} · ${activo.nombre}`, titulo: `${yo} te escribió`,
          lineas: [texto.length > 180 ? texto.slice(0, 180) + '…' : texto], enlace,
        }, s.uid))
        return listo()
      }

      case 'proponer_horarios': {
        if (!ladoComprador(rol)) return falla('Los horarios los propone el comprador', 403)
        if (!activa || c.visita_confirmada_at) return falla('Ya no se pueden proponer horarios', 409)
        const h = validarHorarios(b.horarios)
        if ('error' in h) return falla(h.error)
        const err = await actualizar({ horarios_propuestos: h.horarios })
        if (err) return falla(err.message, 500)
        after(() => avisarPartes(s.admin, c, {
          asunto: `Propuesta de visita · ${activo.nombre}`, titulo: 'Elige un horario para la visita',
          lineas: h.horarios.map((x) => `• ${fechaHora(x)}`), enlace,
        }, s.uid))
        return listo()
      }

      case 'confirmar_visita': {
        if (rol !== 'contraparte') return falla('La visita la confirma quien ofrece la propiedad', 403)
        if (!activa) return falla('La conexión no está activa', 409)
        const horario = c.horarios_propuestos.find((x) => new Date(x).getTime() === new Date(String(b.horario)).getTime())
        if (!horario) return falla('Elige uno de los horarios propuestos')
        const err = await actualizar({ visita_at: horario, visita_confirmada_at: ahora, recordatorio_enviado_at: null, como_te_fue_enviado_at: null })
        if (err) return falla(err.message, 500)
        after(() => avisarPartes(s.admin, c, {
          asunto: `Visita confirmada · ${activo.nombre}`, titulo: 'Visita confirmada',
          lineas: [`${fechaHora(horario)}.`, 'Ya pueden ver sus teléfonos en la conversación.'], enlace,
        }, s.uid))
        return listo()
      }

      case 'resultado_visita': {
        if (rol !== 'comprador') return falla('Solo el comprador cuenta cómo le fue', 403)
        if (!c.visita_at || new Date(c.visita_at).getTime() > Date.now()) return falla('Todavía no es la visita', 409)
        const resultado = b.resultado as ResultadoVisita
        if (!['me_interesa', 'quiero_ofertar', 'descarto'].includes(resultado)) return falla('Respuesta inválida')
        const motivo = resultado === 'descarto' && typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 40) || null : null
        const err = await actualizar({ visita_resultado: resultado, motivo_descarte: motivo, ...(resultado === 'descarto' ? { estado: 'descartada' } : {}) })
        if (err) return falla(err.message, 500)
        if (resultado === 'descarto') after(() => avisarPartes(s.admin, c, {
          asunto: `${activo.nombre}: el comprador la descartó`, titulo: 'El comprador descartó la propiedad',
          lineas: [motivo ? `Motivo: ${motivo}.` : 'No dejó motivo.'], enlace,
        }, s.uid))
        return listo()
      }

      case 'oferta': {
        if (!ladoComprador(rol)) return falla('La intención de oferta la registra el comprador', 403)
        if (!activa) return falla('La conexión no está activa', 409)
        const o = validarOferta(b.monto, b.formaPago)
        if ('error' in o) return falla(o.error)
        const err = await actualizar({ oferta_monto: o.monto, oferta_forma_pago: o.formaPago, oferta_at: ahora, ...(c.visita_resultado ? {} : { visita_resultado: 'quiero_ofertar' }) })
        if (err) return falla(err.message, 500)
        const pct = activo.precio_total ? Math.round((o.monto / activo.precio_total - 1) * 1000) / 10 : null
        after(() => avisarPartes(s.admin, c, {
          asunto: `Intención de oferta · ${activo.nombre}`, titulo: 'Recibiste una intención de oferta',
          lineas: [
            `${mxn(o.monto)} de ${FORMA_PAGO[o.formaPago]}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct} % contra el precio pedido de ${millones(activo.precio_total!)})` : ''}.`,
            'No es vinculante: es un dato para negociar. La negociación y el cierre van por su cuenta.',
          ], enlace,
        }, s.uid))
        return listo()
      }

      case 'reportar_cierre': {
        if (rol !== 'contraparte') return falla('El cierre lo reporta quien ofrece la propiedad', 403)
        if (!activa || c.cierre_reportado_at) return falla('El cierre ya se reportó o la conexión no está activa', 409)
        const precio = Number(String(b.precio ?? '').replace(/[^\d.]/g, ''))
        const fecha = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : null
        if (!(precio > 0) || !fecha) return falla('Captura el precio y la fecha del cierre')
        // Con broker, el cierre entra a cierres_reportados (nivel del broker e índice de precios, §16).
        if (c.contraparte_es_broker && activo.broker_id === s.uid) {
          const { error } = await s.admin.from('cierres_reportados').insert({
            activo_id: activo.id, broker_id: s.uid, precio_cierre: precio, fecha_cierre: fecha, conexion_id: c.id,
            origen_comprador: c.broker_comprador_id ? 'otro_broker' : 'comprador_directo',
          })
          if (error) return falla('No se pudo reportar el cierre', 500)
        }
        const err = await actualizar({ cierre_precio: precio, cierre_fecha: fecha, cierre_reportado_at: ahora })
        if (err) return falla(err.message, 500)
        await s.admin.from('activos').update({ status: 'cerrado' }).eq('id', activo.id)
        after(async () => {
          await avisarPartes(s.admin, c, {
            asunto: `Confirma el cierre · ${activo.nombre}`, titulo: 'Confirma tu compra',
            lineas: [`${yo} reportó el cierre de ${activo.nombre} en ${mxn(precio)} (${fecha}).`, 'Confírmalo en la plataforma para que quede verificado.'], enlace,
          }, s.uid)
          await avisarOperacion({
            asunto: `Cierre reportado en una conexión · ${activo.nombre}`, titulo: 'Cierre por verificar',
            lineas: [`${mxn(precio)} · ${fecha}. Falta la confirmación del comprador.`], enlace: { texto: 'Abrir la consola', ruta: '/panel' },
          }, { esDemo: c.es_demo })
        })
        return listo()
      }

      case 'confirmar_cierre': {
        if (rol !== 'comprador') return falla('El cierre lo confirma el comprador', 403)
        if (!c.cierre_reportado_at || c.cierre_confirmado_at) return falla('No hay un cierre por confirmar', 409)
        const err = await actualizar({ cierre_confirmado_at: ahora, estado: 'cerrada' })
        if (err) return falla(err.message, 500)
        after(() => avisarOperacion({
          asunto: `Cierre confirmado por ambas partes · ${activo.nombre}`, titulo: 'Cierre con doble confirmación',
          lineas: [`${mxn(c.cierre_precio ?? 0)} · ${c.cierre_fecha}. Verifícalo para el nivel del broker y el índice de precios.`],
          enlace: { texto: 'Abrir la consola', ruta: '/panel' },
        }, { esDemo: c.es_demo }))
        return listo()
      }

      case 'compre': {
        if (rol !== 'comprador') return falla('Solo el comprador responde', 403)
        const respuesta = b.respuesta as RespuestaCompra
        if (!['si_esta', 'no_aun', 'otra'].includes(respuesta)) return falla('Respuesta inválida')
        const err = await actualizar({ compro_respuesta: respuesta, compro_respuesta_at: ahora })
        if (err) return falla(err.message, 500)
        // Protege contra brincarse la plataforma (§21.7): dice que compró y nadie reportó el cierre.
        if (respuesta === 'si_esta' && !c.cierre_reportado_at) after(() => avisarOperacion({
          asunto: `Alerta: el comprador dice que compró · ${activo.nombre}`, titulo: 'Compra sin cierre reportado',
          lineas: ['El comprador dice que ya compró esta propiedad y nadie ha reportado el cierre. Revísalo con quien la ofrecía.'],
          enlace: { texto: 'Abrir la consola', ruta: '/panel' },
        }, { esDemo: c.es_demo }))
        return listo()
      }

      case 'calificar': {
        if (rol !== 'comprador') return falla('Solo el comprador califica', 403)
        if (!c.cierre_confirmado_at) return falla('Se califica al confirmar el cierre', 409)
        const brokerId = c.contraparte_es_broker ? c.contraparte_id : c.broker_comprador_id
        if (!brokerId) return falla('No hubo broker en esta operación', 409)
        const v = validarCalificacion(b)
        if ('error' in v) return falla(v.error)
        const { error } = await s.admin.from('calificaciones').insert({ conexion_id: c.id, broker_id: brokerId, comprador_id: s.uid, ...v })
        if (error) return falla(/duplicate|unique/i.test(error.message) ? 'Ya calificaste esta operación' : error.message, /duplicate|unique/i.test(error.message) ? 409 : 500)
        return listo()
      }
    }
    return falla('Acción desconocida')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
