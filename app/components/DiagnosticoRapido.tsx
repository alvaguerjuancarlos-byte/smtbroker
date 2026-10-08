'use client'

// Diagnóstico rápido + certificación legal (Documento Maestro V6.3, §13; paso 4 del plan).
// Reemplaza en /activo/[id] el dictamen legal que corría al abrir el activo: con el expediente
// vacío solo decía "no apto". Ahora el "expediente incompleto" deja de ser un rechazo y se vuelve
// el motivo para certificar:
//   1. Uso de suelo oficial si hay GIS (San Pedro) y la lista de documentos que faltan.
//   2. "Completar expediente" (mismos campos del alta, app/components/CatastroLegalSection.tsx).
//   3. "Solicitar certificación legal" → Operación confirma el pago, corre el dictamen y certifica.
// El dictamen completo (DiagnosticoLegal) se muestra solo cuando la propiedad ya está certificada.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ETIQUETA_CERTIFICACION, LIMITE_CERTIFICACIONES_MES, type DocumentoFaltante, type EstadoCertificacion } from '@/lib/expediente'
import { CatastroLegalSection, type CatastroLegalValue } from './CatastroLegalSection'

export interface DiagnosticoRapidoData {
  usoSuelo: { uso: string; descripcion: string; distrito: string; fuente: string } | null
  gisDisponible: boolean
  usoSueloDeclarado: string | null
  faltantes: DocumentoFaltante[]
  listoParaCertificar: boolean
  certificacion: { id: string; estado: EstadoCertificacion; created_at: string; actualizado_at: string } | null
}

export interface ExpedienteActivo {
  id: string
  clave_catastral: string | null
  folio_real: string | null
  estado_documentacion_legal: string | null
  escritura_publica: string | null
  gravamenes_conocidos: string | null
  uso_suelo_declarado: string | null
  superficie_construccion_m2: number | null
}

const USO_DECLARADO: Record<string, string> = {
  habitacional: 'Habitacional', comercial: 'Comercial', mixto: 'Mixto', industrial: 'Industrial', no_determinado: 'No declarado',
}

const aValorFormulario = (a: ExpedienteActivo): CatastroLegalValue => ({
  clave_catastral: a.clave_catastral ?? '',
  folio_real: a.folio_real ?? '',
  estado_documentacion_legal: (a.estado_documentacion_legal ?? '') as CatastroLegalValue['estado_documentacion_legal'],
  escritura_publica: (['si', 'no', 'no_sabe'].includes(a.escritura_publica ?? '') ? a.escritura_publica : (a.escritura_publica ? 'si' : '')) as CatastroLegalValue['escritura_publica'],
  gravamenes_conocidos: (a.gravamenes_conocidos ?? 'ninguno') as CatastroLegalValue['gravamenes_conocidos'],
  uso_suelo_declarado: (a.uso_suelo_declarado ?? 'no_determinado') as CatastroLegalValue['uso_suelo_declarado'],
  superficie_construccion_m2: a.superficie_construccion_m2 != null ? String(a.superficie_construccion_m2) : '',
})

const boton = 'font-plex-mono text-[12px] px-4 py-2.5 border transition-colors'

