// Siembra 9 personajes ficticios (3 propietarios, 3 inversionistas, 3 brokers) para poder
// demostrar el funcionamiento de SMTBROKER con datos reales en Supabase, no solo el arreglo
// hardcodeado que traía /panel antes. Cuentas reales de Supabase Auth (no solo filas sueltas) --
// se puede iniciar sesión como cualquiera de ellas para ver su portal real.
//
// Uso: node --env-file=.env.local scripts/seed-demo.mjs
//
// Idempotente: si un correo ya existe, lo reusa en vez de duplicar. Seguro correr más de una vez.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const PASSWORD_DEMO = 'DemoSMT2026!'
const DOMINIO_DEMO = 'demo.smtbroker.mx'

const PROPIETARIOS = [
  { nombre: 'Ricardo Villarreal', slug: 'ricardo.villarreal' },
  { nombre: 'Fernanda Elizondo', slug: 'fernanda.elizondo' },
  { nombre: 'Arturo Benavides', slug: 'arturo.benavides' },
]

const INVERSIONISTAS = [
  { nombre: 'Patricia Longoria', slug: 'patricia.longoria' },
  { nombre: 'Grupo Cetys Capital', slug: 'cetys.capital' },
  { nombre: 'Manuel Zambrano', slug: 'manuel.zambrano' },
]

const BROKERS = [
  { nombre: 'Diego Salinas', slug: 'diego.salinas' },
  { nombre: 'Valeria Cantú', slug: 'valeria.cantu' },
  { nombre: 'Héctor Garza', slug: 'hector.garza' },
]

async function obtenerOCrearUsuario(nombre, slug, rol) {
  const email = `${slug}@${DOMINIO_DEMO}`
  const { data: existentes } = await supabase.auth.admin.listUsers()
  let authUser = existentes.users.find((u) => u.email === email)

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password: PASSWORD_DEMO, email_confirm: true,
    })
    if (error) throw new Error(`crear auth user ${email}: ${error.message}`)
    authUser = data.user
  }

  const { error: upsertError } = await supabase
    .from('usuarios')
    .upsert({ id: authUser.id, nombre, rol }, { onConflict: 'id' })
  if (upsertError) throw new Error(`upsert usuarios ${email}: ${upsertError.message}`)

  return { id: authUser.id, email, nombre }
}

async function main() {
  console.log('Creando personajes...\n')

  const propietarios = []
  for (const p of PROPIETARIOS) propietarios.push(await obtenerOCrearUsuario(p.nombre, p.slug, 'propietario'))

  const inversionistas = []
  for (const i of INVERSIONISTAS) inversionistas.push(await obtenerOCrearUsuario(i.nombre, i.slug, 'inversionista'))

  const brokers = []
  for (const b of BROKERS) brokers.push(await obtenerOCrearUsuario(b.nombre, b.slug, 'broker'))

  console.log('Personajes listos:', propietarios.length, 'propietarios,', inversionistas.length, 'inversionistas,', brokers.length, 'brokers.\n')

  // Activos -- repartidos entre las 4 fases reales de la UI (valoracion/marketing/leads/cerrado),
  // con broker_id asignado en la mayoría (para que "Brokers aliados" tenga con qué calcular
  // activos/cerrados/volumen reales). San Pedro / Monterrey, coincide con el piloto Fase 1a.
  const ACTIVOS_DEMO = [
    { propietario: 0, nombre: 'Terreno Valle Poniente', tipo: 'Terreno', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 850, precio_total: 9800000, status: 'valoracion', broker: null },
    { propietario: 0, nombre: 'Casa Cumbres Elite', tipo: 'Casa', municipio: 'Monterrey', estado: 'Nuevo León', superficie: 320, precio_total: 5200000, status: 'marketing', broker: 0 },
    { propietario: 1, nombre: 'Departamento Distrito Valle', tipo: 'Depto', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 145, precio_total: 4600000, status: 'leads', broker: 0 },
    { propietario: 1, nombre: 'Local Comercial Vasconcelos', tipo: 'Local', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 90, precio_total: 3100000, status: 'cerrado', broker: 1 },
    { propietario: 2, nombre: 'Casa Contry Sol', tipo: 'Casa', municipio: 'Monterrey', estado: 'Nuevo León', superficie: 280, precio_total: 4100000, status: 'marketing', broker: 1 },
    { propietario: 2, nombre: 'Terreno Corredor Constitución', tipo: 'Terreno', municipio: 'Santa Catarina', estado: 'Nuevo León', superficie: 1200, precio_total: 7300000, status: 'cerrado', broker: 2 },
  ]

  for (const a of ACTIVOS_DEMO) {
    const usuario_id = propietarios[a.propietario].id
    const broker_id = a.broker != null ? brokers[a.broker].id : null
    const { data: existente } = await supabase.from('activos').select('id').eq('usuario_id', usuario_id).eq('nombre', a.nombre).maybeSingle()
    if (existente) continue
    const { error } = await supabase.from('activos').insert({
      usuario_id, broker_id, nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, estado: a.estado,
      superficie: a.superficie, precio_total: a.precio_total, status: a.status,
    })
    if (error) throw new Error(`insertar activo ${a.nombre}: ${error.message}`)
  }
  console.log('Activos listos:', ACTIVOS_DEMO.length, '(San Pedro / Monterrey / Santa Catarina)\n')

  // Perfiles de intención -- uno por inversionista.
  const PERFILES_DEMO = [
    { inversionista: 0, presupuesto: '$3M - $8M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Departamentos, casas', tesis_inversion: 'Vivienda para renta, plusvalía de mediano plazo' },
    { inversionista: 1, presupuesto: '$10M - $30M', zona: 'Monterrey, corredor de desarrollo', tipo_activo_interes: 'Terrenos, uso mixto', tesis_inversion: 'Desarrollo vertical, horizonte 3-5 años' },
    { inversionista: 2, presupuesto: '$2M - $5M', zona: 'San Pedro / Santa Catarina', tipo_activo_interes: 'Locales comerciales', tesis_inversion: 'Ingreso por renta, bajo riesgo' },
  ]
  for (const p of PERFILES_DEMO) {
    const usuario_id = inversionistas[p.inversionista].id
    const { data: existente } = await supabase.from('perfiles_intencion').select('id').eq('usuario_id', usuario_id).maybeSingle()
    if (existente) continue
    const { error } = await supabase.from('perfiles_intencion').insert({
      usuario_id, presupuesto: p.presupuesto, zona: p.zona,
      tipo_activo_interes: p.tipo_activo_interes, tesis_inversion: p.tesis_inversion,
    })
    if (error) throw new Error(`insertar perfil ${p.zona}: ${error.message}`)
  }
  console.log('Perfiles de intención listos:', PERFILES_DEMO.length, '\n')

  console.log('=== Credenciales de demo (contraseña igual para las 9) ===')
  console.log('Contraseña:', PASSWORD_DEMO, '\n')
  const todos = [...propietarios, ...inversionistas, ...brokers]
  for (const u of todos) console.log(' -', u.email.padEnd(32), u.nombre)
}

main().catch((e) => { console.error(e); process.exit(1) })
