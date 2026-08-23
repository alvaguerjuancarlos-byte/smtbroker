import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente de servidor con el service_role key — SOLO se importa desde app/api/*, nunca desde
// un archivo 'use client'. El service_role bypassa RLS y expone el Admin API (inviteUserByEmail,
// etc.) — si esta variable llega al bundle del navegador es una fuga de credenciales críticas.
//
// Se instancia perezoso (no al importar el módulo): Next.js ejecuta los route handlers durante
// "collect page data" en el build, y si SUPABASE_SERVICE_ROLE_KEY no está configurada todavía
// (ej. build local antes de agregarla a .env.local) un `createClient` a nivel de módulo tira el
// build entero. Con el factory, el error solo ocurre si de verdad se llama al endpoint sin la
// variable configurada — un 500 claro en vez de un build roto.
let client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en las variables de entorno.')
  }
  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}
