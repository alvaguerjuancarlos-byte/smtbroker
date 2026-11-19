import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sesionServidor } from '@/lib/sesionServidor'
import { DOMINIO_DEMO, normalizarUsuario, validarUsuario, esTelefono, diezDigitos, validarContactos, digitos } from '@/lib/entradaDemo'

// Entrada simple del MUNDO DEMO (lib/entradaDemo.ts; guion v12, momento 1; JC, 19-nov-2026): sin
// contraseña ni verificación. Tres acciones:
//   entrar  { usuario }   usuario o teléfono de una cuenta demo → token para abrir la sesión
//   alta    { nombre, usuario, whatsapp, telefono, correo }  (al menos un contacto) → cuenta demo + token
//   rol     { quiere }    (con sesión) comprar → comprador, vender → propietario, mientras la cuenta esté nueva
//
// La sesión se abre sin correo: el servidor genera un enlace mágico (no se envía) y el navegador
// canjea su token con supabase.auth.verifyOtp. Defensas: SOLO cuentas con correo @demo.smtbroker.mx
// y usuarios.es_demo; nunca Operación (broker_maestro); altas limitadas por IP.

const MAX_ALTAS_POR_IP_HORA = 10
const altas = new Map<string, number[]>()
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const ipDe = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
const correoDe = (usuario: string) => `${usuario}@${DOMINIO_DEMO}`
const esCorreoDemo = (email: string | undefined) => !!email && email.toLowerCase().endsWith('@' + DOMINIO_DEMO)

async function todasLasCuentas(admin: SupabaseClient): Promise<User[]> {
  const todas: User[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    todas.push(...data.users)
    if (data.users.length < 1000) break
  }
  return todas
}

/** Token de un solo uso para abrir la sesión de una cuenta demo (no manda correo). */
async function tokenDe(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? 'No se pudo abrir la sesión')
  return data.properties.hashed_token
}

