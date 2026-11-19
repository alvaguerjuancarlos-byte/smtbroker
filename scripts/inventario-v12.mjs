// Inventario demo del video v12 (guion aprobado por JC el 19-nov-2026): rentar un departamento de 3
// recámaras en Valle Poniente (Santa Catarina), de $55,000 a $60,000 al mes, bien ubicado y con muy
// buenas amenidades. Lo usa el grabador (scripts/grabar-video-v12.mjs) y se prueba solo con
// scripts/probar-inventario-v12.mjs. Todo en el MUNDO DEMO y todo se BORRA al terminar.
//
//   - 3 departamentos CERTIFICADOS de dueños directos (cuenta demo de Ricardo, propietario): banda 1,
//     "Particular · certificada";
//   - el departamento de Diego Salinas (asesor Oro), que le propone a la búsqueda: banda 2.
// Las rentas salen del Agente de Mercado (comparables reales de renta): la superficie se elige para que
// la renta realista caiga en el presupuesto, y cada una queda un poco abajo o en línea con el mercado.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ZONA = { estado: 'Nuevo León', municipio: 'Santa Catarina', colonia: 'Valle Poniente' }
export const NOMBRE_DIEGO = 'Departamento en Torre Valle Poniente'
const AMENIDADES = ['alberca', 'gimnasio', 'seguridad_24h', 'elevador']
const RENTA = { incluye_mantenimiento: true, mantenimiento: null, deposito_meses: 1, plazo_minimo: '1_anio', garantia: 'cualquiera', amueblada: false, mascotas: true }

// [nombre, superficie, factor sobre la renta realista, foto, amenidades extra, descripción]
const DEPAS = [
  ['Departamento con vista en Valle Poniente', 138, 0.96, 'depa1.jpg', ['roof_garden'], 'Excelente ubicación, a unos minutos de Valle Oriente. Vista abierta a la sierra. Amenidades: alberca, gimnasio, roof garden y seguridad 24 horas.'],
  ['Departamento en Privada Valle Poniente', 144, 0.97, 'depa2.jpg', ['terraza'], 'Muy bien ubicado, en privada con caseta. Terraza propia. Amenidades: alberca, gimnasio, elevador y seguridad 24 horas.'],
  ['Departamento en Torre Olinca', 149, 0.95, 'depa3.jpg', ['area_de_juegos'], 'Bien ubicado, junto a escuelas y centros comerciales. Amenidades completas: alberca, gimnasio, área de juegos y seguridad 24 horas.'],
]
const MIN = 54_000, MAX = 60_000 // dentro del presupuesto de $55k–$60k: ninguna arriba de su tope
const redondear = (n) => Math.round(n / 500) * 500

/**
 * Crea el inventario. `api(cuenta, ruta, cuerpo)` llama a la app con la sesión de 'ricardo' o 'diego'.
 * Devuelve { activos, fotos, depas: [{id, nombre, renta, realista}], diego: {id, renta, realista} }.
 */
