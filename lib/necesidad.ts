// Ficha de necesidad del comprador (Documento Maestro V8, Parte 1, §19.1; decisiones de JC del
// 10-nov-2026). Lógica pura, sin red ni base: la usan la captura (/empezar), las rutas de
// app/api/necesidades y app/api/propuestas, y el panel del broker.
//
// Orden de captura: tipo → características (dependen del tipo) → ubicación → presupuesto, más
// forma de pago, "¿para cuándo?" y "¿para qué?" (vivir o invertir, agregada con la Parte 2).
// Solo tipo, municipio y presupuesto máximo son obligatorios: las características ayudan, pero no
// deben frenar la captura.
//
// V9 (§22, rentas): cada ficha es de COMPRA o de RENTA (obligatorio, una operación por ficha). En
// renta el presupuesto es la renta mensual, forma de pago y "¿para qué?" no aplican, y se piden
// plazo del contrato, garantía, fecha de entrada, amueblada y mascotas. Una propiedad puede estar en
// venta, en renta o en las dos: en una búsqueda de renta cuenta su renta mensual, no su precio.
//
// Sin imports de alias: se prueba con `node --test lib/necesidad.test.ts`.
import { municipioCanonico, normalizarTipos } from './matching.ts'

export type TipoNecesidad = 'casa' | 'departamento' | 'terreno' | 'bodega' | 'oficina' | 'local' | 'edificio'
export type FormaPago = 'contado' | 'credito' | 'infonavit'
export type Plazo = 'ya' | '3_meses' | '6_meses' | 'explorando'
export type Proposito = 'vivir' | 'invertir'
export type Operacion = 'compra' | 'renta'
export type OperacionActivo = 'venta' | 'renta' | 'ambas'
export type PlazoContrato = '1_anio' | '2_3_anios' | '5_anios'
export type Garantia = 'aval' | 'poliza' | 'deposito'
export type Entrada = 'ya' | '1_mes' | '3_meses'
export type Amueblada = 'si' | 'no' | 'indistinto'

export const OPERACIONES: { id: Operacion; etiqueta: string; verbo: string }[] = [
  { id: 'compra', etiqueta: 'Comprar', verbo: 'comprar' }, { id: 'renta', etiqueta: 'Rentar', verbo: 'rentar' },
]
export const PLAZOS_CONTRATO: { id: PlazoContrato; etiqueta: string }[] = [
  { id: '1_anio', etiqueta: '1 año' }, { id: '2_3_anios', etiqueta: '2 a 3 años' }, { id: '5_anios', etiqueta: '5 años o más' },
]
/** Lo que el inquilino puede dar (en la ficha). La propiedad pide una de estas o "cualquiera". */
export const GARANTIAS: { id: Garantia; etiqueta: string }[] = [
  { id: 'aval', etiqueta: 'Aval con propiedad' }, { id: 'poliza', etiqueta: 'Póliza jurídica' }, { id: 'deposito', etiqueta: 'Depósito adicional' },
]
export const ENTRADAS: { id: Entrada; etiqueta: string }[] = [
  { id: 'ya', etiqueta: 'Ya' }, { id: '1_mes', etiqueta: 'En un mes' }, { id: '3_meses', etiqueta: 'En tres meses' },
]
export const AMUEBLADAS: { id: Amueblada; etiqueta: string }[] = [
  { id: 'si', etiqueta: 'Amueblada' }, { id: 'no', etiqueta: 'Sin amueblar' }, { id: 'indistinto', etiqueta: 'Indistinto' },
]
/** §22.2: amueblada aplica a casa, departamento y oficina; mascotas, a casa y departamento. */
export const CON_AMUEBLADA: string[] = ['casa', 'departamento', 'oficina']
export const CON_MASCOTAS: string[] = ['casa', 'departamento']

/** Lo propio de una ficha de renta (§22.2). */
export interface RentaNecesidad {
  plazo_contrato: PlazoContrato | null
  garantia: Garantia | null
  fecha_entrada: Entrada | null
  amueblada: Amueblada | null
  mascotas: boolean | null
}

/** Lo propio de una propiedad en renta (§22.3). */
export interface RentaActivo {
  incluye_mantenimiento: boolean
  mantenimiento: number | null
  deposito_meses: number | null
  plazo_minimo: PlazoContrato | null
  garantia: Garantia | 'cualquiera' | null
  amueblada: boolean | null
  mascotas: boolean | null
}

