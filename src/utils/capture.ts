/**
 * Captura mínima (TREASURE ISM 2.0, 8-nov-2026): la persona escribe lo que
 * necesita o lo que vio, como lo diría, y el sistema arma el registro. Sin IA:
 * reglas simples que se pueden revisar y corregir en la misma pantalla.
 */
export type Intent = 'pedido' | 'novedad'

export interface SupplyLine {
  qty: string
  item: string
}

const NUMBERS: Record<string, string> = {
  un: '1', una: '1', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', quince: '15', veinte: '20',
  docena: '12', 'una docena': '12', 'media docena': '6',
}
const QTY_WORDS = `\\d+(?:[.,]\\d+)?|media docena|una docena|${Object.keys(NUMBERS).sort((a, b) => b.length - a.length).join('|')}`
const LEAD = /^\s*(?:(?:yo\s+)?(?:necesito|necesitamos|pido|pedimos|quiero|solicito|requiero|requerimos|me\s+hace\s+falta|nos\s+hace\s+falta|hace\s+falta|faltan?|pedir)\b[:\s]*)/i

/** «Necesito 2 almohadas, 1 cobija y 3 escobas» → 3 líneas con cantidad y artículo. */
export function parseSupplyList(text: string): SupplyLine[] {
  const body = text.replace(LEAD, '')
  // Se corta en comas, punto y coma, saltos de línea, y en «y/e» solo si sigue una cantidad.
  const parts = body.split(new RegExp(`[,;\\n]+|\\.\\s+|\\s+(?:y|e)\\s+(?=(?:${QTY_WORDS})\\b)`, 'i'))
  const lines: SupplyLine[] = []
  for (const raw of parts) {
    const part = (raw ?? '').trim().replace(/\.$/, '')
    if (!part) continue
    const m = part.match(new RegExp(`^(${QTY_WORDS})\\s+(?:de\\s+)?(.+)$`, 'i'))
    const qty = m ? (NUMBERS[m[1]!.toLowerCase()] ?? m[1]!.replace(',', '.')) : ''
    const item = (m ? m[2]! : part).trim()
    lines.push({ qty, item: item.charAt(0).toUpperCase() + item.slice(1) })
  }
  return lines
}

const PEDIDO_WORDS = /\b(necesit|pido|pedimos|pedir|solicit|requier|requerimos|hace falta|faltan?\b|quiero)/i
const NOVEDAD_WORDS = /\b(observ|vi\b|vimos|hay\s+(un|una|agua|aceite|humo|olor)|se\s+(rompi|cay|da[ñn]|derram|sali|qued)|derrame|fuga|accidente|golpe|herid|lesion|peligro|resbal|humo|incendio|chispa|cortocircuito|roto|rota)/i

/** Qué quiere hacer según cómo lo dice; null si no se nota (se queda lo elegido). */
export function detectIntent(text: string): Intent | null {
  const p = PEDIDO_WORDS.test(text)
  const n = NOVEDAD_WORDS.test(text)
  if (p && !n) return 'pedido'
  if (n && !p) return 'novedad'
  return null
}

/** Relato del R-09 con lugar y hora solo si se conocen (no se inventan). */
export function novedadText(relato: string, place: string, time: string): string {
  const extra = [place.trim() && `Lugar: ${place.trim()}`, time && `Hora del hecho: ${time}`].filter(Boolean).join(' · ')
  return [relato.trim(), extra].filter(Boolean).join('\n')
}