export function DiagnosticoRapido({
  datos, error, activo, tipoActivo, onActualizado,
}: {
  datos: DiagnosticoRapidoData | null
  error: string | null
  activo: ExpedienteActivo
  tipoActivo: string
  onActualizado: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<CatastroLegalValue>(() => aValorFormulario(activo))
  const [guardando, setGuardando] = useState(false)
  const [solicitando, setSolicitando] = useState(false)
  const [aviso, setAviso] = useState('')

  if (error) {
    return <div className="bg-navy-800 border border-red-900/40 p-5 text-[13px] text-paper-dim">No se pudo revisar el expediente ({error}).</div>
  }
  if (!datos) {
    return (
      <div className="bg-navy-800 border border-white/10 p-5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />
        <p className="text-[13px] text-slate font-plex-mono">Revisando uso de suelo y expediente…</p>
      </div>
    )
  }

  const cert = datos.certificacion
  // Con una certificación abierta o ya otorgada, el expediente no se toca: es lo que se dictaminó.
  const expedienteBloqueado = cert?.estado === 'en_revision' || cert?.estado === 'certificada'

  const guardarExpediente = async () => {
    setGuardando(true); setAviso('')
    const { error: e } = await supabase.from('activos').update({
      clave_catastral: form.clave_catastral.trim() || null,
      folio_real: form.folio_real.trim() || null,
      estado_documentacion_legal: form.estado_documentacion_legal || null,
      escritura_publica: form.escritura_publica || null,
      gravamenes_conocidos: form.gravamenes_conocidos,
      uso_suelo_declarado: form.uso_suelo_declarado,
      superficie_construccion_m2: form.superficie_construccion_m2 ? parseFloat(form.superficie_construccion_m2) : null,
    }).eq('id', activo.id)
    setGuardando(false)
    if (e) { setAviso('No se pudo guardar el expediente. Intenta de nuevo.'); return }
    setEditando(false)
    onActualizado()
  }

  const solicitarCertificacion = async () => {
    setSolicitando(true); setAviso('')
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/certificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
      body: JSON.stringify({ activoId: activo.id }),
    }).then(res => res.json()).catch(() => ({ error: 'Error de red' }))
    setSolicitando(false)
    if (r.error) { setAviso(r.error); return }
    onActualizado()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Uso de suelo */}
      <div className="bg-navy-800 border border-white/10 p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h4 className="text-[14px] font-medium text-paper">Uso de suelo</h4>
          <span className="font-plex-mono text-[10px] uppercase tracking-wide px-2 py-0.5 border border-white/15 text-slate">
            Declarado: {USO_DECLARADO[datos.usoSueloDeclarado ?? 'no_determinado'] ?? datos.usoSueloDeclarado}
          </span>
        </div>
        {datos.usoSuelo ? (
          <>
            <p className="text-[13px] text-paper-dim leading-relaxed">
              Zonificación oficial: <b className="text-paper">{datos.usoSuelo.uso}</b> — {datos.usoSuelo.descripcion} (distrito {datos.usoSuelo.distrito}).
            </p>
            <p className="text-[11px] text-slate mt-1.5"><b className="font-medium">Fuente:</b> {datos.usoSuelo.fuente}</p>
          </>
        ) : (
          <p className="text-[13px] text-paper-dim leading-relaxed">
            {datos.gisDisponible
              ? 'No se pudo ubicar el predio en el GIS municipal (revisa que el punto del mapa esté sobre el terreno).'
              : 'Este municipio no publica su zonificación en línea: el uso de suelo se revisa en la certificación legal.'}
          </p>
        )}
      </div>

      {/* Expediente */}
      <div className="bg-navy-800 border border-white/10 p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h4 className="text-[14px] font-medium text-paper">Expediente para certificar</h4>
          {!expedienteBloqueado && !editando && (
            <button onClick={() => { setForm(aValorFormulario(activo)); setEditando(true) }}
              className="font-plex-mono text-[11px] text-gold-400 hover:text-gold-100 underline underline-offset-2">
              {datos.faltantes.length ? 'Completar expediente' : 'Editar expediente'}
            </button>
          )}
        </div>
        {datos.faltantes.length === 0 ? (
          <p className="text-[13px] text-[#6bdb9a]">✓ Expediente completo: folio real, escritura, clave catastral, gravámenes y uso de suelo declarados.</p>
        ) : (
          <>
            <p className="text-[13px] text-paper-dim mb-2.5">Para certificar te falta:</p>
            <ul className="flex flex-col gap-2">
              {datos.faltantes.map(f => (
                <li key={f.campo} className="flex gap-2.5 text-[13px]">
                  <span className="text-[#e8b568] shrink-0">○</span>
                  <span><b className="text-paper font-medium">{f.documento}</b> <span className="text-slate">— {f.porque}</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editando && (
        <div className="flex flex-col gap-3">
          <CatastroLegalSection value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} tipoActivo={tipoActivo} submitted={false} />
          <div className="flex gap-2">
            <button onClick={guardarExpediente} disabled={guardando}
              className={`${boton} bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-60`}>
              {guardando ? 'Guardando…' : 'Guardar expediente'}
            </button>
            <button onClick={() => setEditando(false)} className={`${boton} border-white/15 text-slate hover:text-paper`}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Certificación legal */}
      <div className={`p-4 md:p-5 border ${cert?.estado === 'certificada' ? 'bg-gold-500/[0.08] border-gold-500/40' : 'bg-navy-900 border-gold-500/20'}`}>
        <p className="font-plex-mono text-[10.5px] text-gold-400 uppercase tracking-[0.1em] mb-1">Certificación legal · Reporte de Transparencia</p>
        {cert && cert.estado !== 'rechazada' ? (
          <>
            <p className="text-[15px] font-medium text-paper">{cert.estado === 'certificada' ? '★ ' : ''}{ETIQUETA_CERTIFICACION[cert.estado]}</p>
            <p className="text-[12.5px] text-paper-dim mt-1">
              {cert.estado === 'en_revision' && 'Operación MindBridge está revisando el dictamen legal completo. Te avisamos al terminar.'}
              {cert.estado === 'certificada' && 'El dictamen legal está abajo y en el reporte descargable. Las propiedades certificadas dan confianza al comprador y suben el nivel del broker.'}
            </p>
          </>
        ) : (
          <>
            {cert?.estado === 'rechazada' && <p className="text-[12.5px] text-[#f3a3a3] mb-1.5">La certificación anterior no se aprobó. Revisa el expediente y vuelve a solicitarla.</p>}
            <p className="text-[13px] text-paper-dim">
              Dictamen legal completo (título, gravámenes, uso de suelo y restricciones), sello de <b className="text-paper">inventario certificado</b> y reporte descargable para el comprador.
            </p>
            <button onClick={solicitarCertificacion} disabled={!datos.listoParaCertificar || solicitando}
              className={`${boton} mt-3 bg-gold-500 border-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed`}>
              {solicitando ? 'Enviando…' : 'Solicitar certificación legal'}
            </button>
            <p className="text-[11.5px] text-slate mt-2">
              {datos.listoParaCertificar ? `Hasta ${LIMITE_CERTIFICACIONES_MES} certificaciones al mes.` : 'Completa el expediente para poder solicitarla.'}
            </p>
          </>
        )}
        {aviso && <p className="text-[12px] text-[#f3a3a3] mt-2">{aviso}</p>}
      </div>
    </div>
  )
}