// Las claves coinciden con las que devuelve normalizarTipos() (lib/matching.ts), así una
// propiedad y una necesidad se comparan con el mismo diccionario.
export const TIPOS_NECESIDAD: { id: TipoNecesidad; etiqueta: string; plural: string }[] = [
  { id: 'casa', etiqueta: 'Casa', plural: 'casas' },
  { id: 'departamento', etiqueta: 'Departamento', plural: 'departamentos' },
  { id: 'terreno', etiqueta: 'Terreno', plural: 'terrenos' },
  { id: 'bodega', etiqueta: 'Bodega', plural: 'bodegas' },
  { id: 'oficina', etiqueta: 'Oficina', plural: 'oficinas' },
  { id: 'local', etiqueta: 'Local comercial', plural: 'locales comerciales' },
  { id: 'edificio', etiqueta: 'Edificio', plural: 'edificios' },
]

export interface Campo {
  clave: string
  etiqueta: string
  tipo: 'numero' | 'opcion' | 'chips'
  opciones?: string[]
  unidad?: string
}

const AREA_CASA: Campo = { clave: 'm2_construccion', etiqueta: 'Construcción mínima', tipo: 'numero', unidad: 'm²' }
const AREA: Campo = { clave: 'm2_min', etiqueta: 'Superficie mínima', tipo: 'numero', unidad: 'm²' }
const ESTAC: Campo = { clave: 'estacionamientos', etiqueta: 'Estacionamientos', tipo: 'numero' }

// §19.1, "Características por tipo". Todas son mínimos o preferencias, no valores exactos.
export const CARACTERISTICAS: Record<TipoNecesidad, Campo[]> = {
  casa: [
    { clave: 'recamaras', etiqueta: 'Recámaras', tipo: 'numero' },
    { clave: 'banos', etiqueta: 'Baños', tipo: 'numero' },
    ESTAC, AREA_CASA,
    { clave: 'm2_terreno', etiqueta: 'Terreno mínimo', tipo: 'numero', unidad: 'm²' },
    { clave: 'niveles', etiqueta: 'Niveles', tipo: 'opcion', opciones: ['Una planta', 'Dos o más'] },
    { clave: 'amenidades', etiqueta: 'Imprescindibles', tipo: 'chips', opciones: ['Jardín', 'Alberca', 'Seguridad privada', 'Cuarto de servicio'] },
  ],
  departamento: [
    { clave: 'recamaras', etiqueta: 'Recámaras', tipo: 'numero' },
    { clave: 'banos', etiqueta: 'Baños', tipo: 'numero' },
    ESTAC, AREA,
    { clave: 'piso', etiqueta: 'Piso', tipo: 'opcion', opciones: ['Bajo', 'Alto', 'Indistinto'] },
    { clave: 'amenidades', etiqueta: 'Imprescindibles', tipo: 'chips', opciones: ['Gimnasio', 'Alberca', 'Roof garden', 'Acepta mascotas'] },
  ],
  terreno: [
    AREA,
    { clave: 'uso_suelo', etiqueta: 'Uso de suelo', tipo: 'opcion', opciones: ['Habitacional', 'Comercial', 'Mixto', 'Industrial'] },
    { clave: 'frente_min', etiqueta: 'Frente mínimo', tipo: 'numero', unidad: 'm' },
    { clave: 'topografia', etiqueta: 'Topografía', tipo: 'opcion', opciones: ['Plano', 'Con pendiente', 'Indistinto'] },
    { clave: 'servicios', etiqueta: 'Imprescindibles', tipo: 'chips', opciones: ['Agua', 'Drenaje', 'Luz', 'Pavimento'] },
  ],
  bodega: [
    AREA,
    { clave: 'altura_libre', etiqueta: 'Altura libre', tipo: 'numero', unidad: 'm' },
    { clave: 'andenes', etiqueta: 'Andenes de carga', tipo: 'numero' },
    { clave: 'potencia_kva', etiqueta: 'Potencia eléctrica', tipo: 'numero', unidad: 'kVA' },
    { clave: 'extras', etiqueta: 'Imprescindibles', tipo: 'chips', opciones: ['Piso industrial', 'Patio de maniobras', 'Dentro de parque industrial', 'Oficinas'] },
  ],
  oficina: [
    AREA, ESTAC,
    { clave: 'acabado', etiqueta: 'Entrega', tipo: 'opcion', opciones: ['Amueblada', 'Acondicionada', 'Obra gris', 'Indistinto'] },
    { clave: 'inmueble', etiqueta: 'Inmueble', tipo: 'opcion', opciones: ['Edificio corporativo', 'Casa adaptada', 'Indistinto'] },
  ],
  local: [
    AREA, ESTAC,
    { clave: 'planta', etiqueta: 'Ubicación', tipo: 'opcion', opciones: ['Planta baja', 'Piso superior', 'Indistinto'] },
    { clave: 'giro', etiqueta: 'Giro', tipo: 'opcion', opciones: ['Alimentos', 'Comercio', 'Servicios', 'Otro'] },
    { clave: 'extras', etiqueta: 'Imprescindibles', tipo: 'chips', opciones: ['Frente a la calle', 'En plaza comercial', 'Esquina'] },
  ],
  edificio: [
    { clave: 'm2_construccion', etiqueta: 'Construcción mínima', tipo: 'numero', unidad: 'm²' },
    { clave: 'niveles_min', etiqueta: 'Niveles mínimos', tipo: 'numero' },
    { clave: 'uso_actual', etiqueta: 'Uso actual', tipo: 'opcion', opciones: ['Oficinas', 'Habitacional', 'Comercial', 'Mixto', 'Indistinto'] },
    { clave: 'ocupacion', etiqueta: 'Ocupación', tipo: 'opcion', opciones: ['Ocupado (con rentas)', 'Vacío', 'Indistinto'] },
  ],
}

