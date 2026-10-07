'use client'

// Cuenta UNA visita por sesión del navegador a la página pública (app/api/publico/visita). Si el
// almacenamiento de sesión no está disponible, igual cuenta una vez por carga de página.
import { useEffect } from 'react'

export function RegistrarVisita({ activoId }: { activoId: string }) {
  useEffect(() => {
    const clave = `smt-visita-${activoId}`
    try {
      if (sessionStorage.getItem(clave)) return
      sessionStorage.setItem(clave, '1')
    } catch { /* sin sessionStorage: se cuenta igual */ }
    fetch('/api/publico/visita', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activoId }),
    }).catch(() => {})
  }, [activoId])
  return null
}
