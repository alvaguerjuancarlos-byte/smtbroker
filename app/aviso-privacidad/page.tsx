// Aviso de Privacidad Integral — LFPDPPP art. 16. Cubre las tres formas en que la
// plataforma recaba datos personales hoy: formulario público de /bienvenida (directo del
// titular), publicación de un activo (propietario), y el módulo de Prospección de Brokers,
// donde una parte de los prospectos se obtiene de un directorio público de un tercero (AMPI)
// antes de tener contacto directo con el titular — ver sección VII, es el caso que motivó
// este documento (ver banner que existía en /panel/prospectos-broker antes de este aviso).
//
// Redactado como punto de partida funcional, no como asesoría legal: antes de usarlo para
// contactar prospectos reales de fuente distinta al titular, conviene una revisión legal,
// dado que es el escenario de mayor riesgo (art. 15 del Reglamento de la LFPDPPP).
//
// Última actualización: mantener sincronizada con la fecha real de publicación de cambios,
// no es una constante decorativa.
const ULTIMA_ACTUALIZACION = '27 de septiembre de 2026'
const CORREO_ARCO = 'privacidad@mail.mindbridge.com.mx'
const DOMICILIO_RESPONSABLE = 'Leonardo 324, Col. Renacimiento, Monterrey, N.L., C.P. 64925'

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}

function Seccion({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-fraunces text-[18px] md:text-[20px] font-medium text-paper mb-2.5">
        <span className="text-gold-400 font-plex-mono text-[13px] mr-2">{n}</span>{titulo}
      </h2>
      <div className="text-[13.5px] leading-[1.75] text-paper-dim space-y-3">{children}</div>
    </section>
  )
}

