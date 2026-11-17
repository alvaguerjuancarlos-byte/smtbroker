// Conexión con MindBridge Search, el motor de búsqueda (Documento Maestro V10, §29).
//
// EslAix le manda la ficha ya llena (sin pasar por Claude: ~1 s) y el motor ORDENA y EXPLICA:
// qué cumple cada propiedad y qué datos le faltan. Una propiedad sin un dato no se excluye: baja.
// EslAix sigue mandando en lo que se muestra (zona, tipo, presupuesto, demo/real, brokers): el motor
// solo reordena lo que EslAix ya aprobó (cambio gradual, §29.4).
//
// Si el motor no está configurado, falla o tarda más de MAX_MS, todo sigue con el orden de siempre.
//
// Variables: MOTOR_BUSQUEDA_URL (p. ej. https://mindbridge-search.vercel.app) y MOTOR_BUSQUEDA_KEY.
import { preferenciasDe, type Necesidad } from '@/lib/necesidad'

const MAX_MS = 4000

const AMENIDADES: Record<string, string> = {
  'Jardín': 'jardin', 'Alberca': 'alberca', 'Seguridad privada': 'seguridad_24h', 'Cuarto de servicio': 'cuarto_de_servicio',
  'Gimnasio': 'gimnasio', 'Roof garden': 'roof_garden', 'Acepta mascotas': 'pet_friendly',
}
const TIPOS = new Set(['casa', 'departamento', 'terreno', 'local', 'oficina', 'bodega'])

export interface ResultadoMotor {
  /** Id de la propiedad en EslAix (sin el sufijo :venta/:renta de las que están en ambas). */
  activoId: string
  posicion: number
  cumple: string[]
  faltanDatos: string[]
  /** Palabras de las preferencias que aparecen en el anuncio. */
  preferencias: string[]
  /** % de coincidencia del motor (0-100), medido contra lo que pidió el cliente. */
  coincidencia: number | null
}

const config = () => {
  const url = process.env.MOTOR_BUSQUEDA_URL?.trim().replace(/\/$/, '')
  const key = process.env.MOTOR_BUSQUEDA_KEY?.trim()
  return url && key ? { url, key } : null
}

/** La ficha de EslAix en el formato del motor (docs/schemas/parser-output.json del motor). */
export function interpretacionDeFicha(n: Necesidad): Record<string, unknown> | null {
  if (!TIPOS.has(n.tipo)) return null // "edificio" no existe en el motor: orden de siempre
  const c = n.caracteristicas
  const minimo = (v: unknown, entero: boolean) => (typeof v === 'number' && v > 0 ? { min: entero ? Math.floor(v) : v } : undefined)
  const amenidades = (Array.isArray(c.amenidades) ? c.amenidades : []).map((a) => AMENIDADES[a]).filter(Boolean)
  const filtros: Record<string, unknown> = {
    tipo: [n.tipo],
    // El presupuesto tal cual; el margen de ±10 % de EslAix (MARGEN_PRECIO) va como tolerancia_precio,
    // así el motor muestra lo que cae en el margen pero le da medio punto en el %.
    precio_mxn: { min: n.presupuesto_min ? Math.floor(n.presupuesto_min) : null, max: Math.ceil(n.presupuesto_max) },
    recamaras: minimo(c.recamaras, true),
    banos: minimo(c.banos, false),
    estacionamientos: minimo(c.estacionamientos, true),
    amenidades: amenidades.length ? amenidades : undefined,
  }
  for (const k of Object.keys(filtros)) if (filtros[k] === undefined) delete filtros[k]
  return {
    operacion: n.operacion === 'renta' ? 'renta' : 'venta',
    filtros_duros: filtros,
    geo: null, // las zonas (hasta 3) las aplica EslAix
    // Las preferencias ordenan por significado y se explican ("coincide con: tranquilo").
    preferencias_suaves: preferenciasDe(n).join(', ') || null,
    orden: 'relevancia',
    ambiguedades: [],
    confianza: 1,
  }
}

/** Orden y explicación del motor para una ficha. null = usar el orden de siempre. */
export async function ordenDelMotor(n: Necesidad, sesionId?: string): Promise<ResultadoMotor[] | null> {
  const interpretacion = interpretacionDeFicha(n)
  return interpretacion ? buscarConInterpretacion(interpretacion, sesionId) : null
}

