import Link from 'next/link'

// Aviso de Privacidad Simplificado (LFPDPPP art. 16 / art. 15 del Reglamento) — versión
// corta a mostrar en el punto donde se recaba el dato, con link al Aviso Integral
// (/aviso-privacidad). Dos variantes de texto:
//   - 'directo': el titular está llenando el formulario él mismo (/bienvenida).
//   - 'prospeccion': el dato NO vino del titular (p. ej. directorio público de AMPI) — este
//     es el caso que exige mostrar el aviso en el primer contacto real, antes de que ese
//     contacto ocurra. Ver el gate en app/panel/prospectos-broker/page.tsx.
const TEXTOS: Record<'directo' | 'prospeccion' | 'interesado', string> = {
  // 'interesado': "Me interesa" de la página pública de una propiedad (app/p/[id]).
  interesado:
    'MindBridge tratará los datos de este formulario para hacerlos llegar al broker o al propietario de esta propiedad, que te contactará sobre ella. No los usaremos para otros fines sin tu consentimiento.',
  directo:
    'MindBridge tratará los datos de este formulario para gestionar tu solicitud en SMTBROKER y, salvo que te opongas, para contactarte sobre oportunidades relacionadas con tu perfil.',
  prospeccion:
    'Este contacto usa datos que pueden haberse obtenido de un directorio público de un tercero, no proporcionados directamente por ti. MindBridge los trata únicamente para evaluarte como potencial broker aliado de SMTBROKER, salvo que te opongas.',
}

export function AvisoSimplificado({
  contexto,
  tema = 'oscuro',
}: {
  contexto: 'directo' | 'prospeccion' | 'interesado'
  tema?: 'oscuro' | 'claro'
}) {
  const esOscuro = tema === 'oscuro'
  return (
    <p className={`text-[11.5px] leading-[1.6] ${esOscuro ? 'text-slate' : 'text-gray-500'}`}>
      {TEXTOS[contexto]} Consulta el{' '}
      <Link href="/aviso-privacidad" target="_blank" className={esOscuro ? 'text-gold-400 underline' : 'text-blue-600 underline'}>
        Aviso de Privacidad Integral
      </Link>.
    </p>
  )
}
