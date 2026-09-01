'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '../../components/Topbar'
import { MapPicker } from '../../components/MapPicker'
import { Field, inputCls } from '../../components/FormField'
import { CatastroLegalSection, type CatastroLegalValue } from '../../components/CatastroLegalSection'

const TIPOS = ['Terreno', 'Casa', 'Departamento', 'Local comercial', 'Edificio', 'Torre', 'Bodega', 'Otro']
const ESTADOS_MX = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas']

const CATASTRO_INICIAL: CatastroLegalValue = {
  clave_catastral: '',
  folio_real: '',
  estado_documentacion_legal: '',
  escritura_publica: '',
  gravamenes_conocidos: 'ninguno',
  uso_suelo_declarado: 'no_determinado',
  superficie_construccion_m2: '',
}

export default function NuevoActivoPage() {
  const router = useRouter()
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [showMap,   setShowMap]   = useState(false)
  const [lat,       setLat]       = useState<number | null>(null)
  const [lng,       setLng]       = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [diagnosticando, setDiagnosticando] = useState(false)

  const [form, setForm] = useState({
    nombre:      '',
    tipo:        'Terreno',
    calle:       '',
    numero:      '',
    colonia:     '',
    municipio:   '',
    cp:          '',
    estado:      'Jalisco',
    superficie:  '',
    precio_total: '',
    descripcion: '',
  })
  const [catastro, setCatastro] = useState<CatastroLegalValue>(CATASTRO_INICIAL)
  const setCatastroPatch = (patch: Partial<CatastroLegalValue>) => setCatastro(c => ({ ...c, ...patch }))

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const addressForMap = [form.calle, form.numero, form.colonia, form.municipio, form.estado, 'México']
    .filter(Boolean).join(', ')

  const required = {
    nombre:    !form.nombre.trim(),
    calle:     !form.calle.trim(),
    colonia:   !form.colonia.trim(),
    municipio: !form.municipio.trim(),
    estado:    !form.estado.trim(),
    estado_documentacion_legal: !catastro.estado_documentacion_legal,
  }
  const hasErrors = Object.values(required).some(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors) return
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const direccion = [form.calle, form.numero].filter(Boolean).join(' ')

    const { data, error: err } = await supabase
      .from('activos')
      .insert({
        usuario_id:   user.id,
        nombre:       form.nombre,
        tipo:         form.tipo,
        direccion:    direccion,
        colonia:      form.colonia,
        municipio:    form.municipio,
        cp:           form.cp,
        estado:       form.estado,
        superficie:   form.superficie   ? parseFloat(form.superficie)   : null,
        precio_total: form.precio_total ? parseFloat(form.precio_total) : null,
        descripcion:  form.descripcion,
        lat,
        lng,
        status: 'ingresado',
        clave_catastral:              catastro.clave_catastral || null,
        folio_real:                   catastro.folio_real || null,
        estado_documentacion_legal:   catastro.estado_documentacion_legal || null,
        escritura_publica:            catastro.escritura_publica || null,
        gravamenes_conocidos:         catastro.gravamenes_conocidos,
        uso_suelo_declarado:          catastro.uso_suelo_declarado,
        superficie_construccion_m2:   catastro.superficie_construccion_m2 ? parseFloat(catastro.superficie_construccion_m2) : null,
      })
      .select('id')
      .single()

    if (err) {
      setError('Error al guardar el activo. Intenta de nuevo.')
      setLoading(false)
      return
    }

    // Transición breve — guiño al paso "Diagnóstico (90s)" del prototipo, sin construir una
    // ruta/paso separado (ver plan). El diagnóstico real (mock, por ahora) vive en /activo/[id].
    setLoading(false)
    setDiagnosticando(true)
    setTimeout(() => router.push(`/activo/${data.id}`), 1400)
  }

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans flex flex-col relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(244,240,230,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,230,0.12) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="relative flex flex-col flex-1">
      <Topbar rol="propietario" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Header */}
          <div>
            <button onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-[13px] text-slate hover:text-paper mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Volver al dashboard
            </button>
            <h1 className="font-fraunces text-[26px] font-medium text-paper">Registrar activo</h1>
            <p className="text-[14px] text-slate mt-1.5">Ingresa los datos del inmueble para iniciar el análisis</p>
          </div>

          {/* Fase */}
          <div className="flex items-center gap-2 bg-gold-500/[0.06] border-l-2 border-gold-500 px-4 py-3">
            <span className="font-plex-mono text-[10.5px] font-medium text-navy-950 bg-gold-500 px-2 py-0.5">Fase 01</span>
            <span className="text-[13px] text-paper-dim font-medium">Diagnóstico y Estrategia</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* Sección 1: Datos generales */}
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6 flex flex-col gap-5">
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Datos generales</p>

              <Field label="Nombre del activo" required error={submitted && required.nombre}>
                <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                  placeholder="Ej. Terreno Col. Providencia" className={inputCls(submitted && required.nombre, 'oscuro')} />
              </Field>

              <Field label="Tipo de activo" required>
                <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inputCls(false, 'oscuro')}>
                  {TIPOS.map(t => <option key={t} className="bg-navy-900">{t}</option>)}
                </select>
              </Field>
            </div>

            {/* Sección 2: Ubicación */}
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6 flex flex-col gap-5">
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Ubicación</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Calle" required error={submitted && required.calle}>
                    <input type="text" value={form.calle} onChange={e => set('calle', e.target.value)}
                      placeholder="Nombre de la calle" className={inputCls(submitted && required.calle, 'oscuro')} />
                  </Field>
                </div>
                <Field label="Número">
                  <input type="text" value={form.numero} onChange={e => set('numero', e.target.value)}
                    placeholder="123" className={inputCls(false, 'oscuro')} />
                </Field>
              </div>

              <Field label="Colonia" required error={submitted && required.colonia}>
                <input type="text" value={form.colonia} onChange={e => set('colonia', e.target.value)}
                  placeholder="Nombre de la colonia" className={inputCls(submitted && required.colonia, 'oscuro')} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Municipio / Alcaldía" required error={submitted && required.municipio}>
                  <input type="text" value={form.municipio} onChange={e => set('municipio', e.target.value)}
                    placeholder="Ej. Guadalajara" className={inputCls(submitted && required.municipio, 'oscuro')} />
                </Field>
                <Field label="Código postal">
                  <input type="text" value={form.cp} onChange={e => set('cp', e.target.value)}
                    placeholder="00000" maxLength={5} className={inputCls(false, 'oscuro')} />
                </Field>
              </div>

              <Field label="Estado" required error={submitted && required.estado}>
                <select value={form.estado} onChange={e => set('estado', e.target.value)} className={inputCls(submitted && required.estado, 'oscuro')}>
                  {ESTADOS_MX.map(s => <option key={s} className="bg-navy-900">{s}</option>)}
                </select>
              </Field>

              {/* Botón Ver en mapa */}
              {!showMap ? (
                <button
                  type="button"
                  onClick={() => setShowMap(true)}
                  disabled={!form.municipio}
                  className="flex items-center gap-2 font-plex-mono text-[12px] text-gold-400 hover:text-gold-100 border border-gold-500/40 hover:border-gold-500 px-4 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-fit"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                  </svg>
                  Verificar ubicación en mapa
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="font-plex-mono text-[10.5px] text-slate uppercase tracking-[0.1em]">Mapa</p>
                  <MapPicker
                    onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
                    initialAddress={addressForMap}
                  />
                  {lat && lng && (
                    <p className="text-[11px] text-gold-400 font-medium">✓ Ubicación confirmada en el mapa</p>
                  )}
                </div>
              )}
            </div>

            {/* Sección 2b: Identificación catastral y legal */}
            <CatastroLegalSection value={catastro} onChange={setCatastroPatch} tipoActivo={form.tipo} submitted={submitted} />

            {/* Sección 3: Características */}
            <div className="bg-navy-800 border border-white/10 p-4 md:p-6 flex flex-col gap-5">
              <p className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.1em]">Características y precio</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Superficie (m²)">
                  <input type="number" value={form.superficie} onChange={e => set('superficie', e.target.value)}
                    placeholder="0" min="0" className={inputCls(false, 'oscuro')} />
                </Field>
                <Field label="Precio total (MXN)">
                  <input type="number" value={form.precio_total} onChange={e => set('precio_total', e.target.value)}
                    placeholder="0" min="0" className={inputCls(false, 'oscuro')} />
                </Field>
              </div>

              <Field label="Descripción / Observaciones">
                <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                  placeholder="Características relevantes, estado del inmueble, acceso, etc."
                  rows={4} className={`${inputCls(false, 'oscuro')} resize-none`} />
              </Field>
            </div>

            {submitted && hasErrors && (
              <div className="flex items-start gap-2.5 bg-red-950/20 border border-red-900/60 px-4 py-3">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="8" cy="8" r="7" stroke="#f3a3a3" strokeWidth="1.4"/>
                  <path d="M8 5v3.5M8 10.5v.5" stroke="#f3a3a3" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <p className="text-[12px] text-[#f3a3a3]">Completa los campos obligatorios marcados en rojo antes de continuar.</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/60 px-4 py-3">
                <p className="text-[12px] text-[#f3a3a3]">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || diagnosticando}
              className="w-full py-3.5 bg-gold-500 text-navy-950 font-plex-mono text-[13px] tracking-[0.03em] hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Guardando…' : 'Registrar y continuar →'}
            </button>

          </form>
        </div>
      </main>
      </div>

      {diagnosticando && (
        <div className="fixed inset-0 bg-navy-950 flex items-center justify-center z-50">
          <div className="text-center">
            <span className="block w-2.5 h-2.5 rounded-full bg-gold-500 mx-auto mb-4 animate-pulse" />
            <p className="text-[15px] text-paper font-medium">Mastermind está coordinando al Agente Legal…</p>
            <p className="text-[12px] text-slate mt-1.5 font-plex-mono">Simulación — sin conexión real a catastro todavía</p>
          </div>
        </div>
      )}
    </div>
  )
}