export default function AvisoPrivacidadPage() {
  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
      <div className="relative flex flex-col flex-1">
        <main className="flex-1 px-4 md:px-6 py-10 md:py-16">
          <div className="w-full max-w-[720px] mx-auto">

            <span className="font-plex-mono text-[11px] font-medium text-gold-400 tracking-[0.18em] uppercase">SMTBROKER · Legal</span>
            <h1 className="font-fraunces text-[28px] md:text-[36px] font-medium text-paper mt-2 mb-1">Aviso de Privacidad Integral</h1>
            <p className="text-[12.5px] text-slate mb-10">Última actualización: {ULTIMA_ACTUALIZACION}</p>

            <p className="text-[13.5px] leading-[1.75] text-paper-dim mb-10">
              MindBridge ("el Responsable") es responsable del tratamiento de los datos personales que recaba a
              través de la plataforma SMTBROKER (<span className="font-plex-mono text-paper">smtbroker.vercel.app</span>),
              con domicilio en {DOMICILIO_RESPONSABLE}, en cumplimiento de la Ley Federal de Protección de Datos
              Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento. Este aviso te informa qué datos
              recabamos, para qué los usamos, y cómo puedes ejercer tus derechos sobre ellos.
            </p>

            <Seccion n="I" titulo="Datos personales que recabamos">
              <p>Según cómo llegaste a la plataforma, podemos recabar:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><b className="text-paper">Si solicitaste acceso</b> (propietario, inversionista o broker, vía "Solicitar acceso"): nombre, correo electrónico y teléfono, más — según el rol elegido — tipo de activo y municipio, presupuesto e intereses de inversión, o años de experiencia y zona de operación.</li>
                <li><b className="text-paper">Si publicaste un activo:</b> dirección del inmueble, datos catastrales y legales (clave catastral, folio real, escritura pública, gravámenes conocidos, uso de suelo declarado), superficie y precio.</li>
                <li><b className="text-paper">Si eres broker y tu perfil llegó al módulo interno de Prospección de Brokers:</b> nombre, correo, teléfono y zona/volumen de actividad aparente — en algunos casos obtenidos de un directorio público de un tercero antes de tener contacto directo contigo (ver Sección VII).</li>
              </ul>
              <p>No solicitamos ni tratamos datos sensibles en términos del artículo 3, fracción VI de la Ley (origen étnico o racial, estado de salud, información genética, creencias religiosas/filosóficas/morales, afiliación sindical, opiniones políticas o preferencia sexual).</p>
            </Seccion>

            <Seccion n="II" titulo="Finalidades del tratamiento">
              <p><b className="text-paper">Primarias</b> — necesarias para prestarte el servicio; sin ellas no podemos operar tu solicitud:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Crear y administrar tu cuenta, y verificar tu acceso.</li>
                <li>Dar seguimiento a tu solicitud de acceso, activo publicado, perfil de inversión, o alta como broker aliado.</li>
                <li>Operar el diagnóstico legal/catastral y el flujo de marketing y cierre de un activo.</li>
                <li>Contactarte para verificar tu licencia o cédula profesional (si aplica) o para notificarte del estado de tu operación.</li>
              </ul>
              <p><b className="text-paper">Secundarias</b> — no son indispensables; puedes oponerte a ellas sin que se cancele el servicio primario:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Invitarte a formar parte de la red de brokers aliados si tu perfil aparece como potencial aliado, incluyendo contacto a partir de datos obtenidos de fuentes públicas (ver Sección VII).</li>
                <li>Enviarte comunicaciones sobre nuevas funcionalidades de la plataforma.</li>
              </ul>
              <p>Si no deseas que tus datos se usen para las finalidades secundarias, escríbenos a <a href={`mailto:${CORREO_ARCO}`} className="text-gold-400 underline">{CORREO_ARCO}</a> con el asunto "Oposición a finalidades secundarias".</p>
            </Seccion>

            <Seccion n="III" titulo="Medios para ejercer tus derechos ARCO">
              <p>
                Puedes acceder, rectificar o cancelar tus datos personales, oponerte a su tratamiento, o revocar tu
                consentimiento (derechos ARCO) escribiendo a <a href={`mailto:${CORREO_ARCO}`} className="text-gold-400 underline">{CORREO_ARCO}</a>, indicando:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Tu nombre completo.</li>
                <li>El derecho que deseas ejercer.</li>
                <li>Una descripción clara de los datos sobre los que buscas ejercerlo.</li>
                <li>Cualquier documento que facilite localizar tus datos en nuestros sistemas.</li>
              </ul>
              <p>Responderemos dentro de los plazos que marca la Ley: 20 días hábiles para resolver tu solicitud, y 15 días hábiles adicionales para hacerla efectiva una vez que te notifiquemos la respuesta.</p>
            </Seccion>

            <Seccion n="IV" titulo="Transferencias de datos">
              <p>Para operar la plataforma, compartimos tus datos con los siguientes encargados, únicamente en la medida necesaria para prestarte el servicio — no se venden ni se comparten con fines distintos a los de este aviso:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><b className="text-paper">Supabase Inc.</b> — base de datos y autenticación de la plataforma.</li>
                <li><b className="text-paper">Vercel Inc.</b> — hospedaje de la aplicación.</li>
                <li><b className="text-paper">Resend</b> — envío de correos transaccionales (confirmaciones, invitaciones, restablecimiento de contraseña).</li>
              </ul>
              <p>Estos proveedores pueden procesar datos en servidores fuera de México como parte de su infraestructura de nube. No realizamos ninguna otra transferencia de tus datos personales a terceros, salvo que una autoridad competente nos lo requiera conforme a la Ley.</p>
            </Seccion>

            <Seccion n="V" titulo="Datos obtenidos de una fuente distinta al titular">
              <p>
                Si eres broker inmobiliario, es posible que hayamos obtenido tu nombre, correo, teléfono y/o zona de
                operación de un directorio público de una asociación de profesionales inmobiliarios (por ejemplo,
                AMPI), sin que tú nos los hayas proporcionado directamente.
              </p>
              <p>
                En ese caso, este aviso —o su versión simplificada— te será puesto a tu disposición en el primer
                contacto que tengamos contigo, antes de tratar tus datos para cualquier finalidad adicional a la
                evaluación interna de tu perfil como potencial aliado. Puedes oponerte a este tratamiento en
                cualquier momento escribiendo a <a href={`mailto:${CORREO_ARCO}`} className="text-gold-400 underline">{CORREO_ARCO}</a>.
              </p>
            </Seccion>

            <Seccion n="VI" titulo="Cookies y tecnologías de rastreo">
              <p>
                La plataforma utiliza únicamente las cookies estrictamente necesarias para mantener tu sesión
                iniciada, gestionadas por nuestro proveedor de autenticación (Supabase). Hoy no utilizamos cookies
                de analítica ni de publicidad.
              </p>
            </Seccion>

            <Seccion n="VII" titulo="Cambios a este aviso">
              <p>
                Podemos actualizar este aviso para reflejar cambios en la plataforma o en la normatividad aplicable.
                Publicaremos cualquier cambio en esta misma página, indicando la fecha de la última actualización.
                Te recomendamos consultarla periódicamente.
              </p>
            </Seccion>

          </div>
        </main>
      </div>
    </div>
  )
}