/** Campo de superficie mínima de cada tipo: con él se revisa el tamaño de una propuesta. */
export const CAMPO_AREA: Record<TipoNecesidad, string> = {
  casa: 'm2_construccion', departamento: 'm2_min', terreno: 'm2_min', bodega: 'm2_min',
  oficina: 'm2_min', local: 'm2_min', edificio: 'm2_construccion',
}

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

// Sugerencias para el campo de municipio (Nuevo León, donde arranca la plataforma). En otros
// estados el municipio se escribe libre.
export const MUNICIPIOS_NL = [
  'San Pedro Garza García', 'Monterrey', 'Santa Catarina', 'San Nicolás de los Garza', 'Guadalupe',
  'Apodaca', 'General Escobedo', 'García', 'Juárez', 'Santiago', 'Cadereyta Jiménez', 'Salinas Victoria',
  'Ciénega de Flores', 'General Zuazua', 'Pesquería',
]

export const FORMAS_PAGO: { id: FormaPago; etiqueta: string }[] = [
  { id: 'contado', etiqueta: 'Contado' }, { id: 'credito', etiqueta: 'Crédito bancario' }, { id: 'infonavit', etiqueta: 'Infonavit / Fovissste' },
]
export const PLAZOS: { id: Plazo; etiqueta: string }[] = [
  { id: 'ya', etiqueta: 'Ya' }, { id: '3_meses', etiqueta: 'En 3 meses' }, { id: '6_meses', etiqueta: 'En 6 meses' }, { id: 'explorando', etiqueta: 'Solo explorando' },
]
export const PROPOSITOS: { id: Proposito; etiqueta: string }[] = [
  { id: 'vivir', etiqueta: 'Para vivir o usarla' }, { id: 'invertir', etiqueta: 'Para invertir' },
]

export const MAX_NECESIDADES_ACTIVAS = 3
export const DIAS_VIGENCIA = 30
export const MAX_PROPUESTAS_POR_BROKER = 3
export const MARGEN_PRECIO = 0.10
export const MAX_ZONAS = 3
export const MEJORES_POR_ZONA = 3

/**
 * Una zona de búsqueda (Documento Maestro V9, §23.1): cada una con su municipio, así una ficha busca
 * en Valle (San Pedro), Country y Carretera Nacional (Monterrey) a la vez. Las tres valen igual.
 * `mercado` lo pone solo el servidor: "lo que rinde tu dinero" (§23.2).
 */
export interface ZonaBusqueda {
  estado: string
  municipio: string
  nombre: string | null
  colonias: string[]
  mercado?: MercadoZona | null
}

export interface MercadoZona { precioM2: number | null; comparables: number; fecha: string }

