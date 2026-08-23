'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type AppContextType = {
  activoId: string | null
  setActivoId: (id: string | null) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [activoId, setActivoId] = useState<string | null>(null)

  return (
    <AppContext.Provider value={{ activoId, setActivoId }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
