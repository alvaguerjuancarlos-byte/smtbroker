// Pruebas del registro de búsqueda (guion v12, momento 3). Uso: node --test lib/registroBusqueda.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuenteDeUrl, resumirRegistro, lineaRegistro, esLigaDelBuscador, type ItemRegistro } from './registroBusqueda.ts'

const item = (x: Partial<ItemRegistro>): ItemRegistro => ({ revision: 'portal', fuente: 'inmuebles24', titulo: 't', url: null, precio: null, m2: null, zona: 0, resultado: 'mostrada', razon: null, ...x })

test('registro: nombre de la fuente por su liga', () => {
  assert.equal(fuenteDeUrl('https://www.inmuebles24.com/departamentos-en-renta.html'), 'inmuebles24')
  assert.equal(fuenteDeUrl('https://inmuebles.mercadolibre.com.mx/x'), 'Mercado Libre')
  assert.equal(fuenteDeUrl('https://www.avisosdeocasion.com/Detalle/BienesRaices?Aviso=1'), 'Avisos de Ocasión')
  assert.equal(fuenteDeUrl('https://www.ejemplo.mx/casa'), 'ejemplo.mx')
  assert.equal(fuenteDeUrl('no es liga'), 'otro sitio')
})

test('registro: resumen sin contar dos veces la misma liga', () => {
  const items = [
    item({ revision: 'plataforma', fuente: 'SMT Match', titulo: 'Depa A', resultado: 'mostrada' }),
    item({ revision: 'plataforma', fuente: 'SMT Match', titulo: 'Depa B', resultado: 'descartada', razon: 'fuera del presupuesto' }),
    item({ url: 'https://inmuebles24.com/1', resultado: 'mostrada' }),
    item({ revision: 'comparable', url: 'https://inmuebles24.com/1', resultado: 'referencia' }),
    item({ fuente: 'ejemplo.mx', url: 'https://ejemplo.mx/2', resultado: 'descartada', razon: 'no es un portal' }),
  ]
  const r = resumirRegistro(items)
  assert.equal(r.revisadas, 4)
  assert.equal(r.fuentes, 3)
  assert.equal(r.cumplen, 2)
  assert.equal(r.nombresFuentes[0], 'SMT Match')
})

test('registro: la línea del tablero', () => {
  assert.equal(lineaRegistro({ revisadas: 29, fuentes: 13, cumplen: 8 }), 'Revisamos 29 propiedades y anuncios en 13 fuentes. Te mostramos las 8 que coinciden con lo que pides.')
  assert.equal(lineaRegistro({ revisadas: 1, fuentes: 1, cumplen: 1 }), 'Revisamos 1 propiedad y anuncio en 1 fuente. Te mostramos la que coincide con lo que pides.')
  assert.match(lineaRegistro({ revisadas: 40, fuentes: 5, cumplen: 0 }), /Ninguna coincide todavía/)
  assert.equal(fuenteDeUrl('https://www.monopolio.com.mx/renta/departamentos'), 'Monopolio')
})

test('registro: la clasificación de comparables coincide con el cálculo del precio', async () => {
  const { calcularPrecioMercado, clasificarComparables } = await import('./precioMercado.ts')
  const c = (m2: number | null, total: number | null, sup: number | null) => ({ precioM2: m2, precioTotal: total, superficieM2: sup })
  const lista = [c(null, 5_000_000, 100), c(52_000, null, 110), c(null, 6_000_000, 120), c(49_000, null, null), c(null, null, 90),
    c(48_000, null, 400), c(300_000, null, 100), c(55_000, null, 95), c(51_000, null, 105)]
  for (const sup of [100, null]) {
    const pm = calcularPrecioMercado(lista, sup, null)
    const cl = clasificarComparables(lista, sup)
    assert.equal(cl.filter((x) => x.uso === 'usado').length, pm.comparablesUsados, `superficie ${sup}`)
    assert.equal(cl.find((x) => x.comparable === lista[4])?.uso, 'sin_precio')
    assert.equal(cl.find((x) => x.comparable === lista[6])?.uso, 'atipico')
  }
  assert.equal(clasificarComparables(lista, 100).find((x) => x.comparable === lista[5])?.uso, 'otro_tamano')
})

test('registro: las ligas de redirección del buscador no cuentan', () => {
  assert.ok(esLigaDelBuscador('https://www.google.com/goto?url=CAES'))
  assert.ok(esLigaDelBuscador('https://google.com/x'))
  assert.ok(!esLigaDelBuscador('https://www.inmuebles24.com/x'))
  assert.ok(!esLigaDelBuscador('https://www.facebook.com/marketplace/item/1'))
})