export async function crearInventario({ admin, api, ids, fotosDir, log = console.log }) {
  const creado = { activos: [], fotos: [] }
  const nueva = async (campos) => {
    const { data, error } = await admin.from('activos').insert({
      ...ZONA, tipo: 'Departamento', status: 'ingresado', es_demo: true, operacion: 'renta', renta_mensual: 55_000, renta: RENTA,
      recamaras: 3, banos: 3, estacionamientos: 2, ...campos,
    }).select('id').single()
    if (error) throw error
    creado.activos.push(data.id)
    return data.id
  }
  const depas = []
  for (const [nombre, superficie, factor, foto, extra, descripcion] of DEPAS) {
    const id = await nueva({ usuario_id: ids.ricardo, cargado_por: 'propietario', nombre, superficie, descripcion, amenidades: [...AMENIDADES, ...extra] })
    depas.push({ id, nombre, superficie, factor, foto })
  }
  const diego = {
    id: await nueva({
      usuario_id: ids.diego, broker_id: ids.diego, cargado_por: 'broker', representacion_tipo: 'exclusiva', representacion_declarada_at: new Date().toISOString(),
      propietario_nombre: 'Familia Garza Treviño', nombre: NOMBRE_DIEGO, superficie: 142,
      descripcion: 'La mejor ubicación de Valle Poniente, en torre nueva con vista. Muy buenas amenidades: alberca techada, gimnasio, roof garden, terraza y seguridad 24 horas.', amenidades: [...AMENIDADES, 'roof_garden', 'terraza'],
    }),
    nombre: NOMBRE_DIEGO, superficie: 142, factor: 0.98, foto: 'depa-diego.jpg',
  }
  // Certificadas (banda 1, "Particular · certificada").
  const { error: eCert } = await admin.from('certificaciones').insert(depas.map((d) => ({ activo_id: d.id, solicitado_por: ids.ricardo, estado: 'certificada' })))
  if (eCert) throw eCert
  for (const d of [...depas, diego]) {
    const ruta = `${d.id}/portada.jpg`
    const { error } = await admin.storage.from('fotos-activos').upload(ruta, readFileSync(join(fotosDir, d.foto)), { contentType: 'image/jpeg', upsert: true })
    if (error) log('  (foto)', error.message); else creado.fotos.push(ruta)
  }

  // Renta realista del Agente de Mercado (renta mensual por m² de comparables reales × superficie).
  log('  Agente de Mercado: renta realista de cada departamento…')
  const realista = async (cuenta, id) => {
    for (let i = 0; i < 3; i++) {
      const m = await api(cuenta, '/api/agentes/mercado', { activoId: id, ...(i ? { regenerar: true } : {}) })
      const r = m.renta?.rentaRealistaMXN
      if (r) return r
    }
    return null
  }
  const todos = [...depas.map((d) => ({ ...d, cuenta: 'ricardo' })), { ...diego, cuenta: 'diego' }]
  const reales = await Promise.all(todos.map((d) => realista(d.cuenta, d.id)))
  for (const [k, d] of todos.entries()) {
    // Sin dato o fuera de lo creíble (~$250–$450/m² al mes en Valle Poniente), se usa $320/m².
    const r = reales[k] && reales[k] / d.superficie >= 250 && reales[k] / d.superficie <= 450 ? reales[k] : 320 * d.superficie
    d.realista = r
    d.renta = Math.min(MAX, Math.max(MIN, redondear(r * d.factor)))
    await admin.from('activos').update({ renta_mensual: d.renta }).eq('id', d.id)
    log(`  ${d.nombre}: ${d.superficie} m² · realista ${reales[k] ?? 'sin dato'} → renta ${d.renta}`)
  }
  // Con la renta ya puesta, el análisis guardado se recalcula (así dice "abajo / en línea con el mercado").
  await Promise.all(todos.map((d) => api(d.cuenta, '/api/agentes/mercado', { activoId: d.id, regenerar: true }).catch(() => null)))
  // El motor de búsqueda (§29) las indexa: así salen con su % de coincidencia, no como "recién publicada".
  await api('ricardo', '/api/motor/reindexar', {}).catch((e) => log('  (motor)', e.message))
  await new Promise((r) => setTimeout(r, 25_000))
  return { ...creado, depas: todos.slice(0, 3), diego: todos[3] }
}

/** Borra lo que creó crearInventario (y lo que cuelga de esas propiedades). */
export async function borrarInventario(admin, creado) {
  if (creado.fotos?.length) await admin.storage.from('fotos-activos').remove(creado.fotos)
  if (creado.activos?.length) {
    await admin.from('calificaciones').delete().in('conexion_id', ((await admin.from('conexiones').select('id').in('activo_id', creado.activos)).data ?? []).map((c) => c.id))
    await admin.from('cierres_reportados').delete().in('activo_id', creado.activos)
    await admin.from('conexiones').delete().in('activo_id', creado.activos)
    await admin.from('activos').delete().in('id', creado.activos) // cascada: propuestas, análisis, certificaciones, diagnósticos
  }
}