export interface Necesidad {
  /** V9: comprar o rentar. En renta, presupuesto_min/max son la renta MENSUAL. */
  operacion: Operacion
  renta: RentaNecesidad | null
  tipo: TipoNecesidad
  caracteristicas: Record<string, number | string | string[]>
  estado: string
  municipio: string
  zona: string | null
  colonias: string[]
  /** De 1 a 3 (V9). estado, municipio, zona y colonias repiten la primera, por compatibilidad. */
  zonas: ZonaBusqueda[]
  presupuesto_min: number | null
  presupuesto_max: number
  forma_pago: FormaPago | null
  plazo: Plazo | null
  proposito: Proposito | null
  busqueda_directa: boolean
  publicada_brokers: boolean
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const numero = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
const de = <T extends string>(v: unknown, ids: T[]): T | null => (ids.includes(v as T) ? v as T : null)

/** Limpia y valida lo que manda el navegador. Nunca confía en campos que no conoce. */
export function validarNecesidad(b: unknown): { necesidad: Necesidad } | { error: string } {
  const x = (b ?? {}) as Record<string, unknown>
  const tipo = de(x.tipo, TIPOS_NECESIDAD.map((t) => t.id))
  if (!tipo) return { error: 'Elige el tipo de propiedad' }

  const crudo = (x.caracteristicas ?? {}) as Record<string, unknown>
  const caracteristicas: Necesidad['caracteristicas'] = {}
  for (const c of CARACTERISTICAS[tipo]) {
    const v = crudo[c.clave]
    if (c.tipo === 'numero') { const n = numero(v); if (n != null) caracteristicas[c.clave] = n }
    else if (c.tipo === 'opcion') { if (c.opciones!.includes(v as string)) caracteristicas[c.clave] = v as string }
    else if (Array.isArray(v)) { const a = v.filter((y) => c.opciones!.includes(y)); if (a.length) caracteristicas[c.clave] = a }
  }

  // V9: hasta 3 zonas. Sin `zonas` (fichas y clientes de la V8) se arma una con los campos sueltos.
  const crudas = (Array.isArray(x.zonas) && x.zonas.length ? x.zonas : [x]) as Record<string, unknown>[]
  const zonas: ZonaBusqueda[] = []
  for (const z of crudas.slice(0, MAX_ZONAS)) {
    const municipio = texto(z?.municipio, 80)
    if (municipio.length < 3) return { error: crudas.length > 1 ? `Escribe la ciudad o el municipio de la zona ${zonas.length + 1}` : 'Escribe la ciudad o el municipio' }
    zonas.push({
      estado: ESTADOS_MX.includes(z.estado as string) ? z.estado as string : 'Nuevo León',
      municipio,
      nombre: texto(z.nombre ?? z.zona, 80) || null,
      colonias: [...new Set((Array.isArray(z.colonias) ? z.colonias : []).map((c) => texto(c, 60)).filter(Boolean))].slice(0, 10),
    })
  }
  const { estado, municipio, colonias } = zonas[0]

  // V9: la captura obliga a elegir. Sin el campo (clientes de la V8) la ficha es de compra.
  const operacion: Operacion | null = x.operacion == null ? 'compra' : de(x.operacion, ['compra', 'renta'])
  if (!operacion) return { error: 'Elige si quieres comprar o rentar' }
  const enRenta = operacion === 'renta'

  const presupuesto_max = numero(x.presupuesto_max)
  if (!presupuesto_max) return { error: enRenta ? 'Escribe la renta mensual máxima' : 'Escribe tu presupuesto máximo' }
  const presupuesto_min = numero(x.presupuesto_min)
  if (presupuesto_min != null && presupuesto_min > presupuesto_max) return { error: 'El presupuesto mínimo es mayor que el máximo' }

  const busqueda_directa = x.busqueda_directa !== false
  const publicada_brokers = x.publicada_brokers !== false
  if (!busqueda_directa && !publicada_brokers) return { error: 'Elige al menos una forma de buscar' }

  const r = (x.renta ?? {}) as Record<string, unknown>
  const renta: RentaNecesidad | null = enRenta ? {
    plazo_contrato: de(r.plazo_contrato, PLAZOS_CONTRATO.map((p) => p.id)),
    garantia: de(r.garantia, GARANTIAS.map((g) => g.id)),
    fecha_entrada: de(r.fecha_entrada, ENTRADAS.map((e) => e.id)),
    amueblada: CON_AMUEBLADA.includes(tipo) ? de(r.amueblada, AMUEBLADAS.map((a) => a.id)) : null,
    mascotas: CON_MASCOTAS.includes(tipo) && typeof r.mascotas === 'boolean' ? r.mascotas : null,
  } : null

  return {
    necesidad: {
      operacion, renta,
      tipo, caracteristicas, estado, municipio, zona: zonas[0].nombre, colonias, zonas,
      presupuesto_min, presupuesto_max,
      // En renta no aplican: se paga cada mes, la fecha de entrada reemplaza "¿para cuándo?" y
      // quien renta la va a usar (§22.2).
      forma_pago: enRenta ? null : de(x.forma_pago, FORMAS_PAGO.map((f) => f.id)),
      plazo: enRenta ? null : de(x.plazo, PLAZOS.map((p) => p.id)),
      proposito: enRenta ? null : de(x.proposito, PROPOSITOS.map((p) => p.id)),
      busqueda_directa, publicada_brokers,
    },
  }
}

const RENTA_VACIA: RentaActivo = { incluye_mantenimiento: false, mantenimiento: null, deposito_meses: null, plazo_minimo: null, garantia: null, amueblada: null, mascotas: null }

/** Limpia la operación y los datos de renta de una propiedad (alta del dueño o del broker, §22.3). */
export function validarOperacionActivo(b: unknown): { operacion: OperacionActivo; renta_mensual: number | null; renta: RentaActivo | null; precio_total: number | null } | { error: string } {
  const x = (b ?? {}) as Record<string, unknown>
  const operacion = x.operacion == null ? 'venta' : de(x.operacion, ['venta', 'renta', 'ambas'] as OperacionActivo[])
  if (!operacion) return { error: 'Elige si la propiedad está en venta, en renta o en las dos' }
  const precio_total = numero(x.precio_total ?? x.precio)
  const renta_mensual = numero(x.renta_mensual)
  if (operacion !== 'renta' && !precio_total) return { error: 'Escribe el precio de venta' }
  if (operacion !== 'venta' && !renta_mensual) return { error: 'Escribe la renta mensual' }
  if (operacion === 'venta') return { operacion, precio_total, renta_mensual: null, renta: null }
  const r = (x.renta ?? {}) as Record<string, unknown>
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : v === 'si' ? true : v === 'no' ? false : null)
  return {
    operacion, renta_mensual, precio_total: operacion === 'renta' ? null : precio_total,
    renta: {
      ...RENTA_VACIA,
      incluye_mantenimiento: r.incluye_mantenimiento === true || r.incluye_mantenimiento === 'si',
      mantenimiento: numero(r.mantenimiento),
      deposito_meses: Math.min(numero(r.deposito_meses) ?? 0, 12) || null,
      plazo_minimo: de(r.plazo_minimo, PLAZOS_CONTRATO.map((p) => p.id)),
      garantia: de(r.garantia, [...GARANTIAS.map((g) => g.id), 'cualquiera'] as (Garantia | 'cualquiera')[]),
      amueblada: bool(r.amueblada),
      mascotas: bool(r.mascotas),
    },
  }
}

