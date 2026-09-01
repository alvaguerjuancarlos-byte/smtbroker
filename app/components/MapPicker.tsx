'use client'

import { useRef, useEffect, useState } from 'react'

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return
    if ((window as any).google?.maps?.places) { resolve(); return }
    const existing = document.getElementById('gmap-script')
    if (existing) { existing.addEventListener('load', () => resolve()); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
    const script = document.createElement('script')
    script.id = 'gmap-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Error cargando Google Maps'))
    document.head.appendChild(script)
  })
}

const MEXICO_CENTER = { lat: 23.6345, lng: -102.5528 }

export function MapPicker({
  onLocationChange,
  initialAddress,
}: {
  onLocationChange: (lat: number, lng: number) => void
  initialAddress?: string
}) {
  const mapRef    = useRef<HTMLDivElement>(null)
  const mapObj    = useRef<google.maps.Map | null>(null)
  const marker    = useRef<google.maps.Marker | null>(null)
  const [ready,   setReady]   = useState(false)
  const [pos,     setPos]     = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadGoogleMaps().then(() => setReady(true)).catch(console.error)
  }, [])

  useEffect(() => {
    if (!ready || !mapRef.current) return

    mapObj.current = new google.maps.Map(mapRef.current, {
      center: MEXICO_CENTER,
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    })

    marker.current = new google.maps.Marker({
      map: mapObj.current,
      draggable: true,
      visible: false,
    })

    marker.current.addListener('dragend', () => {
      const p = marker.current!.getPosition()
      if (p) {
        const coords = { lat: p.lat(), lng: p.lng() }
        setPos(coords)
        onLocationChange(coords.lat, coords.lng)
      }
    })

    if (initialAddress) geocode(initialAddress)
  }, [ready])

  const geocode = (address: string) => {
    if (!mapObj.current || !marker.current) return
    setLoading(true)
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ address, region: 'MX' }, (results, status) => {
      setLoading(false)
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location
        const coords = { lat: loc.lat(), lng: loc.lng() }
        mapObj.current!.setCenter(coords)
        mapObj.current!.setZoom(16)
        marker.current!.setPosition(coords)
        marker.current!.setVisible(true)
        setPos(coords)
        onLocationChange(coords.lat, coords.lng)
      }
    })
  }

  if (!ready) {
    return (
      <div className="w-full border border-white/10 bg-navy-950/60 flex items-center justify-center" style={{ height: 260 }}>
        <p className="text-[13px] text-slate font-plex-mono">Cargando mapa…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar dirección en el mapa…"
          id="map-search-input"
          className="flex-1 px-4 py-2.5 border border-white/15 bg-navy-950/60 text-[14px] text-paper placeholder-slate-dim focus:outline-none focus:border-gold-500 transition-colors"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); geocode((e.target as HTMLInputElement).value) } }}
        />
        <button
          type="button"
          onClick={() => { const el = document.getElementById('map-search-input') as HTMLInputElement; if (el?.value) geocode(el.value) }}
          disabled={loading}
          className="px-4 py-2.5 bg-gold-500 text-navy-950 font-plex-mono text-[12px] hover:bg-gold-400 transition-colors disabled:opacity-60"
        >
          {loading ? '…' : 'Buscar'}
        </button>
      </div>
      <div className="relative w-full overflow-hidden border border-white/10" style={{ height: 260 }}>
        <div ref={mapRef} className="w-full h-full" />
        {pos && (
          <div className="absolute bottom-3 left-3 bg-navy-900 border border-white/15 px-3 py-1.5">
            <p className="text-[10px] text-paper-dim font-plex-mono">{pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}</p>
          </div>
        )}
      </div>
      {!pos && <p className="text-[11px] text-slate">Busca la dirección o arrastra el marcador para confirmar la ubicación exacta.</p>}
    </div>
  )
}

export function MapView({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadGoogleMaps().then(() => setReady(true)).catch(console.error)
  }, [])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const center = { lat, lng }
    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    })
    new google.maps.Marker({ position: center, map, title: label || 'Activo' })
  }, [ready, lat, lng])

  if (!ready) {
    return (
      <div className="w-full border border-white/10 bg-navy-950/60 flex items-center justify-center" style={{ height: 260 }}>
        <p className="text-[13px] text-slate font-plex-mono">Cargando mapa…</p>
      </div>
    )
  }

  return <div ref={mapRef} className="w-full overflow-hidden border border-white/10" style={{ height: 260 }} />
}
