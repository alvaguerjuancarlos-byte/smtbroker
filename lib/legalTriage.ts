// Lógica de triage del diagnóstico legal (Agente Legal) — puerto directo de la tabla
// routes/scenarios de los prototipos smtbroker-input-catastro.html / smtbroker-output-catastro.html
// (ver HANDOFF_Catastro_Input_Output.md). Función pura, sin datos reales: mientras no se cierren
// los spikes de AMPI/RPP-IRCNL, esto es simulación — nunca certifica nada real.

export type EstadoDocumentacionLegal = 'completa' | 'parcial' | 'no_localizada'

export interface CheckLegal {
  cls: 'ok' | 'warn' | 'bad'
  status: string
  desc: string
  fuente: string
}

export interface TriageLegal {
  ruta: 'fast' | 'hybrid' | 'slow'
  rutaLabel: string
  rutaDesc: string
  verdictCls: 'ok' | 'warn' | 'bad'
  verdictBadge: string
  verdictTitle: string
  verdictDesc: string
  score: string
  usoSuelo: CheckLegal
  rpp: CheckLegal
}

const TRIAGE: Record<EstadoDocumentacionLegal, TriageLegal> = {
  completa: {
    ruta: 'fast',
    rutaLabel: 'Ruta rápida',
    rutaDesc: 'Documentación completa. El Agente Legal valida directamente contra fuentes oficiales — diagnóstico de 90 segundos sin bloqueos.',
    verdictCls: 'ok',
    verdictBadge: 'LISTO PARA PUBLICAR',
    verdictTitle: 'Diagnóstico legal completo',
    verdictDesc: 'Documentación completa aportada por el propietario. El Agente Legal validó directamente contra fuentes oficiales.',
    score: '9.2',
    usoSuelo: { cls: 'ok', status: 'VERIFICADO', desc: 'Coincide con lo declarado por el propietario. Confirmado contra portal estatal / SEDUVI.', fuente: 'SIG estatal / SEDUVI, INEGI — datos abiertos' },
    rpp: { cls: 'ok', status: 'VERIFICADO', desc: 'Folio real y libertad de gravamen confirmados con la documentación aportada por el propietario.', fuente: 'Registro Público de la Propiedad Nuevo León — sin API programática nacional' },
  },
  parcial: {
    ruta: 'hybrid',
    rutaLabel: 'Ruta híbrida',
    rutaDesc: 'El diagnóstico de 90 segundos corre con lo disponible, en paralelo a validación manual del broker sobre lo faltante (folio, gravamen o escritura).',
    verdictCls: 'warn',
    verdictBadge: 'PUBLICABLE CON NOTA',
    verdictTitle: 'Diagnóstico legal parcial',
    verdictDesc: 'Documentación parcial. El diagnóstico corre con lo disponible, en paralelo a validación manual de un broker sobre lo faltante.',
    score: '6.8',
    usoSuelo: { cls: 'ok', status: 'VERIFICADO', desc: 'Coincide con lo declarado por el propietario. Confirmado contra portal estatal / SEDUVI.', fuente: 'SIG estatal / SEDUVI, INEGI — datos abiertos' },
    rpp: { cls: 'warn', status: 'EN VALIDACIÓN', desc: 'Folio en proceso de validación manual — un broker fue asignado para confirmar contra el RPP (ver Spike RPP Nuevo León: Go condicionado, requiere verificación caso por caso).', fuente: 'Registro Público de la Propiedad Nuevo León — sin API programática nacional' },
  },
  no_localizada: {
    ruta: 'slow',
    rutaLabel: 'Ruta lenta',
    rutaDesc: 'El diagnóstico automatizado queda limitado. Se marca el activo para validación humana antes de certificar — consistente con el gap de RPP ya documentado.',
    verdictCls: 'bad',
    verdictBadge: 'REQUIERE VALIDACIÓN MANUAL',
    verdictTitle: 'Diagnóstico legal incompleto',
    verdictDesc: 'Sin documentación aportada. Este activo no puede certificarse hasta validación humana.',
    score: '3.1',
    usoSuelo: { cls: 'warn', status: 'VERIFICADO CON RESERVA', desc: 'Verificado por ubicación geográfica; sin folio catastral para confirmar el predio exacto.', fuente: 'SIG estatal / SEDUVI, INEGI — datos abiertos' },
    rpp: { cls: 'bad', status: 'NO LOCALIZADO', desc: 'Sin documentación ni folio aportado. Consistente con la Brecha 1 del documento de Fuentes de Datos — requiere RPA, intermediario, o validación humana antes de certificar.', fuente: 'Registro Público de la Propiedad Nuevo León — sin API programática nacional' },
  },
}

// Ambiental/CFE no dependen de estado_documentacion_legal — dependen solo de lat/lng (aquí
// fijos, per el prototipo: ningún predio de prueba coincide con capa conocida). Nunca certifican
// ausencia total — ver notas de fuente.
export const CHECK_AMBIENTAL: CheckLegal = {
  cls: 'ok',
  status: 'SIN RESTRICCIONES',
  desc: 'El polígono no coincide con Áreas Naturales Protegidas, Ordenamientos Ecológicos ni Regiones Prioritarias conocidas.',
  fuente: 'CONANP / CONABIO (capas shapefile) — SIGEIA no expone API, este resultado no es consulta en vivo',
}

export const CHECK_CFE: CheckLegal = {
  cls: 'warn',
  status: 'SIN PROXIMIDAD DETECTADA',
  desc: 'Sin proximidad a líneas de transmisión conocidas (capa SENER). Esto no certifica la ausencia de servidumbre — CFE no publica dataset abierto por predio.',
  fuente: 'SENER (proximidad) — verificación de servidumbre requiere trámite directo ante CFE',
}

// `null`/valor desconocido se trata como 'no_localizada' — nunca se asume "verificado" por
// default silencioso (ver plan: activos existentes sin este dato no deben leerse como OK).
export function legalTriage(estado: string | null | undefined): TriageLegal {
  if (estado === 'completa' || estado === 'parcial') return TRIAGE[estado]
  return TRIAGE.no_localizada
}
