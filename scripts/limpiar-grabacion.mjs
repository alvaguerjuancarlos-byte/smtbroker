// Limpia los datos demo que se crean durante la grabación del video (guion v4): solicitudes de
// conexión, cierres reportados, verificaciones, clientes o propiedades nuevas, y propiedades que
// pasaron a "cerrado". Funciona en dos pasos y SOLO toca datos de cuentas demo (usuarios.es_demo):
//
//   1. Antes de grabar:   node --env-file=.env.local scripts/limpiar-grabacion.mjs foto
//   2. Después de grabar: node --env-file=.env.local scripts/limpiar-grabacion.mjs restaurar
//
// "foto" guarda el estado en el directorio temporal del sistema; "restaurar" borra lo que no
// estaba en la foto y regresa el status y el folio de cada propiedad demo a su valor anterior.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ARCHIVO = join(tmpdir(), 'smtbroker-grabacion-foto.json')
const modo = process.argv[2]

async function estadoDemo() {
  const { data: demo } = await admin.from('usuarios').select('id').eq('es_demo', true)
  const ids = (demo || []).map((u) => u.id)
  const { data: activos } = await admin.from('activos').select('id, status, folio_real').or(`usuario_id.in.(${ids}),broker_id.in.(${ids})`)
  const idsActivos = (activos || []).map((a) => a.id)
  const { data: perfiles } = await admin.from('perfiles_intencion').select('id').or(`usuario_id.in.(${ids}),broker_id.in.(${ids})`)
  const { data: matches } = await admin.from('matches').select('id').in('activo_id', idsActivos)
  const { data: cierres } = await admin.from('cierres_reportados').select('id, estado, verificado_at').in('activo_id', idsActivos)
  return { ids, activos: activos || [], perfiles: (perfiles || []).map((p) => p.id), matches: (matches || []).map((m) => m.id), cierres: cierres || [] }
}

if (modo === 'foto') {
  const foto = await estadoDemo()
  writeFileSync(ARCHIVO, JSON.stringify({ tomada: new Date().toISOString(), ...foto }, null, 2))
  console.log(`Foto guardada en ${ARCHIVO}: ${foto.activos.length} propiedades, ${foto.perfiles.length} perfiles, ${foto.matches.length} solicitudes, ${foto.cierres.length} cierres de cuentas demo.`)
} else if (modo === 'restaurar') {
  if (!existsSync(ARCHIVO)) { console.error(`No hay foto en ${ARCHIVO}. Corre primero el modo "foto".`); process.exit(1) }
  const foto = JSON.parse(readFileSync(ARCHIVO, 'utf8'))
  const ahora = await estadoDemo()
  const nuevos = (actual, previo) => actual.filter((id) => !previo.includes(id))

  const cierresNuevos = nuevos(ahora.cierres.map((c) => c.id), foto.cierres.map((c) => c.id))
  const matchesNuevos = nuevos(ahora.matches, foto.matches)
  const perfilesNuevos = nuevos(ahora.perfiles, foto.perfiles)
  const activosNuevos = nuevos(ahora.activos.map((a) => a.id), foto.activos.map((a) => a.id))

  if (cierresNuevos.length) await admin.from('cierres_reportados').delete().in('id', cierresNuevos)
  for (const c of foto.cierres) await admin.from('cierres_reportados').update({ estado: c.estado, verificado_at: c.verificado_at }).eq('id', c.id)
  if (matchesNuevos.length) await admin.from('matches').delete().in('id', matchesNuevos)
  if (perfilesNuevos.length) await admin.from('perfiles_intencion').delete().in('id', perfilesNuevos)
  if (activosNuevos.length) await admin.from('activos').delete().in('id', activosNuevos)
  let restaurados = 0
  for (const a of foto.activos) {
    const actual = ahora.activos.find((x) => x.id === a.id)
    if (actual && (actual.status !== a.status || actual.folio_real !== a.folio_real)) {
      await admin.from('activos').update({ status: a.status, folio_real: a.folio_real }).eq('id', a.id)
      restaurados++
    }
  }
  console.log(`Restaurado al estado del ${foto.tomada}: borrados ${cierresNuevos.length} cierres, ${matchesNuevos.length} solicitudes, ${perfilesNuevos.length} perfiles y ${activosNuevos.length} propiedades nuevos; ${restaurados} propiedades regresaron a su status anterior.`)
} else {
  console.error('Uso: node --env-file=.env.local scripts/limpiar-grabacion.mjs foto|restaurar')
  process.exit(1)
}
