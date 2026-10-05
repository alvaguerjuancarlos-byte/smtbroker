'use client'

// Rol real del usuario en sesión, para pantallas compartidas entre roles (las de un activo las
// usan el propietario y el broker que lo representa -- ver lib/accesoActivo.ts). Antes esas
// pantallas pasaban `rol="propietario"` fijo al Topbar, así que un broker veía la navegación de
// propietario.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { HOME_POR_ROL, type Rol } from '@/lib/roles'

export function useRolUsuario(): Rol | null {
  const [rol, setRol] = useState<Rol | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
      const r = (data as { rol: string | null } | null)?.rol
      if (vivo && r && r in HOME_POR_ROL) setRol(r as Rol)
    })
    return () => { vivo = false }
  }, [])
  return rol
}