/** La cuenta demo que corresponde a un usuario o teléfono, o null. */
async function buscarCuenta(admin: SupabaseClient, dato: string): Promise<User | null> {
  const cuentas = (await todasLasCuentas(admin)).filter((u) => esCorreoDemo(u.email))
  if (!esTelefono(dato)) {
    const email = correoDe(normalizarUsuario(dato))
    return cuentas.find((u) => u.email?.toLowerCase() === email) ?? null
  }
  const tel = diezDigitos(dato)
  const ids = cuentas.map((u) => u.id)
  // Clientes: su teléfono en contactos_cliente; asesores: el de su solicitud (por correo).
  const { data: cc } = await admin.from('contactos_cliente').select('usuario_id, telefono').in('usuario_id', ids)
  const cliente = (cc ?? []).find((c) => c.telefono && diezDigitos(c.telefono) === tel)
  if (cliente) return cuentas.find((u) => u.id === cliente.usuario_id) ?? null
  const { data: sol } = await admin.from('solicitudes').select('email, telefono').ilike('email', `%@${DOMINIO_DEMO}`)
  const asesor = (sol ?? []).find((s) => s.telefono && diezDigitos(s.telefono) === tel)
  return asesor ? cuentas.find((u) => u.email?.toLowerCase() === asesor.email.toLowerCase()) ?? null : null
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin()
  try {
    const b = await req.json().catch(() => ({}))

    if (b.accion === 'entrar') {
      const dato = texto(b.usuario, 60)
      if (!dato) return NextResponse.json({ error: 'Escribe tu nombre de usuario o tu teléfono' }, { status: 400 })
      const cuenta = await buscarCuenta(admin, dato)
      const { data: fila } = cuenta ? await admin.from('usuarios').select('nombre, rol, es_demo').eq('id', cuenta.id).maybeSingle() : { data: null }
      if (!cuenta || !fila?.es_demo || fila.rol === 'broker_maestro') {
        return NextResponse.json({ error: esTelefono(dato) ? 'No encontré una cuenta con ese teléfono.' : 'No encontré ese usuario.', noExiste: true }, { status: 404 })
      }
      return NextResponse.json({ tokenHash: await tokenDe(admin, cuenta.email!), nombre: fila.nombre, rol: fila.rol })
    }

    if (b.accion === 'alta') {
      const nombre = texto(b.nombre, 120)
      const usuario = normalizarUsuario(texto(b.usuario, 40))
      const contactos = { whatsapp: texto(b.whatsapp, 40), telefono: texto(b.telefono, 40), correo: texto(b.correo, 160).toLowerCase() }
      if (nombre.length < 2) return NextResponse.json({ error: 'Escribe tu nombre' }, { status: 400 })
      const eu = validarUsuario(usuario)
      if (eu) return NextResponse.json({ error: eu, campo: 'usuario' }, { status: 400 })
      const ec = validarContactos(contactos)
      if (ec) return NextResponse.json({ error: ec, campo: 'contacto' }, { status: 400 })

      const ip = ipDe(req)
      const recientes = (altas.get(ip) ?? []).filter((t) => Date.now() - t < 3600_000)
      if (recientes.length >= MAX_ALTAS_POR_IP_HORA) return NextResponse.json({ error: 'Demasiadas altas desde esta conexión. Intenta en una hora.' }, { status: 429 })

      const email = correoDe(usuario)
      const cuentas = await todasLasCuentas(admin)
      if (cuentas.some((u) => u.email?.toLowerCase() === email)) {
        return NextResponse.json({ error: `El usuario ${usuario} ya existe. Elige otro, o entra con él si es tuyo.`, campo: 'usuario', yaExiste: true }, { status: 409 })
      }
      const tel = contactos.whatsapp || contactos.telefono
      if (tel) {
        const { data: cc } = await admin.from('contactos_cliente').select('usuario_id, telefono')
          .in('usuario_id', cuentas.filter((u) => esCorreoDemo(u.email)).map((u) => u.id))
        if ((cc ?? []).some((c) => c.telefono && diezDigitos(c.telefono) === diezDigitos(tel))) {
          return NextResponse.json({ error: 'Ese teléfono ya tiene cuenta: entra con él.', campo: 'contacto', yaExiste: true }, { status: 409 })
        }
      }

      altas.set(ip, [...recientes, Date.now()])
      const { data: creado, error: eUser } = await admin.auth.admin.createUser({
        email, password: randomBytes(24).toString('base64url'), email_confirm: true,
        // Los contactos tal como los dio (el correo de la cuenta es interno: usuario@demo.smtbroker.mx).
        user_metadata: { usuario, nombre, ...contactos, entrada: 'demo' },
      })
      if (eUser || !creado?.user) return NextResponse.json({ error: eUser?.message ?? 'No se pudo crear tu cuenta' }, { status: 500 })
      const uid = creado.user.id
      const deshacer = async () => { await admin.auth.admin.deleteUser(uid) }
      // Comprador por omisión; si en "¿Qué quieres hacer?" elige vender, pasa a propietario (acción rol).
      const { error: eU } = await admin.from('usuarios').upsert({ id: uid, nombre, rol: 'inversionista', es_demo: true })
      if (eU) { await deshacer(); return NextResponse.json({ error: eU.message }, { status: 500 }) }
      await admin.from('contactos_cliente').insert({
        usuario_id: uid, telefono: tel ? digitos(tel).slice(-10).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3') : null,
        registro_ip_hash: createHash('sha256').update(ip).digest('hex').slice(0, 32),
      })
      return NextResponse.json({ tokenHash: await tokenDe(admin, email), nombre, rol: 'inversionista' })
    }

    if (b.accion === 'rol') {
      const s = await sesionServidor(req)
      if (!s || !s.esDemo) return NextResponse.json({ error: 'Solo en el mundo demo' }, { status: 403 })
      const rol = b.quiere === 'vender' ? 'propietario' : b.quiere === 'comprar' ? 'inversionista' : null
      if (!rol) return NextResponse.json({ error: 'Elige comprar o vender' }, { status: 400 })
      if (s.rol === rol) return NextResponse.json({ ok: true, rol })
      if (s.rol !== 'inversionista' && s.rol !== 'propietario') return NextResponse.json({ error: 'Esta cuenta es de asesor: entra con una cuenta de cliente.' }, { status: 409 })
      // Solo una cuenta nueva cambia de lado: con búsquedas, propiedades o conexiones ya no.
      const cuenta = async (tabla: string, col: string) => (await s.admin.from(tabla).select('id', { count: 'exact', head: true }).eq(col, s.uid)).count ?? 0
      const usada = (await cuenta('necesidades', 'usuario_id')) + (await cuenta('activos', 'usuario_id')) + (await cuenta('conexiones', 'comprador_id'))
      if (usada > 0) {
        return NextResponse.json({ error: s.rol === 'propietario'
          ? 'Esta cuenta es de propietario. Para buscar, date de alta con otro usuario.'
          : 'Esta cuenta es de comprador. Para vender, date de alta con otro usuario.' }, { status: 409 })
      }
      const { error } = await s.admin.from('usuarios').update({ rol }).eq('id', s.uid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, rol })
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
