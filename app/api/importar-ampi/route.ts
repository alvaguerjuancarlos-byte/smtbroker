import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { calcularScore } from '@/lib/prospectosBrokerScore'

// Ingesta bajo demanda desde el directorio público de socios de AMPI Monterrey — dispara SOLO
// cuando el Broker Maestro le da clic a "Importar desde AMPI" en /panel/prospectos-broker (ver
// handoff, Sección 7: el spike ya confirmó "Go condicionado" — endpoint JSON público, sin
// captcha ni login). Nunca corre sola ni por cron: cada import es una acción humana explícita.
//
// El endpoint es de un proveedor externo ("InmoApp", no ampimty.com) y no es API pública
// documentada — puede cambiar de forma o desaparecer sin aviso. Si falla, se reporta el error
// tal cual, no se reintenta ni se cachea nada.
const AMPI_ENDPOINT = 'https://backampi.inmoapp.mx/api/landing/partners/ampimty.com'

interface SocioAmpi {
  name: string
  url: string | null
  email: string | null
  phone: string | null
  province: string | null
}

export async function POST(req: NextRequest) {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token)
  if (callerError || !caller?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let socios: SocioAmpi[]
  try {
    const res = await fetch(AMPI_ENDPOINT, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMTBROKER-ingesta/1.0; contacto@mindbridge.com.mx)' },
    })
    if (!res.ok) throw new Error(`Respuesta ${res.status} del directorio de AMPI`)
    socios = await res.json()
    if (!Array.isArray(socios)) throw new Error('Formato inesperado — el directorio de AMPI no devolvió una lista')
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo consultar el directorio de AMPI: ${e.message}` }, { status: 502 })
  }

  // Dedup contra lo ya importado — se identifica por email (único dato con cobertura ~100% en
  // esta fuente; url y teléfono faltan en la mayoría de los registros).
  const { data: existentes } = await supabaseAdmin
    .from('prospectos_broker')
    .select('email')
    .eq('fuente', 'ampi')
  const emailsExistentes = new Set((existentes || []).map((r: { email: string | null }) => r.email).filter(Boolean))

  let nuevos = 0
  let duplicados = 0
  let sinEmail = 0

  for (const socio of socios) {
    if (!socio.email) { sinEmail++; continue }
    if (emailsExistentes.has(socio.email)) { duplicados++; continue }

    const zona = socio.province || null
    // AMPI no reporta volumen de listados — la regla de volumen del score nunca aplica a esta
    // fuente hasta que se cruce con otra señal (ver handoff, Sección 3).
    const { score } = calcularScore({ zona: zona || '', volumenListadosAparente: null, afiliacionPrevia: false })

    const { error: insertError } = await supabaseAdmin.from('prospectos_broker').insert({
      nombre: socio.name,
      fuente: 'ampi',
      fuente_ref: socio.url || socio.email,
      email: socio.email,
      telefono: socio.phone || null,
      zona,
      volumen_listados_aparente: null,
      score_filtrado: score,
    })

    if (insertError) {
      return NextResponse.json({ error: `Falló al guardar "${socio.name}": ${insertError.message}`, nuevos, duplicados }, { status: 500 })
    }
    emailsExistentes.add(socio.email)
    nuevos++
  }

  return NextResponse.json({ ok: true, total: socios.length, nuevos, duplicados, sinEmail })
}
