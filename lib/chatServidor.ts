// Piezas de servidor de los chats de entrada (Documento Maestro V10, §29.2): la llamada al modelo que
// TRADUCE un mensaje a la ficha y el freno por IP (cada mensaje cuesta una llamada).
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const MODELO = 'claude-opus-5-5'
const MAX_POR_IP_HORA = 60
const usos = new Map<string, number[]>()
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** true si esta IP todavía puede mandar mensajes esta hora (y lo cuenta). En memoria de la instancia. */
export function dentroDelFreno(req: NextRequest): boolean {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
  const ahora = Date.now()
  const recientes = (usos.get(ip) ?? []).filter((t) => ahora - t < 3600_000)
  if (recientes.length >= MAX_POR_IP_HORA) return false
  usos.set(ip, [...recientes, ahora])
  return true
}

/** El modelo devuelve la ficha completa actualizada, como JSON que cumple `schema`. */
export async function traducir(sistema: string, schema: Record<string, unknown>, contenido: string): Promise<unknown> {
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 4000,
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: contenido }],
  })
  const bloque = r.content.find((c) => c.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('sin respuesta del modelo')
  return JSON.parse(bloque.text)
}

export const textoLimpio = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const numeroLimpio = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null)
export const nulo = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
