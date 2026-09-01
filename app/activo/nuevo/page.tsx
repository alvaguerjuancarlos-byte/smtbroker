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
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Topbar rol="propietario" />

      <main className="flex-1 px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[640px] mx-auto flex flex-col gap-6 md:gap-8">

          {/* Header */}
          <div>
            <button onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-[13px] text-[#8EA0BC] hover:text-[#111827] mb-4 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Volver al dashboard
            </button>
            <h1 className="text-[24px] font-black text-[#111827]">Registrar activo</h1>
            <p className="text-[14px] text-[#8EA0BC] mt-1">Ingresa los datos del inmueble para iniciar el análisis</p>
          </div>

          {/* Fase */}
          <div className="flex items-center gap-2 bg-[#FBF5E6] border border-[#EDD9A3] rounded-xl px-4 py-3">
            <span className="text-[11px] font-bold text-white bg-[#0F1F3D] px-2 py-0.5 rounded-full">Fase 01</span>
            <span className="text-[13px] text-[#0F1F3D] font-medium">Diagnóstico y Estrategia</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* Sección 1: Datos generales */}
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6 flex flex-col gap-5">
              <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Datos generales</p>

              <Field label="Nombre del activo" required error={submitted && required.nombre}>
                <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                  placeholder="Ej. Terreno Col. Providencia" className={inputCls(submitted && required.nombre)} />
              </Field>

              <Field label="Tipo de activo" required>
                <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inputCls()}>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>

            {/* Sección 2: Ubicación */}
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6 flex flex-col gap-5">
              <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Ubicación</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Calle" required error={submitted && required.calle}>
                    <input type="text" value={form.calle} onChange={e => set('calle', e.target.value)}
                      placeholder="Nombre de la calle" className={inputCls(submitted && required.calle)} />
                  </Field>
                </div>
                <Field label="Número">
                  <input type="text" value={form.numero} onChange={e => set('numero', e.target.value)}
                    placeholder="123" className={inputCls()} />
                </Field>
              </div>

              <Field label="Colonia" required error={submitted && required.colonia}>
                <input type="text" value={form.colonia} onChange={e => set('colonia', e.target.value)}
                  placeholder="Nombre de la colonia" className={inputCls(submitted && required.colonia)} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Municipio / Alcaldía" required error={submitted && required.municipio}>
                  <input type="text" value={form.municipio} onChange={e => set('municipio', e.target.value)}
                    placeholder="Ej. Guadalajara" className={inputCls(submitted && required.municipio)} />
                </Field>
                <Field label="Código postal">
                  <input type="text" value={form.cp} onChange={e => set('cp', e.target.value)}
                    placeholder="00000" maxLength={5} className={inputCls()} />
                </Field>
              </div>

              <Field label="Estado" required error={submitted && required.estado}>
                <select value={form.estado} onChange={e => set('estado', e.target.value)} className={inputCls(submitted && required.estado)}>
                  {ESTADOS_MX.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>

              {/* Botón Ver en mapa */}
              {!showMap ? (
                <button
                  type="button"
                  onClick={() => setShowMap(true)}
                  disabled={!form.municipio}
                  className="flex items-center gap-2 text-[13px] font-semibold text-[#C9A84C] hover:text-[#0F1F3D] border border-[#EDD9A3] hover:border-[#C9A84C] px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-fit"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                  </svg>
                  Verificar ubicación en mapa
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold text-[#4B5E7A] uppercase tracking-[0.1em]">Mapa</p>
                  <MapPicker
                    onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
                    initialAddress={addressForMap}
                  />
                  {lat && lng && (
                    <p className="text-[11px] text-[#C9A84C] font-semibold">✓ Ubicación confirmada en el mapa</p>
                  )}
                </div>
              )}
            </div>

            {/* Sección 2b: Identificación catastral y legal */}
            <CatastroLegalSection value={catastro} onChange={setCatastroPatch} tipoActivo={form.tipo} submitted={submitted} />

            {/* Sección 3: Características */}
            <div className="bg-white rounded-2xl border border-[#DDE3EC] p-4 md:p-6 flex flex-col gap-5">
              <p className="text-[12px] font-bold text-[#8EA0BC] uppercase tracking-[0.1em]">Características y precio</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Superficie (m²)">
                  <input type="number" value={form.superficie} onChange={e => set('superficie', e.target.value)}
                    placeholder="0" min="0" className={inputCls()} />
                </Field>
                <Field label="Precio total (MXN)">
                  <input type="number" value={form.precio_total} onChange={e => set('precio_total', e.target.value)}
                    placeholder="0" min="0" className={inputCls()} />
                </Field>
              </div>

              <Field label="Descripción / Observaciones">
                <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                  placeholder="Características relevantes, estado del inmueble, acceso, etc."
                  rows={4} className={`${inputCls()} resize-none`} />
              </Field>
            </div>

            {submitted && hasErrors && (
              <div className="flex items-start gap-2.5 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.4"/>
                  <path d="M8 5v3.5M8 10.5v.5" stroke="#DC2626" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <p className="text-[12px] text-[#991B1B]">Completa los campos obligatorios marcados en rojo antes de continuar.</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
                <p className="text-[12px] text-[#991B1B]">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || diagnosticando}
              className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-white text-[14px] font-semibold hover:bg-[#0F1F3D] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Guardando…' : 'Registrar y continuar →'}
            </button>

          </form>
        </div>
      </main>

      {diagnosticando && (
        <div className="fixed inset-0 bg-[#0F1F3D] flex items-center justify-center z-50">
          <div className="text-center">
            <span className="block w-2.5 h-2.5 rounded-full bg-[#C9A84C] mx-auto mb-4 animate-pulse" />
            <p className="text-[15px] text-white font-medium">Mastermind está coordinando al Agente Legal…</p>
            <p className="text-[12px] text-white/50 mt-1.5">Simulación — sin conexión real a catastro todavía</p>
          </div>
        </div>
      )}
    </div>
  )
}
