import type { IsmField, IsmForm } from '@/types'

/**
 * Guía para llenar un formato paso a paso (pedido del cliente, 7-nov-2026:
 * "que no parezca el PDF sino una aplicación, como el R-14"). Solo pone
 * preguntas claras sobre los mismos campos del PDF: lo que se responde se
 * guarda en esos campos, así la hoja oficial sale igual.
 */
export type GuideInput = 'text' | 'textarea' | 'date' | 'time' | 'number'

/** Dato que se ofrece con un toque. */
export type GuideFill = 'me' | 'today' | 'now' | 'vessel'

export interface GuideOption {
  field: string
  label: string
}

export interface GuideColumn {
  label: string
  input?: GuideInput
}

export type GuideItem =
  | { kind: 'text'; field: string; label: string; hint?: string; input?: GuideInput; fill?: GuideFill; suggestions?: Array<string | { value: string; label: string }> }
  /** Una sola casilla entre varias (marque con X según corresponda). */
  | { kind: 'choice'; label: string; hint?: string; options: GuideOption[] }
  /** Varias casillas independientes. */
  | { kind: 'checks'; label: string; hint?: string; options: GuideOption[] }
  /** Par de casillas SI / NO. */
  | { kind: 'yesno'; label: string; hint?: string; si: string; no: string }
  /**
   * Tabla del PDF. Con `rowLabels` las filas son fijas (cada equipo, cada día);
   * sin ellas se llenan de a una ("Agregar otra"). Cada celda es un campo
   * (texto, casilla o firma) o null si la hoja no tiene casilla ahí.
   */
  | { kind: 'table'; label: string; hint?: string; columns: GuideColumn[]; rows: Array<Array<string | null>>; rowLabels?: string[] }
  /** Cuadrícula de casillas (horas de descanso del R-23): se marcan tocando. */
  | { kind: 'grid'; label: string; hint?: string; columns: string[]; rows: Array<{ label: string; cells: Array<string | null> }> }
  | { kind: 'signature'; field: string; label: string; hint?: string }
  | { kind: 'photo'; field: string; label: string; hint?: string }
  | { kind: 'info'; text: string }

export interface GuideStep {
  title: string
  hint?: string
  items: GuideItem[]
}

export interface FillGuide {
  code: string
  intro?: string
  steps: GuideStep[]
}

/** Campos del PDF que toca un punto de la guía. */
export function itemFields(item: GuideItem): string[] {
  switch (item.kind) {
    case 'text':
    case 'signature':
    case 'photo':
      return [item.field]
    case 'choice':
    case 'checks':
      return item.options.map((o) => o.field)
    case 'yesno':
      return [item.si, item.no]
    case 'table':
      return item.rows.flat().filter((f): f is string => Boolean(f))
    case 'grid':
      return item.rows.flatMap((r) => r.cells).filter((f): f is string => Boolean(f))
    case 'info':
      return []
  }
}

export function hasValue(v: string | boolean | undefined): boolean {
  return v === true || (typeof v === 'string' && v.trim() !== '')
}

/** Un punto cuenta como respondido si tiene algo escrito, marcado o firmado. */
export function itemDone(item: GuideItem, values: Record<string, string | boolean>, signed: Set<string>): boolean {
  if (item.kind === 'info') return true
  return itemFields(item).some((f) => hasValue(values[f]) || signed.has(f))
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', como se escribe en la hoja. */
export function toSheetDate(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : key
}

/** Fecha escrita en la hoja (DD/MM/AAAA, DD-MM-AA…) → 'AAAA-MM-DD' o ''. */
export function fromSheetDate(text: string): string {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return text
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (!m) return ''
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!
  return `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

/**
 * Revisa una guía contra la definición del formato: cada campo existe, se usa
 * una sola vez y todo lo que se escribe o marca en la hoja tiene su pregunta.
 * Las firmas pueden quedar fuera (se firman en su paso). Vacío = válida.
 */
export function checkGuide(guide: FillGuide, form: Pick<IsmForm, 'code' | 'fields'>): string[] {
  const errors: string[] = []
  const byName = new Map<string, IsmField>(form.fields.map((f) => [f.name, f]))
  const seen = new Set<string>()
  if (guide.code !== form.code) errors.push(`La guía es de ${guide.code}, el formato es ${form.code}`)
  guide.steps.forEach((step, si) => {
    if (!step.title) errors.push(`Paso ${si + 1} sin título`)
    for (const item of step.items) {
      for (const name of itemFields(item)) {
        const f = byName.get(name)
        if (!f) errors.push(`«${step.title}»: el campo ${name} no existe`)
        else if (seen.has(name)) errors.push(`«${step.title}»: el campo ${name} se usa dos veces`)
        else if ((item.kind === 'choice' || item.kind === 'checks' || item.kind === 'yesno' || item.kind === 'grid') && f.type !== 'checkbox') {
          errors.push(`«${step.title}»: ${name} no es una casilla`)
        } else if (item.kind === 'text' && f.type !== 'text') errors.push(`«${step.title}»: ${name} no es un campo de texto`)
        else if (item.kind === 'signature' && f.type !== 'signature') errors.push(`«${step.title}»: ${name} no es una firma`)
        else if (item.kind === 'photo' && f.type !== 'photo') errors.push(`«${step.title}»: ${name} no es una foto`)
        seen.add(name)
      }
      if (item.kind === 'table') {
        if (item.rows.some((r) => r.length !== item.columns.length)) errors.push(`«${item.label}»: filas con distinto número de columnas`)
        if (item.rowLabels && item.rowLabels.length !== item.rows.length) errors.push(`«${item.label}»: rowLabels no coincide con las filas`)
      }
      if (item.kind === 'grid' && item.rows.some((r) => r.cells.length !== item.columns.length)) {
        errors.push(`«${item.label}»: filas con distinto número de columnas`)
      }
    }
  })
  const missing = form.fields.filter((f) => f.type !== 'signature' && !seen.has(f.name)).map((f) => f.name)
  if (missing.length) errors.push(`Campos sin pregunta: ${missing.join(', ')}`)
  return errors
}