/** Datos de operación de una propiedad, como vienen de la base. Las viejas no los tienen: venta. */
export interface OperacionDeActivo { operacion?: OperacionActivo | null; precio_total: number | null; renta_mensual?: number | null; renta?: RentaActivo | null }

/** ¿La propiedad se ofrece para esta operación? */
export const seOfrecePara = (a: Pick<OperacionDeActivo, 'operacion'>, op: Operacion) => {
  const o = a.operacion ?? 'venta'
  return o === 'ambas' || (op === 'compra' ? o === 'venta' : o === 'renta')
}

/** El precio que cuenta en esta búsqueda: precio total en compra, renta mensual en renta (§22.3). */
export function precioPara(a: OperacionDeActivo, op: Operacion): number | null {
  if (!seOfrecePara(a, op)) return null
  return op === 'renta' ? a.renta_mensual ?? null : a.precio_total
}

/** "$28,000 al mes" (o "$28,000 al mes + $2,500 de mantenimiento"). */
export const rentaTexto = (n: number) => `$${Math.round(n).toLocaleString('es-MX')} al mes`

/** Precio o renta, según la operación: "$7.6M" o "$28,000 al mes". */
export const dinero = (n: number, op: Operacion | null | undefined) => (op === 'renta' ? rentaTexto(n) : millones(n))

const orden = <T extends string>(lista: { id: T }[], v: T | null | undefined) => (v ? lista.findIndex((x) => x.id === v) : -1)
const etiqueta = <T extends string>(lista: { id: T; etiqueta: string }[], v: T | null | undefined) => lista.find((x) => x.id === v)?.etiqueta ?? null

/** Detalle de renta de la ficha para tarjetas: ["Contrato: 1 año", "Garantía: póliza jurídica", ...]. */
export function detalleRenta(r: RentaNecesidad | null | undefined): string[] {
  if (!r) return []
  return [
    r.plazo_contrato && `Contrato: ${etiqueta(PLAZOS_CONTRATO, r.plazo_contrato)}`,
    r.garantia && `Garantía: ${etiqueta(GARANTIAS, r.garantia)!.toLowerCase()}`,
    r.fecha_entrada && `Entrada: ${etiqueta(ENTRADAS, r.fecha_entrada)!.toLowerCase()}`,
    r.amueblada && r.amueblada !== 'indistinto' && etiqueta(AMUEBLADAS, r.amueblada),
    r.mascotas === true && 'Con mascotas',
  ].filter((v): v is string => !!v)
}

