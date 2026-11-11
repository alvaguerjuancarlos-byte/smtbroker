// Pruebas de la lectura de anuncios (Documento Maestro V8, opción 2).
// Uso: node --test lib/lecturaAnuncio.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloqueo, citaValida, verificarExtraccion } from './lecturaAnuncio.ts'

const SPOT2 = 'Publicado: 17/09/2026 Nave Industrial en venta de $16,470,000 MXN Carretera Apodaca - Juárez Al 800. '
  + 'Precio de venta $18,000/m² MXN. Superficie de 915 m² en Apodaca, Nuevo León. '.repeat(8)

test('bloqueos reales de los portales (10-nov-2026)', () => {
  assert.equal(detectarBloqueo('Title: Just a moment... Warning: This page maybe requiring CAPTCHA'), true)
  assert.equal(detectarBloqueo('Title: Mercado Libre Final URL: https://www.mercadolibre.com.mx/gz/account-verification?go=x'), true)
  assert.equal(detectarBloqueo('Warning: Target URL returned error 401: Unauthorized Markdown Content: Access Denied'), true)
  assert.equal(detectarBloqueo('Title: Challenge Validation'), true)
  assert.equal(detectarBloqueo(SPOT2), false)
})

test('cita: debe estar en la página y contener el número', () => {
  assert.equal(citaValida(SPOT2, 'Nave Industrial en venta de $16,470,000 MXN', 16_470_000), true)
  assert.equal(citaValida(SPOT2, 'Superficie de 915 m²', 915), true)
  assert.equal(citaValida(SPOT2, 'Nave Industrial en venta de $16,470,000 MXN', 18_000_000), false)
  assert.equal(citaValida(SPOT2, 'venta de $20,000,000 MXN', 20_000_000), false)
  assert.equal(citaValida('Precio: 16.5 millones de pesos, bodega de 1,200.5 m2 '.repeat(20), '16.5 millones', 16_500_000), true)
  assert.equal(citaValida(SPOT2, null, 915), false)
})

test('verificación: descarta lo que no se comprueba y lo que no es venta en pesos', () => {
  const r = verificarExtraccion(SPOT2, {
    titulo: 'Nave Industrial en venta', precio: 16_470_000, moneda: 'MXN', citaPrecio: 'en venta de $16,470,000 MXN',
    superficieM2: 999, citaSuperficie: 'Superficie de 999 m²', tipo: 'Bodega', municipio: 'Apodaca',
  })
  assert.equal(r.lectura, 'leido')
  assert.ok(r.lectura === 'leido' && r.datos.precio === 16_470_000 && r.datos.superficie === null)
  assert.deepEqual(r.lectura === 'leido' && r.descartados, ['superficie sin cita comprobable'])
  assert.equal(verificarExtraccion(SPOT2, { esListado: true }).lectura, 'listado')
  assert.equal(verificarExtraccion(SPOT2, { esVenta: false }).lectura, 'fallo')
  assert.equal(verificarExtraccion(SPOT2, { precio: 900_000, moneda: 'USD', citaPrecio: 'x' }).lectura, 'fallo')
})
