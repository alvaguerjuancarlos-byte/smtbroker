// Radar de mercado, fase 1 (Documento Maestro V7.1 §18; migración 20261101000100). Reglas
// compartidas entre las rutas del comprador (app/api/radar) y de Operación (app/api/operacion/radar).

export type EstadoInvitacion = 'sin_invitar' | 'pendiente' | 'enviada' | 'aceptada' | 'rechazada' | 'sin_respuesta'
export const ESTADOS_INVITACION: EstadoInvitacion[] = ['sin_invitar', 'pendiente', 'enviada', 'aceptada', 'rechazada', 'sin_respuesta']
export const CANALES = ['correo', 'whatsapp', 'portal', 'telefono'] as const
/** Al cerrar la invitación, el contacto del anunciante se borra (solo vive mientras dura). */
export const INVITACION_CERRADA: EstadoInvitacion[] = ['aceptada', 'rechazada', 'sin_respuesta']

/** Parámetros de rastreo que no cambian el anuncio: dos ligas al mismo anuncio cuentan como una. */
const RASTREO = /^(utm_|fbclid$|gclid$|igshid$|ref$|mc_)/i

/** Liga canónica del anuncio y su fuente (dominio sin www). null si no es una liga web válida. */
export function normalizarLiga(texto: string): { url: string; fuente: string } | null {
  let u: URL
  try { u = new URL(texto.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!u.hostname.includes('.')) return null
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (RASTREO.test(k)) u.searchParams.delete(k)
  u.hostname = u.hostname.toLowerCase()
  const url = u.toString().replace(/\/$/, '')
  return { url, fuente: u.hostname.replace(/^www\./, '') }
}

/** Lo que ve el comprador de una opción de su Radar. */
export function estadoParaComprador(o: { interesado: boolean; invitacion: EstadoInvitacion; certificada: boolean }): string {
  if (o.certificada) return 'Ya certificada: aparece en tus coincidencias'
  if (!o.interesado) return 'No certificada'
  return {
    sin_invitar: 'Invitación en camino', pendiente: 'Invitación en camino', enviada: 'Invitación enviada al anunciante',
    aceptada: 'Aceptó: se está certificando', rechazada: 'El anunciante no quiso certificar', sin_respuesta: 'Sin respuesta del anunciante',
  }[o.invitacion]
}

/** Mensaje listo para que Operación invite al anunciante (sin hablar de cobros: "obtiene la certificación"). */
export function mensajeInvitacion(a: { fuente: string; titulo: string | null }, interesados: number, sitio: string): string {
  const quien = interesados > 1 ? `${interesados} compradores están interesados` : 'Un comprador está interesado'
  return `Hola. ${quien} en tu propiedad${a.titulo ? ` "${a.titulo}"` : ''} anunciada en ${a.fuente}. ` +
    `En SMTBROKER certificamos la propiedad -- precio de mercado y revisión de documentos -- para que los compradores ` +
    `la vean con certeza y te contacten. Si te interesa, regístrala aquí: ${sitio}/bienvenida. ` +
    `Si prefieres que no te volvamos a escribir, responde "no" y no te contactaremos de nuevo por esta propiedad.`
}
