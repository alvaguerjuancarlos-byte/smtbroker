// Nivel de Broker Certificado SMT calculado en el SERVIDOR (solo con supabaseAdmin). El portal del
// broker y la consola de Operación lo calculan en el navegador con sus propios datos; aquí hace
// falta para mostrarle a un PROPIETARIO el nivel de brokers ajenos (Documento Maestro V6.3, §15)
// sin abrirle por RLS los portafolios ni los cierres de nadie. Misma regla: lib/nivelesBroker.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularNivel, type Nivel } from '@/lib/nivelesBroker'
import { tieneDocumentacion } from '@/lib/expediente'
import { municipioCanonico } from '@/lib/matching'

export interface PerfilBroker {
  id: string
  nombre: string
  pionero: boolean
  nivel: Nivel
  propiedades: number
  certificadas: number
  cierresVerificados: number
  /** Municipios (canónicos) donde tiene propiedades: su zona de trabajo. */
  municipios: Set<string>
}

/** Perfil público de desempeño de los brokers de un mundo (demo o real). */
export async function perfilesBrokers(admin: SupabaseClient, esDemo: boolean): Promise<PerfilBroker[]> {
  const { data: brokers } = await admin.from('usuarios').select('id, nombre, pionero').eq('rol', 'broker').eq('es_demo', esDemo)
  const lista = (brokers as { id: string; nombre: string | null; pionero: boolean | null }[]) || []
  if (!lista.length) return []
  const ids = lista.map((b) => b.id)

  const [{ data: activos }, { data: cierres }] = await Promise.all([
    admin.from('activos').select('id, broker_id, municipio, folio_real, escritura_publica').in('broker_id', ids),
    admin.from('cierres_reportados').select('broker_id').eq('estado', 'verificado').in('broker_id', ids),
  ])
  const A = (activos as { id: string; broker_id: string; municipio: string | null; folio_real: string | null; escritura_publica: string | null }[]) || []
  const { data: certs } = A.length
    ? await admin.from('certificaciones').select('activo_id').eq('estado', 'certificada').in('activo_id', A.map((a) => a.id))
    : { data: [] }
  const certificadas = new Set(((certs as { activo_id: string }[]) || []).map((c) => c.activo_id))
  const C = (cierres as { broker_id: string }[]) || []

  return lista.map((b) => {
    const propios = A.filter((a) => a.broker_id === b.id)
    const cierresVerificados = C.filter((c) => c.broker_id === b.id).length
    return {
      id: b.id,
      nombre: b.nombre || 'Broker',
      pionero: !!b.pionero,
      nivel: calcularNivel({
        propiedades: propios.length,
        conDocumentacion: propios.filter(tieneDocumentacion).length,
        cierresVerificados,
        pionero: !!b.pionero,
      }).actual,
      propiedades: propios.length,
      certificadas: propios.filter((a) => certificadas.has(a.id)).length,
      cierresVerificados,
      municipios: new Set(propios.map((a) => municipioCanonico(a.municipio)).filter(Boolean)),
    }
  })
}
