// Prueba del inventario del video v12 (scripts/inventario-v12.mjs) contra la app: lo crea, guarda la
// búsqueda de Patricia con una cuenta temporal (renta, 3 recámaras, Valle Poniente, $55k–$60k), Diego
// le propone su depa, y revisa lo que vería en su tablero. Al final BORRA todo.
// Uso: FOTOS=<demo-v2/v12/fotos> node --env-file=.env.local scripts/probar-inventario-v12.mjs   (BASE_URL)
import { createClient } from '@supabase/supabase-js'
import { crearInventario, borrarInventario, ZONA } from './inventario-v12.mjs'

const BASE = process.env.BASE_URL ?? 'https://smtbroker.vercel.app'
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CUENTAS = { ricardo: 'ricardo.villarreal@demo.smtbroker.mx', diego: 'diego.salinas@demo.smtbroker.mx' }
const tokens = {}
const token = async (c) => (tokens[c] ??= (await anon().auth.signInWithPassword({ email: CUENTAS[c], password: process.env.DEMO_PASSWORD })).data.session.access_token)
const llamar = async (tk, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${ruta}: ${r.status} ${j.error ?? ''}`); return j
}
const api = async (cuenta, ruta, cuerpo) => llamar(await token(cuenta), ruta, cuerpo)

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
const ids = Object.fromEntries(Object.entries(CUENTAS).map(([k, e]) => [k, lista.users.find((u) => u.email === e).id]))
let inv = { activos: [], fotos: [] }, cliente = null
try {
  inv = await crearInventario({ admin, api, ids, fotosDir: process.env.FOTOS })

  const alta = await llamar(null, '/api/entrada-demo', { accion: 'alta', nombre: 'Prueba Inventario', usuario: `prueba.entrada.inv${Math.random().toString(36).slice(2, 6)}`, correo: 'inv@ejemplo.mx' }).catch(async () => {
    const r = await fetch(BASE + '/api/entrada-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'alta', nombre: 'Prueba Inventario', usuario: `prueba.entrada.inv${Date.now() % 100000}`, correo: 'inv@ejemplo.mx' }) })
    return r.json()
  })
  const { data: s } = await anon().auth.verifyOtp({ token_hash: alta.tokenHash, type: 'email' })
  cliente = s.user.id
  const tk = s.session.access_token
  await llamar(tk, '/api/necesidades', {
    operacion: 'renta', renta: { plazo_contrato: null, garantia: null, fecha_entrada: null, amueblada: null, mascotas: null },
    tipo: 'departamento', zonas: [{ estado: ZONA.estado, municipio: ZONA.municipio, nombre: '', colonias: [ZONA.colonia] }],
    caracteristicas: { recamaras: '3', preferencias: ['bien ubicado', 'con muy buenas amenidades'] }, presupuesto_min: '55000', presupuesto_max: '60000',
    forma_pago: null, plazo: null, proposito: null, busqueda_directa: true, publicada_brokers: true, camino: 'por_mi_cuenta',
  })
  const { data: nec } = await admin.from('necesidades').select('id').eq('usuario_id', cliente).single()
  await api('diego', '/api/propuestas', { necesidadId: nec.id, activoId: inv.diego.id, aceptoTerminos: true })
  for (let i = 0; i < 30; i++) { const { data } = await admin.from('busquedas_registro').select('resumen').eq('necesidad_id', nec.id).maybeSingle(); if (data) break; await sleep(3000) }
  for (let i = 0; i < 20; i++) { const { data } = await admin.from('propuestas').select('precio_mercado').eq('necesidad_id', nec.id).maybeSingle(); if (data?.precio_mercado) break; await sleep(2000) }

  const t = await llamar(tk, '/api/necesidades')
  const n = t.necesidades[0]
  console.log('\nZONA:', JSON.stringify(n.zonas[0]))
  console.log('REGISTRO:', JSON.stringify(n.registro))
  const nuestras = new Set([...inv.depas.map((d) => d.id), inv.diego.id])
  for (const o of t.bandeja.filter((o) => nuestras.has(o.activoId))) {
    const pm2 = o.precio && o.superficie ? Math.round(o.precio / o.superficie) : null
    const contra = pm2 && n.zonas[0].precioM2 ? Math.round((pm2 / n.zonas[0].precioM2 - 1) * 100) : null
    const an = await llamar(tk, '/api/analisis', { activoId: o.activoId, necesidadId: nec.id }).catch((e) => ({ error: e.message }))
    const { data: fila } = an.id ? await admin.from('analisis').select('resultado').eq('id', an.id).maybeSingle() : { data: null }
    const sem = fila?.resultado?.mercado?.semaforo
    const tarjeta = o.mercado ? `${o.mercado.estado} ${o.mercado.pct}%` : `(zona) ${contra}%`
    const analisis = sem ? `${sem.estado} ${sem.diferenciaPct}%` : JSON.stringify(an).slice(0, 160)
    console.log(`- [${o.origen}${o.broker ? ' · ' + o.broker.nombre : ''}] ${o.titulo} · $${o.precio} · ${o.superficie} m² · TARJETA ${tarjeta} · ANÁLISIS ${analisis} · puntaje ${o.puntaje}`)
  }
  const fuera = [...nuestras].filter((id) => !t.bandeja.some((o) => o.activoId === id))
  console.log(fuera.length ? `NO APARECEN: ${fuera.join(', ')}` : 'Las 4 aparecen en su tablero.')
} catch (e) {
  console.error('ERROR', e.message)
} finally {
  await borrarInventario(admin, inv)
  if (cliente) {
    const { data: pf } = await admin.from('perfiles_intencion').select('id').eq('usuario_id', cliente)
    for (const p of pf ?? []) await admin.from('radar_opciones').delete().eq('perfil_id', p.id)
    await admin.from('busquedas_registro').delete().eq('usuario_id', cliente)
    await admin.from('analisis').delete().eq('usuario_id', cliente)
    for (const x of ['necesidades', 'perfiles_intencion', 'contactos_cliente']) await admin.from(x).delete().eq('usuario_id', cliente)
    await admin.from('usuarios').delete().eq('id', cliente)
    await admin.auth.admin.deleteUser(cliente)
  }
  console.log('Limpieza: inventario y cuenta temporal borrados.')
}
