// Entrada simple tipo chat del MUNDO DEMO (guion v12, momento 1; decisión de JC del 19-nov-2026):
// "Bienvenido a SMT Match. ¿Ya eres miembro?". Se entra con el nombre de usuario o el teléfono, sin
// contraseña y sin verificación. Solo existe en el mundo demo (/entrar?mundo=demo): el mundo real sigue
// entrando con correo y contraseña hasta que JC decida cómo se verifica (código por correo o WhatsApp).
//
// El nombre de usuario es la parte local del correo de la cuenta demo (<usuario>@demo.smtbroker.mx):
// así las cuentas demo de siempre (diego.salinas, laura.garza…) ya tienen usuario, y lib/mundo.ts y
// app/api/registro-cliente siguen reconociendo el mundo demo por el correo.

export const DOMINIO_DEMO = 'demo.smtbroker.mx'

/** Solo dígitos; los teléfonos se comparan por sus últimos 10 (sin lada de país). */
export const digitos = (t: string) => t.replace(/\D/g, '')
export const diezDigitos = (t: string) => digitos(t).slice(-10)

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Usuario tal como se guarda: minúsculas, sin acentos ni espacios. */
export const normalizarUsuario = (u: string) => sinAcentos(u.trim().toLowerCase()).replace(/^@/, '').replace(/\s+/g, '.')

/** 3 a 30 caracteres: letras, números, punto, guion o guion bajo; empieza y termina con letra o número. */
export function validarUsuario(u: string): string | null {
  if (u.length < 3) return 'Tu nombre de usuario necesita al menos 3 letras o números'
  if (u.length > 30) return 'Tu nombre de usuario puede tener hasta 30 caracteres'
  if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(u)) return 'Usa solo letras, números, punto o guion, sin espacios'
  return null
}

/** "Patricia Longoria" → "patricia.longoria". */
export function sugerirUsuario(nombre: string): string {
  const base = sinAcentos(nombre.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
  return base.slice(0, 30)
}

/** ¿Lo que escribió en "usuario o teléfono" es un teléfono? (10 dígitos o más, sin letras). */
export const esTelefono = (t: string) => !/[a-z]/i.test(t) && digitos(t).length >= 10

export interface Contactos { whatsapp: string; telefono: string; correo: string }

/** Al menos un medio de contacto, y los que vengan, bien escritos. */
export function validarContactos(c: Contactos): string | null {
  const w = c.whatsapp.trim(), t = c.telefono.trim(), m = c.correo.trim()
  if (!w && !t && !m) return 'Déjanos al menos un medio de contacto: WhatsApp, teléfono o correo'
  if (w && digitos(w).length < 10) return 'Escribe tu WhatsApp a 10 dígitos'
  if (t && digitos(t).length < 10) return 'Escribe tu teléfono a 10 dígitos'
  if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return 'Escribe un correo válido'
  return null
}
