import type { IsmForm, IsmRecord, IsmStatus, SignatureStage, UserRole } from '@/types'

export const STATUS_LABELS: Record<IsmStatus, string> = {
  borrador: 'Borrador',
  por_capitan: 'Por firmar · Capitán',
  por_oficina: 'Por firmar · Persona Designada',
  archivado: 'Archivado',
}

/** Estado visible: un borrador o un "por firmar" con devolución vigente es "Devuelto". */
export function statusLabel(record: Pick<IsmRecord, 'status' | 'returnInfo'>): string {
  if (record.returnInfo && record.status !== 'archivado') return 'Devuelto'
  return STATUS_LABELS[record.status]
}

export const STATUS_ICONS: Record<IsmStatus, string> = {
  borrador: 'fa-pen-to-square',
  por_capitan: 'fa-anchor',
  por_oficina: 'fa-building',
  archivado: 'fa-box-archive',
}

export const STAGE_LABELS: Record<SignatureStage, string> = {
  tripulacion: 'Quien hace el chequeo',
  capitan: 'Capitán',
  oficina: 'Persona Designada',
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

/** Gerencia o Administración: pueden todo. */
export function isManagerRole(role: UserRole | null): boolean {
  return role === 'duena' || role === 'admin'
}

/** Id de quien creó el registro (poblado o no). */
export function creatorId(record: Pick<IsmRecord, 'createdBy'>): string {
  return typeof record.createdBy === 'object' ? record.createdBy._id : record.createdBy
}

/** Misma regla que el servidor: quién puede editar en cada etapa. */
export function canEditRecord(
  record: IsmRecord,
  role: UserRole | null,
  form: IsmForm,
  userId: string | null | undefined,
): boolean {
  if (!role || record.status === 'archivado') return false
  // Registros guiados: solo quien lo creó (la sesión del barco o el tripulante) y solo en
  // borrador, también cuando vuelve devuelto. Los demás revisan y devuelven con motivo.
  if (record.schemaVersion) return record.status === 'borrador' && Boolean(userId) && creatorId(record) === userId
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

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Partes de una fecha en hora de Galápagos (UTC−6, sin horario de verano). */
function galapagos(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mm: String(d.getUTCMinutes()).padStart(2, '0'),
  }
}

/** "29 oct 2026" (hora Galápagos). */
export function formatRecordDate(iso: string): string {
  const t = galapagos(iso)
  return `${t.d} ${MONTHS_SHORT[t.m]} ${t.y}`
}

/** "29 oct 2026 · 21:28" (hora Galápagos): así se escriben fechas y horas en pantalla. */
export function formatStamp(iso: string): string {
  const t = galapagos(iso)
  return `${t.d} ${MONTHS_SHORT[t.m]} ${t.y} · ${t.hh}:${t.mm}`
}

/** "21:28" (hora Galápagos). */
export function formatHour(iso: string): string {
  const t = galapagos(iso)
  return `${t.hh}:${t.mm}`
}

/** 'YYYY-MM-DD' (+ 'HH:MM') → "29 oct 2026 · 21:26". */
export function formatActivity(dateKey?: string, time?: string): string {
  const [y, m, d] = (dateKey ?? '').split('-').map(Number)
  if (!y || !m || !d) return '—'
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}${time ? ` · ${time}` : ''}`
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