/** Detalle de renta de la propiedad: ["Depósito: 2 meses", "Plazo mínimo: 1 año", ...]. */
export function detalleRentaActivo(r: RentaActivo | null | undefined): string[] {
  if (!r) return []
  return [
    r.incluye_mantenimiento ? 'Mantenimiento incluido' : r.mantenimiento ? `Mantenimiento: $${r.mantenimiento.toLocaleString('es-MX')} al mes` : null,
    r.deposito_meses && `Depósito: ${r.deposito_meses} ${r.deposito_meses === 1 ? 'mes' : 'meses'}`,
    r.plazo_minimo && `Plazo mínimo: ${etiqueta(PLAZOS_CONTRATO, r.plazo_minimo)}`,
    r.garantia && `Pide: ${r.garantia === 'cualquiera' ? 'cualquier garantía' : etiqueta(GARANTIAS, r.garantia)!.toLowerCase()}`,
    r.amueblada === true ? 'Amueblada' : r.amueblada === false ? 'Sin amueblar' : null,
    r.mascotas === true ? 'Acepta mascotas' : r.mascotas === false ? 'Sin mascotas' : null,
  ].filter((v): v is string => !!v)
}

/**
 * Lo de renta que NO cumple (§22.4, "cumplimiento de la ficha": plazo, garantía, amueblada y
 * mascotas). Solo cuando los dos lados lo dicen: un dato que falta no descalifica.
 */
export function conflictosRenta(r: RentaActivo | null | undefined, n: Pick<Necesidad, 'renta'>): string[] {
  const f = n.renta
  if (!r || !f) return []
  const m: string[] = []
  if (f.mascotas === true && r.mascotas === false) m.push('No acepta mascotas')
  if (f.amueblada === 'si' && r.amueblada === false) m.push('No está amueblada')
  if (f.amueblada === 'no' && r.amueblada === true) m.push('Está amueblada')
  if (f.garantia && r.garantia && r.garantia !== 'cualquiera' && r.garantia !== f.garantia) m.push(`Pide ${etiqueta(GARANTIAS, r.garantia)!.toLowerCase()}`)
  if (f.plazo_contrato && r.plazo_minimo && orden(PLAZOS_CONTRATO, r.plazo_minimo) > orden(PLAZOS_CONTRATO, f.plazo_contrato)) {
    m.push(`Pide contrato de ${etiqueta(PLAZOS_CONTRATO, r.plazo_minimo)}`)
  }
  return m
}

