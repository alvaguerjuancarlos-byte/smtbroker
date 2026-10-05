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

  // es_demo=true -- requiere la migración 20260927000000_agrega_es_demo_usuarios.sql aplicada
  // primero (columna nueva). Sin esto, /panel no puede distinguir estas cuentas de las reales.
  const { error: upsertError } = await supabase
    .from('usuarios')
    .upsert({ id: authUser.id, nombre, rol, es_demo: true }, { onConflict: 'id' })
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
    // Ampliación (2026-09-27) -- el set original dejaba /panel con muy poco volumen para una
    // demo grabada (solo 6 activos, pipeline desbalanceado). Se completan las 4 fases con más
    // peso y se reparte mejor entre los 3 brokers (quedan ~3 activos c/u en vez de 2).
    { propietario: 0, nombre: 'Local Renta San Agustín', tipo: 'Local', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 60, precio_total: 2400000, status: 'leads', broker: 0 },
    { propietario: 0, nombre: 'Bodega Apodaca Norte', tipo: 'Bodega', municipio: 'Apodaca', estado: 'Nuevo León', superficie: 900, precio_total: 6200000, status: 'cerrado', broker: 1 },
    { propietario: 1, nombre: 'Casa Residencial del Valle', tipo: 'Casa', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 410, precio_total: 8100000, status: 'valoracion', broker: null },
    { propietario: 1, nombre: 'Terreno Carretera Nacional', tipo: 'Terreno', municipio: 'Monterrey', estado: 'Nuevo León', superficie: 2000, precio_total: 11500000, status: 'marketing', broker: 2 },
    { propietario: 2, nombre: 'Departamento Punto Valle', tipo: 'Depto', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 180, precio_total: 5600000, status: 'leads', broker: 2 },
    { propietario: 2, nombre: 'Edificio Oficinas Valle Oriente', tipo: 'Edificio', municipio: 'San Pedro Garza García', estado: 'Nuevo León', superficie: 650, precio_total: 18000000, status: 'cerrado', broker: 0 },
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
    { inversionista: 0, presupuesto: '$3M - $8M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Departamentos, casas', tesis_inversion: 'Departamento para vivir con su familia, cerca de su trabajo en Valle Oriente' },
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

  // Documento Maestro V6.1: el broker como protagonista. Diego (broker 0) carga propiedades que
  // representa (cargado_por = 'broker', con exclusiva declarada) y registra lo que buscan sus
  // clientes (perfiles_intencion con broker_id y alias, sin datos de contacto). Requiere la
  // migración 20261005000100_v6_broker_protagonista.sql.
  const diego = brokers[0]
  const PORTAFOLIO_DIEGO = [
    { nombre: 'Casa Fuentes del Valle', tipo: 'Casa', municipio: 'San Pedro Garza García', superficie: 380, precio_total: 14500000, status: 'valoracion', propietario_nombre: 'Familia Treviño Garza' },
    { nombre: 'Departamento Arboleda 1204', tipo: 'Depto', municipio: 'San Pedro Garza García', superficie: 160, precio_total: 7900000, status: 'marketing', propietario_nombre: 'Lorena Cantú Ayala' },
    { nombre: 'Terreno Chipinque Residencial', tipo: 'Terreno', municipio: 'San Pedro Garza García', superficie: 720, precio_total: 10800000, status: 'ingresado', propietario_nombre: 'Inmobiliaria Sierra Madre SA de CV' },
  ]
  for (const a of PORTAFOLIO_DIEGO) {
    const { data: existente } = await supabase.from('activos').select('id').eq('broker_id', diego.id).eq('nombre', a.nombre).maybeSingle()
    if (existente) continue
    const { error } = await supabase.from('activos').insert({
      usuario_id: diego.id, broker_id: diego.id, cargado_por: 'broker',
      propietario_nombre: a.propietario_nombre, representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
      nombre: a.nombre, tipo: a.tipo, municipio: a.municipio, estado: 'Nuevo León',
      superficie: a.superficie, precio_total: a.precio_total, status: a.status,
    })
    if (error) throw new Error(`insertar activo de broker ${a.nombre}: ${error.message}`)
  }
  const CLIENTES_DIEGO = [
    { alias_cliente: 'Familia G.', presupuesto: '$5M – $15M', zona: 'San Pedro Garza García', tipo_activo_interes: 'Casa', tesis_inversion: 'Casa de 4 recámaras cerca de escuelas, para mudarse en 2027' },
    { alias_cliente: 'Dr. R.', presupuesto: '$5M – $15M', zona: 'Valle Oriente', tipo_activo_interes: 'Departamento', tesis_inversion: 'Departamento con amenidades, cerca de su consultorio' },
    { alias_cliente: 'Cliente 07', presupuesto: '$15M – $50M', zona: 'San Pedro / Carretera Nacional', tipo_activo_interes: 'Terreno', tesis_inversion: 'Terreno para construir casa propia' },
  ]
  for (const c of CLIENTES_DIEGO) {
    const { data: existente } = await supabase.from('perfiles_intencion').select('id').eq('broker_id', diego.id).eq('alias_cliente', c.alias_cliente).maybeSingle()
    if (existente) continue
    const { error } = await supabase.from('perfiles_intencion').insert({
      ...c, usuario_id: null, broker_id: diego.id, consentimiento_declarado_at: new Date().toISOString(), fuente_captura: 'broker',
    })
    if (error) throw new Error(`insertar cliente ${c.alias_cliente}: ${error.message}`)
  }
  console.log('Portafolio y clientes de', diego.nombre, 'listos:', PORTAFOLIO_DIEGO.length, 'propiedades,', CLIENTES_DIEGO.length, 'clientes\n')

  // Guion v4 (escenas 17–20): una cuenta demo de Operación MindBridge (rol interno 'broker_maestro')
  // para grabar la consola sin usar la cuenta personal de JC, y a Diego con nivel Plata:
  // folios demo en su portafolio (Certificado: ≥3 propiedades y ≥50% documentadas) y un cierre
  // verificado (Plata). Ver lib/nivelesBroker.ts.
  const operacion = await obtenerOCrearUsuario('Operación MindBridge (demo)', 'operacion', 'broker_maestro')
  const { data: portafolioDiego } = await supabase.from('activos').select('id, nombre, folio_real, status')
    .eq('broker_id', diego.id).order('created_at')
  for (const [i, a] of (portafolioDiego || []).entries()) {
    if (a.folio_real) continue
    await supabase.from('activos').update({ folio_real: `DEMO-FR-${String(i + 1).padStart(4, '0')}` }).eq('id', a.id)
  }
  const cerrada = (portafolioDiego || []).find((a) => a.nombre === 'Edificio Oficinas Valle Oriente')
  if (cerrada) {
    const { data: yaHay } = await supabase.from('cierres_reportados').select('id').eq('activo_id', cerrada.id).maybeSingle()
    if (!yaHay) {
      const { error } = await supabase.from('cierres_reportados').insert({
        activo_id: cerrada.id, broker_id: diego.id, precio_cierre: 17_400_000, fecha_cierre: '2026-09-20',
        origen_comprador: 'otro_broker', estado: 'verificado', verificado_at: new Date().toISOString(),
      })
      if (error) throw new Error(`cierre demo de Diego: ${error.message}`)
    }
  }
  console.log('Operación demo y nivel de Diego listos:', operacion.email, '\n')

  console.log('=== Credenciales de demo (misma contraseña para todas) ===')
  console.log('Contraseña:', PASSWORD_DEMO, '\n')
  const todos = [...propietarios, ...inversionistas, ...brokers, operacion]
  for (const u of todos) console.log(' -', u.email.padEnd(32), u.nombre)
}

main().catch((e) => { console.error(e); process.exit(1) })
