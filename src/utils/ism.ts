import type { IsmForm, IsmRecord, IsmStatus, SignatureStage, UserRole } from '@/types'

export const STATUS_LABELS: Record<IsmStatus, string> = {
  borrador: 'Borrador',
  por_capitan: 'Por firmar · Capitán',
  por_oficina: 'Por firmar · Oficina',
  archivado: 'Archivado',
}

export const STATUS_ICONS: Record<IsmStatus, string> = {
  borrador: 'fa-pen-to-square',
  por_capitan: 'fa-anchor',
  por_oficina: 'fa-building',
  archivado: 'fa-box-archive',
}

export const STAGE_LABELS: Record<SignatureStage, string> = {
  tripulacion: 'Quien llena',
  capitan: 'Capitán',
  oficina: 'Oficina',
}

export const FREQUENCY_LABELS: Record<string, string> = {
  evento: 'Cuando ocurre',
  por_cargo: 'Por cargo',
  por_cargo_mensual: 'Mensual por cargo',
  por_equipo: 'Mensual por equipo',
  por_salida: 'Por salida',
  semanal: 'Semanal',
  mensual: 'Mensual',
}

/** Dueña o administración: pueden todo. */
export function isManagerRole(role: UserRole | null): boolean {
  return role === 'duena' || role === 'admin'
}

/** Misma regla que el servidor: quién puede editar en cada etapa. */
export function canEditRecord(record: IsmRecord, role: UserRole | null, form: IsmForm): boolean {
  if (!role || record.status === 'archivado') return false
  // Registros guiados: las respuestas solo cambian en borrador; para corregir se devuelve.
  if (record.schemaVersion && record.status !== 'borrador') return false
  if (isManagerRole(role)) return true
  if (record.status === 'borrador') return form.officeOnly ? role === 'designada' : true
  if (record.status === 'por_capitan') return role === 'capitan'
  return role === 'designada'
}

/** Misma regla que el servidor: quién firma cada recuadro y cuándo. */
export function canSignSlot(
  record: IsmRecord,
  role: UserRole | null,
  stage: SignatureStage,
  form: IsmForm,
): boolean {
  if (!role) return false
  // La firma va atada al rol: nadie firma por el Capitán ni por la Persona Designada.
  const roleOk = stage === 'capitan' ? role === 'capitan' : stage === 'oficina' ? role === 'designada' : true
  if (!roleOk) return false
  if (stage === 'tripulacion') return record.status === 'borrador'
  if (stage === 'capitan') return record.status === 'borrador' || record.status === 'por_capitan'
  return record.status === 'por_oficina' || (form.officeOnly && record.status === 'borrador')
}

/** Hoy en Galápagos (UTC−6) como 'YYYY-MM-DD'. */
export function todayGalapagos(): string {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export function formatRecordDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Pacific/Galapagos',
  })
}

export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Pacific/Galapagos',
  })
}

/** Secciones para devolver un formato que se llena sobre la hoja. */
export const GENERIC_RETURN_SECTIONS = [
  'Encabezado y datos generales',
  'Contenido del formato',
  'Firmas',
  'Fotos o anexos',
]

/** Hora actual en Galápagos como 'HH:MM'. */
export function nowTimeGalapagos(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

export function authorName(record: IsmRecord): string {
  return typeof record.createdBy === 'object' ? record.createdBy.name : ''
}