export const millones = (n: number) =>
  n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000).toLocaleString('es-MX')} mil`

/** "$6M a $8M" o "hasta $8M"; en renta, "$25,000 a $35,000 al mes". */
export function presupuestoTexto(n: Pick<Necesidad, 'presupuesto_min' | 'presupuesto_max'> & { operacion?: Operacion | null }): string {
  if (n.operacion === 'renta') {
    const m = (v: number) => `$${Math.round(v).toLocaleString('es-MX')}`
    return n.presupuesto_min ? `${m(n.presupuesto_min)} a ${m(n.presupuesto_max)} al mes` : `hasta ${m(n.presupuesto_max)} al mes`
  }
  return n.presupuesto_min ? `${millones(n.presupuesto_min)} a ${millones(n.presupuesto_max)}` : `hasta ${millones(n.presupuesto_max)}`
}

export const etiquetaTipo = (t: string) => TIPOS_NECESIDAD.find((x) => x.id === t)?.etiqueta ?? t

/** Tarjeta del panel de brokers (§19.3): "Busca bodega · 1,000 m² · Apodaca · $6M a $8M · contado · ya". */
export function resumenNecesidad(n: Necesidad): string {
  const partes = [`Busca ${etiquetaTipo(n.tipo).toLowerCase()}${n.operacion === 'renta' ? ' en renta' : ''}`]
  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  const rec = n.caracteristicas.recamaras
  if (typeof rec === 'number') partes.push(`${rec} rec`)
  if (typeof area === 'number') partes.push(`${area.toLocaleString('es-MX')} m²`)
  partes.push(zonasDe(n).map(nombreZona).join(' · '))
  partes.push(presupuestoTexto(n))
  const pago = FORMAS_PAGO.find((f) => f.id === n.forma_pago)
  if (pago) partes.push(pago.etiqueta.toLowerCase())
  const plazo = PLAZOS.find((p) => p.id === n.plazo)
  if (plazo) partes.push(plazo.id === 'ya' ? 'para ya' : plazo.etiqueta.toLowerCase())
  if (n.renta?.plazo_contrato) partes.push(`contrato ${etiqueta(PLAZOS_CONTRATO, n.renta.plazo_contrato)}`)
  if (n.renta?.fecha_entrada) partes.push(n.renta.fecha_entrada === 'ya' ? 'entrada ya' : `entrada ${etiqueta(ENTRADAS, n.renta.fecha_entrada)!.toLowerCase()}`)
  return partes.join(' · ')
}

/** Detalle de las características para la tarjeta: ["Altura libre: 8 m", "Andenes de carga: 2", ...]. */
export function detalleCaracteristicas(n: Pick<Necesidad, 'tipo' | 'caracteristicas'>): string[] {
  return CARACTERISTICAS[n.tipo].flatMap((c) => {
    const v = n.caracteristicas[c.clave]
    if (v == null || c.clave === CAMPO_AREA[n.tipo]) return []
    if (Array.isArray(v)) return [`${c.etiqueta}: ${v.join(', ')}`]
    return [`${c.etiqueta}: ${typeof v === 'number' ? v.toLocaleString('es-MX') : v}${c.unidad ? ` ${c.unidad}` : ''}`]
  })
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const mismoMun = (a: string | null, b: string | null) => !!a && !!b && sinAcentos(municipioCanonico(a)) === sinAcentos(municipioCanonico(b))
const enColonia = (colonia: string | null | undefined, pedidas: string[]) =>
  !!colonia && pedidas.some((c) => sinAcentos(colonia).includes(sinAcentos(c)) || sinAcentos(c).includes(sinAcentos(colonia)))

type ConZonas = Pick<Necesidad, 'estado' | 'municipio' | 'zona' | 'colonias'> & { zonas?: ZonaBusqueda[] | null }

/** Las zonas de una ficha: las de la V9 o, en una ficha vieja, la única que tenía. */
export function zonasDe(n: ConZonas): ZonaBusqueda[] {
  return n.zonas?.length ? n.zonas : [{ estado: n.estado, municipio: n.municipio, nombre: n.zona, colonias: n.colonias ?? [] }]
}

/** "Country", "Del Valle, Valle Oriente" o "Apodaca". */
export const nombreZona = (z: ZonaBusqueda) => z.nombre || (z.colonias.length ? z.colonias.join(', ') : z.municipio)

/**
 * ¿En cuál de las zonas de la ficha cae la propiedad? Índice o -1. Primero la zona cuyas colonias
 * la incluyen; si no, una zona del mismo municipio sin colonias ("cualquiera en este municipio").
 * Así Country (con colonias) y Carretera Nacional (sin colonias), las dos en Monterrey, no se pisan.
 */
export function zonaDeActivo(a: { municipio: string | null; colonia?: string | null }, n: ConZonas): number {
  const zs = zonasDe(n)
  const porColonia = zs.findIndex((z) => mismoMun(a.municipio, z.municipio) && z.colonias.length > 0 && enColonia(a.colonia, z.colonias))
  if (porColonia >= 0) return porColonia
  return zs.findIndex((z) => mismoMun(a.municipio, z.municipio) && z.colonias.length === 0)
}

/**
 * Qué tan cerca está una opción de la ficha, de 0 a 100, con sus razones (§23.4). Ordena las
 * opciones DENTRO de cada zona; la zona no da puntos porque las tres valen igual.
 *   tipo 15 · precio dentro del presupuesto 40 (dentro del margen de ±10 %: 20) · superficie mínima
 *   25 (sin pedirla: 20 si se conoce, 10 si no) · en las colonias pedidas 20 (zona sin colonias: 20).
 */
export function puntajeOpcion(
  a: { tipo: string | null; municipio: string | null; colonia?: string | null; superficie: number | null } & OperacionDeActivo,
  n: Necesidad,
): { puntaje: number; razones: string[] } {
  const razones: string[] = []
  let p = 0
  if ([...normalizarTipos(a.tipo)].includes(n.tipo)) p += 15
  const precio = precioPara(a, n.operacion ?? 'compra')
  if (precio) {
    const min = n.presupuesto_min ?? 0, max = n.presupuesto_max
    if (precio >= min && precio <= max) {
      p += 40
      const abajo = Math.round((1 - precio / max) * 100)
      razones.push(abajo >= 3 ? `${abajo} % abajo de tu tope` : 'dentro de tu presupuesto')
    } else if (precio >= min * (1 - MARGEN_PRECIO) && precio <= max * (1 + MARGEN_PRECIO)) {
      p += 20
      razones.push(precio > max ? `${Math.round((precio / max - 1) * 100)} % arriba de tu tope` : 'cerca de tu presupuesto')
    }
  }
  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  if (typeof area === 'number' && a.superficie) {
    if (a.superficie >= area) { p += 25; razones.push(`${a.superficie.toLocaleString('es-MX')} m², pediste ${area.toLocaleString('es-MX')}`) }
    else if (a.superficie >= area * 0.9) p += 12
  } else p += a.superficie ? 20 : 10
  const i = zonaDeActivo(a, n)
  const z = i >= 0 ? zonasDe(n)[i] : null
  if (z && (z.colonias.length === 0 || enColonia(a.colonia, z.colonias))) {
    p += 20
    if (z.colonias.length && a.colonia) razones.push(`en ${a.colonia}`)
  }
  // Renta: plazo y garantía que no embonan restan (la ficha los pide, pero se pueden negociar).
  if (n.operacion === 'renta') {
    const c = conflictosRenta(a.renta, n).filter((m) => m.startsWith('Pide'))
    p -= 10 * c.length
    razones.push(...c.map((m) => m.toLowerCase()))
  }
  return { puntaje: Math.max(0, Math.min(100, p)), razones }
}

/**
 * "Lo que rinde tu dinero" en una zona (§23.2): con el precio por m² típico, cuántos m² alcanza el
 * presupuesto y, si pidió una superficie mínima, qué porcentaje le falta (negativo: le sobra).
 */
export function rindeDinero(precioM2: number | null | undefined, n: Pick<Necesidad, 'tipo' | 'caracteristicas' | 'presupuesto_max'>):
  { m2: number; faltaPct: number | null } | null {
  if (!precioM2 || precioM2 <= 0) return null
  const m2 = Math.round(n.presupuesto_max / precioM2 / 5) * 5
  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  const faltaPct = typeof area === 'number' && area > 0 ? Math.round((1 - n.presupuesto_max / (precioM2 * area)) * 100) : null
  return { m2, faltaPct }
}

export interface ActivoPropuesta extends OperacionDeActivo {
  tipo: string | null
  municipio: string | null
  colonia: string | null
  superficie: number | null
}

/**
 * ¿La propiedad cumple la ficha? (§19.3, regla de calidad del panel). Mismo tipo, mismo municipio,
 * colonia dentro de las pedidas (si pidió colonias), precio dentro del rango con ±10 % y, si ambos
 * datos existen, superficie de al menos el 90 % de la mínima. Devuelve los motivos de lo que no cumple.
 */
export function cumpleNecesidad(a: ActivoPropuesta, n: Necesidad): { cumple: boolean; motivos: string[] } {
  const motivos: string[] = []
  if (![...normalizarTipos(a.tipo)].includes(n.tipo)) motivos.push(`No es ${etiquetaTipo(n.tipo).toLowerCase()}`)
  if (zonaDeActivo(a, n) < 0) {
    const zs = zonasDe(n)
    const mismoMunicipio = zs.some((z) => mismoMun(a.municipio, z.municipio))
    motivos.push(mismoMunicipio
      ? `No está en las colonias que pidió (${zs.flatMap((z) => z.colonias).join(', ')})`
      : zs.length > 1 ? `No está en sus zonas (${zs.map(nombreZona).join(', ')})` : `No está en ${zs[0].municipio}`)
  }
  const op = n.operacion ?? 'compra'
  const precio = precioPara(a, op)
  if (!seOfrecePara(a, op)) motivos.push(op === 'renta' ? 'No está en renta' : 'No está en venta')
  else if (!precio) motivos.push(op === 'renta' ? 'No tiene renta mensual' : 'No tiene precio')
  else {
    const min = (n.presupuesto_min ?? 0) * (1 - MARGEN_PRECIO), max = n.presupuesto_max * (1 + MARGEN_PRECIO)
    if (precio < min || precio > max) motivos.push(`Su ${op === 'renta' ? 'renta' : 'precio'} (${dinero(precio, op)}) está fuera del presupuesto (${presupuestoTexto(n)}, ±10 %)`)
  }
  // Renta: mascotas y amueblada sí descalifican; plazo y garantía solo bajan el puntaje.
  if (op === 'renta') motivos.push(...conflictosRenta(a.renta, n).filter((m) => !m.startsWith('Pide')))
  const area = n.caracteristicas[CAMPO_AREA[n.tipo]]
  if (typeof area === 'number' && a.superficie && a.superficie < area * 0.9) {
    motivos.push(`Mide ${a.superficie.toLocaleString('es-MX')} m²; pidió al menos ${area.toLocaleString('es-MX')} m²`)
  }
  return { cumple: motivos.length === 0, motivos }
}

/** Texto de perfiles_intencion (formato que entiende lib/matching.ts): "$6M – $8M" o "Menos de $8M". */
export function presupuestoPerfil(n: Pick<Necesidad, 'presupuesto_min' | 'presupuesto_max'> & { operacion?: Operacion | null }): string {
  // Renta: texto que el matching de la V7 no lee como precio de compra (no hay que comparar una
  // renta mensual contra precios de venta).
  if (n.operacion === 'renta') return `Renta ${presupuestoTexto(n)}`
  const m = (v: number) => `$${+(v / 1_000_000).toFixed(2)}M`
  return n.presupuesto_min ? `${m(n.presupuesto_min)} – ${m(n.presupuesto_max)}` : `Menos de ${m(n.presupuesto_max)}`
}
