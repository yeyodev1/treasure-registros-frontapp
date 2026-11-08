/**
 * Revisa las reglas de la captura mínima (sin dependencias):
 *   node scripts/check-capture.ts
 */
import assert from 'node:assert/strict'
import { detectIntent, novedadText, parseSupplyList } from '../src/utils/capture.ts'

assert.deepEqual(parseSupplyList('Necesito 2 almohadas, 1 cobija y 3 escobas'), [
  { qty: '2', item: 'Almohadas' },
  { qty: '1', item: 'Cobija' },
  { qty: '3', item: 'Escobas' },
])
assert.deepEqual(parseSupplyList('dos cajas de guantes y una docena de toallas'), [
  { qty: '2', item: 'Cajas de guantes' },
  { qty: '12', item: 'Toallas' },
])
// «y» sin cantidad detrás no corta: es parte del artículo.
assert.deepEqual(parseSupplyList('4 sal y pimienta\nfiltro de aceite'), [
  { qty: '4', item: 'Sal y pimienta' },
  { qty: '', item: 'Filtro de aceite' },
])
assert.deepEqual(parseSupplyList('   '), [])
assert.equal(detectIntent('Necesito 2 almohadas'), 'pedido')
assert.equal(detectIntent('Observé líquido en el pasillo'), 'novedad')
assert.equal(detectIntent('Se rompió la bomba'), 'novedad')
assert.equal(detectIntent('almohadas'), null)
assert.equal(novedadText('Observé agua. ', '', ''), 'Observé agua.')
assert.equal(novedadText('Observé agua.', 'Pasillo', '10:30'), 'Observé agua.\nLugar: Pasillo · Hora del hecho: 10:30')
console.log('captura OK')

// Datos conocidos: solo en los pasos de quien crea y con «Soy yo» donde la hoja lo pide.
const { autoFillValues } = await import('../src/utils/fillGuide.ts')
const fs = await import('node:fs')
const guide = (code: string) => JSON.parse(fs.readFileSync(new URL(`../src/guides/${code}.json`, import.meta.url), 'utf8'))
const known = { me: 'Lucía Gómez', today: '2026-11-08', vessel: 'Treasure of Galápagos' }
assert.deepEqual(autoFillValues(guide('R-18_Hoteleria'), known), {
  'Text Field 1': 'Hotelería', 'Text Field 2': '08/11/2026', 'Text Field 35': 'Lucía Gómez', 'Text Field 36': '08/11/2026',
})
assert.deepEqual(autoFillValues(guide('R-09'), known), { Nombre_Reporta: 'Lucía Gómez', Fecha_Reporte: '08/11/2026' })
const r06 = autoFillValues(guide('R-06'), known)
assert.equal(r06['Text Field 12'], undefined, 'la fecha del Capitán no se pone sola')
assert.equal(r06['Text Field 19'], 'Treasure of Galápagos')
assert.equal(autoFillValues(guide('R-23'), known)['Text Field 1013'], undefined, 'el marino puede ser otro')
console.log('datos conocidos OK')
