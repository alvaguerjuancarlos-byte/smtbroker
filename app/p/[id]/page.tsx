import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { cargarFichaPublica } from '@/lib/fichaPublica'
import { MeInteresa } from './MeInteresa'
import { RegistrarVisita } from './RegistrarVisita'
import { Marca } from '@/app/components/Marca'

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
  if (!f) return { title: 'Propiedad no disponible · Ciertix' }
  return {
    title: `${f.ficha?.titular ?? f.nombre} · Ciertix`,
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
    <div className="min-h-screen bg-fondo text-tinta font-sans">
      <RegistrarVisita activoId={f.id} />
      {f.esDemo && (
        <div className="bg-sutil border-b border-linea px-4 py-2 text-center font-sans text-[14px] text-tenue">
          Propiedad de ejemplo · datos de demostración
        </div>
      )}
      <header className="border-b border-linea px-4 md:px-6 py-4">
        <div className="max-w-[920px] mx-auto flex items-center justify-between">
          <Marca texto={20} />
          {f.certificada && (
            <span className="font-sans text-[14px] text-acento border border-gold-500/50 px-3 py-1.5 rounded-lg">★ Inventario certificado</span>
          )}
        </div>
      </header>

      <main className="max-w-[920px] mx-auto px-4 md:px-6 py-8 flex flex-col gap-8">
        <div>
          <h1 className="font-display text-[32px] md:text-[42px] font-medium leading-tight">{f.ficha?.titular ?? f.nombre}</h1>
          <p className="text-[17px] text-tenue mt-2">{f.tipo} · {[f.colonia, f.municipio].filter(Boolean).join(', ')}</p>
          {f.precio && <p className="font-sans text-[28px] text-acento mt-3">{mxn(f.precio)}</p>}
        </div>

        {f.fotos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {f.fotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- fotos de Supabase Storage, sin optimizador configurado
              <img key={url} src={url} alt={`${f.nombre} — foto ${i + 1}`}
                className={`w-full object-cover border border-linea ${i === 0 ? 'col-span-2 md:col-span-3 h-[260px] md:h-[380px]' : 'h-[150px] md:h-[180px]'}`} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
          <div className="flex flex-col gap-6">
            {f.ficha ? (
              <>
                {f.ficha.narrativa.split(/\n+/).map((p, i) => <p key={i} className="text-[18px] text-tinta-2 leading-relaxed">{p}</p>)}
                <div>
                  <h2 className="font-sans text-[14px] text-tenue mb-3">Puntos fuertes</h2>
                  <ul className="flex flex-col gap-2">
                    {f.ficha.puntosFuertes.map(p => <li key={p} className="text-[17px] text-tinta flex gap-2.5"><span className="text-acento">✓</span>{p}</li>)}
                  </ul>
                </div>
                <div>
                  <h2 className="font-sans text-[14px] text-tenue mb-3">Para quien evalúa comprar</h2>
                  <ul className="flex flex-col gap-2">
                    {f.ficha.argumentosComprador.map(p => <li key={p} className="text-[17px] text-tinta-2 flex gap-2.5"><span className="text-acento">→</span>{p}</li>)}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-[18px] text-tinta-2">{f.tipo} en {f.municipio}, {f.estado}.</p>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="bg-tarjeta border border-linea p-5 rounded-xl">
              {datos.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2 border-b border-linea last:border-0 text-[16px]">
                  <span className="text-tenue">{k}</span><span className="text-tinta text-right">{v}</span>
                </div>
              ))}
            </div>
            {f.mercado && (f.mercado.comparables || f.mercado.plusvalia) && (
              <div className="bg-tarjeta border border-linea p-5 rounded-xl">
                <p className="font-sans text-[13px] text-acento mb-2">Diagnóstico de mercado</p>
                {f.mercado.precioM2Zona && <p className="text-[16px] text-tinta-2">Precio promedio de la zona: <b className="text-tinta">{mxn(f.mercado.precioM2Zona)}/m²</b></p>}
                {f.mercado.comparables ? <p className="text-[16px] text-tinta-2 mt-1">Comparado con {f.mercado.comparables} propiedades reales en venta.</p> : null}
                {f.mercado.plusvalia && <p className="text-[16px] text-tinta-2 mt-1">Plusvalía 3 años (SHF): {f.mercado.plusvalia}</p>}
              </div>
            )}
            <MeInteresa activoId={f.id} />
          </aside>
        </div>
      </main>

      <footer className="border-t border-linea px-4 py-6 text-center text-[14px] text-tenue">
        Diagnóstico con inteligencia artificial y datos públicos (comparables de portales, Índice SHF). Ciertix by MindBridge.
      </footer>
    </div>
  )
}