async function buscarConInterpretacion(interpretacion: Record<string, unknown>, sesionId?: string): Promise<ResultadoMotor[] | null> {
  const cfg = config()
  if (!cfg) return null
  try {
    const r = await fetch(`${cfg.url}/search/filtros`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key },
      body: JSON.stringify({ interpretacion, fuentes: ['eslaix'], limite: 50, tolerancia_precio: 0.1, sesion_id: sesionId ?? 'eslaix' }),
      signal: AbortSignal.timeout(MAX_MS),
    })
    if (!r.ok) { console.error('motor de búsqueda:', r.status, (await r.text()).slice(0, 200)); return null }
    const d = (await r.json()) as { resultados: { id_en_fuente: string | null; coincidencia?: number | null; explicacion: { cumple: string[]; faltan_datos: string[]; preferencias: string[] } }[] }
    const vistos = new Set<string>()
    const out: ResultadoMotor[] = []
    for (const x of d.resultados) {
      const id = (x.id_en_fuente ?? '').replace(/:(venta|renta)$/, '')
      if (!id || vistos.has(id)) continue
      vistos.add(id)
      out.push({ activoId: id, posicion: out.length, cumple: x.explicacion.cumple, faltanDatos: x.explicacion.faltan_datos, preferencias: x.explicacion.preferencias ?? [], coincidencia: x.coincidencia ?? null })
    }
    return out
  } catch (e) {
    console.error('motor de búsqueda:', e instanceof Error ? e.message : e)
    return null
  }
}

// ── Perfiles en texto libre (sugerencias de app/api/matches; reemplaza a lib/matching.ts, §29.4) ──

/** Lo que el motor dice de una propiedad para un perfil: su % y las razones, listas para mostrar. */
export interface CoincidenciaPerfil { score: number; razones: string[] }

/** Un perfil de asesor como frase para el motor: "Casa en San Pedro / Santa Catarina, presupuesto $5M – $15M". */
export const fraseDePerfil = (p: { tipo_activo_interes: string | null; zona: string | null; presupuesto: string | null }) =>
  [p.tipo_activo_interes, p.zona && `en ${p.zona}`, p.presupuesto && `presupuesto ${p.presupuesto}`].filter(Boolean).join(', ')

// La interpretación de cada frase se pide una vez (llama a Claude, ~2.5 s) y se guarda en memoria de
// la instancia; las búsquedas siguientes van directo con ella (sin Claude, ~1 s). Si falla, no se
// guarda, para reintentar en la siguiente visita.
const interpretaciones = new Map<string, Promise<Record<string, unknown> | null>>()
function interpretacionDeFrase(frase: string): Promise<Record<string, unknown> | null> {
  const cfg = config()
  if (!cfg || !frase) return Promise.resolve(null)
  if (!interpretaciones.has(frase)) {
    const p = fetch(`${cfg.url}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key },
      body: JSON.stringify({ consulta: frase, fuentes: ['eslaix'], limite: 1, sesion_id: 'eslaix-perfiles' }),
      signal: AbortSignal.timeout(15_000),
    }).then(async (r) => (r.ok ? ((await r.json()) as { interpretacion: Record<string, unknown> }).interpretacion : null))
      .catch((e) => { console.error('motor (perfil):', e instanceof Error ? e.message : e); return null })
    p.then((x) => { if (!x) interpretaciones.delete(frase) })
    interpretaciones.set(frase, p)
  }
  return interpretaciones.get(frase)!
}

/** Umbral para sugerir una conexión: el mismo 60 que usaba lib/matching.ts, ahora sobre el % del motor. */
export const UMBRAL_MOTOR = 60

/**
 * Propiedades de EslAix que el motor sugiere para un perfil (id → % y razones), con el umbral ya
 * aplicado. null = el motor no está disponible: quien llama usa el emparejador viejo de respaldo.
 */
export async function coincidenciasDePerfil(p: { tipo_activo_interes: string | null; zona: string | null; presupuesto: string | null }): Promise<Map<string, CoincidenciaPerfil> | null> {
  const interpretacion = await interpretacionDeFrase(fraseDePerfil(p))
  if (!interpretacion) return null
  const res = await buscarConInterpretacion(interpretacion, 'eslaix-perfiles')
  if (!res) return null
  const out = new Map<string, CoincidenciaPerfil>()
  for (const m of res) {
    if (m.coincidencia == null || m.coincidencia < UMBRAL_MOTOR) continue
    const faltan = m.faltanDatos.filter((f) => !f.startsWith('sin dato: descripción')).map((f) => f.replace(/^sin dato: /, 'no indica '))
    out.set(m.activoId, { score: m.coincidencia, razones: [...m.cumple, ...faltan] })
  }
  return out
}

/** Le pide al motor que vuelva a leer las propiedades (después de cargar o editar una). No bloquea. */
export async function reindexarMotor(): Promise<void> {
  const cfg = config()
  if (!cfg) return
  try {
    await fetch(`${cfg.url}/reindex/eslaix`, { method: 'POST', headers: { 'x-api-key': cfg.key }, signal: AbortSignal.timeout(60_000) })
  } catch (e) {
    console.error('reindexar motor:', e instanceof Error ? e.message : e)
  }
}
