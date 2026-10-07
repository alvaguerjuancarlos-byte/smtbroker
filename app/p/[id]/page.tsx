import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { cargarFichaPublica } from '@/lib/fichaPublica'
import { MeInteresa } from './MeInteresa'
import { RegistrarVisita } from './RegistrarVisita'

// Página pública de una propiedad (Documento Maestro V6.3, §14.1): la que el broker comparte por
// WhatsApp, EasyBroker o sus redes. Sin sesión. Muestra solo lo publicable (lib/fichaPublica.ts):
// fotos, ficha de venta (nacida del diagnóstico), datos de mercado y el sello si está certificada,
// más el botón "Me interesa". SMTBROKER no publica en portales: la difusión la hace el broker.

export const dynamic = 'force-dynamic'

const mxn = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n) : null

export async function generateMetadata(props: PageProps<'/p/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const f = await cargarFichaPublica(getSupabaseAdmin(), id)
  if (!f) return { title: 'Propiedad no disponible · SMTBROKER' }
  return {
    title: `${f.ficha?.titular ?? f.nombre} · SMTBROKER`,
    description: `${f.tipo} en ${[f.colonia, f.municipio].filter(Boolean).join(', ')}${f.precio ? ` · ${mxn(f.precio)}` : ''}`,
    openGraph: f.fotos[0] ? { images: [f.fotos[0]] } : undefined,
  }
}

export default async function PaginaPublica(props: PageProps<'/p/[id]'>) {
  const { id } = await props.params
  const f = await cargarFichaPublica(getSupabaseAdmin(), id)
  if (!f) notFound()

  const datos = [
    ['Tipo', f.tipo],
    ['Ubicación', [f.colonia, f.municipio, f.estado].filter(Boolean).join(', ')],
    ['Terreno', f.superficie ? `${f.superficie} m²` : null],
    ['Construcción', f.superficieConstruccion ? `${f.superficieConstruccion} m²` : null],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <div className="min-h-screen bg-navy-950 text-paper font-plex-sans">
      <RegistrarVisita activoId={f.id} />
      {f.esDemo && (
        <div className="bg-white/[0.06] border-b border-white/10 px-4 py-2 text-center font-plex-mono text-[11px] text-slate uppercase tracking-wide">
          Propiedad de ejemplo · datos de demostración
        </div>
      )}
      <header className="border-b border-white/10 px-4 md:px-6 py-4">
        <div className="max-w-[920px] mx-auto flex items-center justify-between">
          <span className="font-fraunces text-[18px] text-paper">SMT<span className="text-gold-400">BROKER</span></span>
          {f.certificada && (
            <span className="font-plex-mono text-[11px] text-gold-400 border border-gold-500/50 px-3 py-1.5">★ Inventario certificado</span>
          )}
        </div>
      </header>

      <main className="max-w-[920px] mx-auto px-4 md:px-6 py-8 flex flex-col gap-8">
        <div>
          <h1 className="font-fraunces text-[28px] md:text-[36px] font-medium leading-tight">{f.ficha?.titular ?? f.nombre}</h1>
          <p className="text-[14px] text-slate mt-2">{f.tipo} · {[f.colonia, f.municipio].filter(Boolean).join(', ')}</p>
          {f.precio && <p className="font-plex-mono text-[24px] text-gold-400 mt-3">{mxn(f.precio)}</p>}
        </div>

        {f.fotos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {f.fotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- fotos de Supabase Storage, sin optimizador configurado
              <img key={url} src={url} alt={`${f.nombre} — foto ${i + 1}`}
                className={`w-full object-cover border border-white/10 ${i === 0 ? 'col-span-2 md:col-span-3 h-[260px] md:h-[380px]' : 'h-[150px] md:h-[180px]'}`} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
          <div className="flex flex-col gap-6">
            {f.ficha ? (
              <>
                {f.ficha.narrativa.split(/\n+/).map((p, i) => <p key={i} className="text-[15px] text-paper-dim leading-relaxed">{p}</p>)}
                <div>
                  <h2 className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.12em] mb-3">Puntos fuertes</h2>
                  <ul className="flex flex-col gap-2">
                    {f.ficha.puntosFuertes.map(p => <li key={p} className="text-[14px] text-paper flex gap-2.5"><span className="text-gold-400">✓</span>{p}</li>)}
                  </ul>
                </div>
                <div>
                  <h2 className="font-plex-mono text-[11px] text-slate uppercase tracking-[0.12em] mb-3">Para quien evalúa comprar</h2>
                  <ul className="flex flex-col gap-2">
                    {f.ficha.argumentosComprador.map(p => <li key={p} className="text-[14px] text-paper-dim flex gap-2.5"><span className="text-gold-400">→</span>{p}</li>)}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-[15px] text-paper-dim">{f.tipo} en {f.municipio}, {f.estado}.</p>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="bg-navy-800 border border-white/10 p-5">
              {datos.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2 border-b border-white/10 last:border-0 text-[13px]">
                  <span className="text-slate">{k}</span><span className="text-paper text-right">{v}</span>
                </div>
              ))}
            </div>
            {f.mercado && (f.mercado.comparables || f.mercado.plusvalia) && (
              <div className="bg-navy-800 border border-white/10 p-5">
                <p className="font-plex-mono text-[10.5px] text-gold-400 uppercase tracking-[0.1em] mb-2">Diagnóstico de mercado</p>
                {f.mercado.precioM2Zona && <p className="text-[13px] text-paper-dim">Precio promedio de la zona: <b className="text-paper">{mxn(f.mercado.precioM2Zona)}/m²</b></p>}
                {f.mercado.comparables ? <p className="text-[13px] text-paper-dim mt-1">Comparado con {f.mercado.comparables} propiedades reales en venta.</p> : null}
                {f.mercado.plusvalia && <p className="text-[13px] text-paper-dim mt-1">Plusvalía 3 años (SHF): {f.mercado.plusvalia}</p>}
              </div>
            )}
            <MeInteresa activoId={f.id} />
          </aside>
        </div>
      </main>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-[11.5px] text-slate">
        Diagnóstico con inteligencia artificial y datos públicos (comparables de portales, Índice SHF). SMTBROKER by MindBridge.
      </footer>
    </div>
  )
}
