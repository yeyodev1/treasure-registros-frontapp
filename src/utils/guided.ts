import type { IsmAnswer, IsmContext, IsmMissing, IsmSchema, IsmSchemaItem, IsmSchemaSection } from '@/types'

/** Respuesta vacía: ningún punto viene marcado por defecto. */
export function emptyAnswer(): IsmAnswer {
  return { value: null, problem: false, descripcion: '', accion: '', motivo: '', evidencia: [] }
}

export function schemaItems(schema: IsmSchema): Array<{ section: IsmSchemaSection; item: IsmSchemaItem }> {
  return schema.sections.flatMap((section) => section.items.map((item) => ({ section, item })))
}

export function hasNovedad(a: IsmAnswer | undefined): boolean {
  return Boolean(a && (a.value === 'no' || (a.value === 'si' && a.problem)))
}

/** Misma validación que corre el servidor al enviar (ism submit). */
export function validateGuided(
  schema: IsmSchema,
  answers: Record<string, IsmAnswer>,
  context: Partial<IsmContext> | null,
): IsmMissing[] {
  const missing: IsmMissing[] = []
  const need = (field: string, message: string) => missing.push({ section: 'contexto', item: '', field, message })
  if (!context?.activityDate) need('activityDate', 'Falta la fecha de la actividad')
  if (!context?.activityTime) need('activityTime', 'Falta la hora de la actividad')
  if (!context?.place?.trim()) need('place', 'Falta el lugar')
  if (!context?.filledBy?.name?.trim() || !context.filledBy.fromList) need('name', 'Elige quién hace el chequeo de la lista')
  if (!context?.filledBy?.position) need('position', 'Falta el cargo')

  for (const { section, item } of schemaItems(schema)) {
    const a = answers[item.id]
    const add = (field: string, message: string) => missing.push({ section: section.id, item: item.id, field, message })
    if (!a?.value) {
      add('value', 'Falta la respuesta')
      continue
    }
    if (a.value === 'na') {
      if (!item.allowNa) add('value', 'Este punto no admite «No aplica»')
      else if (!a.motivo?.trim()) add('motivo', 'Indica por qué no aplica')
      continue
    }
    if (hasNovedad(a)) {
      if (!a.descripcion?.trim()) add('descripcion', 'Describe la novedad')
      if (!a.accion?.trim()) add('accion', 'Indica la acción tomada')
    }
  }
  return missing
}

export function sectionProgress(section: IsmSchemaSection, answers: Record<string, IsmAnswer>) {
  const done = section.items.filter((i) => answers[i.id]?.value).length
  return { done, total: section.items.length }
}
