export type UserRole =
  | 'duena'
  | 'admin'
  | 'direccion'
  | 'bartender'
  | 'bodega'
  | 'capitan'
  | 'tripulante'
  | 'designada'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  position?: string
}

export type SignatureStage = 'tripulacion' | 'capitan' | 'oficina'
export type IsmStatus = 'borrador' | 'por_capitan' | 'por_oficina' | 'archivado'

export interface IsmField {
  name: string
  page: number
  x: number
  y: number
  w: number
  h: number
  type: 'text' | 'checkbox' | 'radio' | 'signature' | 'photo'
  multiline?: boolean
  fontSize?: number
  default?: string | boolean
  /** Dato conocido (p. ej. caducidad del R-28): se muestra como referencia, no es respuesta. */
  reference?: string
  maxLength?: number
  stage?: SignatureStage
  label?: string
}

export interface IsmForm {
  code: string
  title: string
  group: string
  frequency: string
  officeOnly: boolean
  stages: Record<SignatureStage, number>
  pages: Array<{ width: number; height: number }>
  fields: IsmField[]
}

export interface IsmCatalogItem {
  code: string
  title: string
  group: string
  frequency: string
  officeOnly: boolean
  pages: number
  fieldCount: number
  stages: Record<SignatureStage, number>
  /** Versión del llenado guiado (R-14), o null si se llena sobre la hoja. */
  guidedVersion?: number | null
}

export interface IsmEquipment {
  category: string
  folder: string
  name: string
  brand: string
  model: string
  serial: string
  owner: string
}

export interface IsmSignature {
  field: string
  stage: SignatureStage
  label: string
  signerName: string
  user: string
  userName: string
  userRole: string
  signedAt: string
  /** false si los datos cambiaron después de firmar: hay que volver a firmar. */
  valid?: boolean
}

export type AnswerValue = 'si' | 'no' | 'na'

export interface IsmAnswer {
  value: AnswerValue | null
  problem: boolean
  descripcion: string
  accion: string
  motivo: string
  evidencia: string[]
  at?: string | null
}

export interface IsmContext {
  vessel: string
  activityDate: string
  activityTime: string
  place: string
  filledBy: { user: string; accountName: string; name: string; role: string; position: string }
  confirmedAt: string | null
}

export interface IsmFlags {
  answered: number
  total: number
  novedades: number
  noAplica: number
}

export interface IsmReturnInfo {
  reason: string
  section: string
  byName: string
  at: string
}

export interface IsmSchemaItem {
  id: string
  n: string
  official: string
  prompt: string
  si: string
  no: string
  allowNa: boolean
}

export interface IsmSchemaSection {
  id: string
  title: string
  officialTitle: string
  hint?: string
  items: IsmSchemaItem[]
}

export interface IsmSchema {
  code: string
  version: number
  title: string
  officialTitle: string
  templateEdition: string
  vessel: string
  notice: string
  context: Record<
    'activityDate' | 'activityTime' | 'place',
    { label: string; pdfField: string; required: boolean; suggestions?: string[] }
  >
  sections: IsmSchemaSection[]
}

export interface IsmMissing {
  section: string
  item: string
  field: string
  message: string
}

export interface IsmRecord {
  _id: string
  code: string
  title: string
  status: IsmStatus
  recordDate: string
  fileName: string
  data?: Record<string, string | boolean>
  signatures: IsmSignature[]
  position: string
  equipment: { folder: string; name: string; category: string } | null
  createdBy: { _id: string; name: string; role: UserRole } | string
  submittedAt: string | null
  archivedAt: string | null
  contentHash: string
  history?: Array<{ action: string; byName: string; at: string; reason: string; section?: string }>
  schemaVersion?: number | null
  context?: IsmContext | null
  answers?: Record<string, IsmAnswer>
  flags?: IsmFlags | null
  returnInfo?: IsmReturnInfo | null
  createdAt: string
  updatedAt: string
}

export interface IsmChecklistItem {
  code: string
  title: string
  done: boolean
  progress?: { done: number; total: number }
  missing?: string[]
}

export interface IsmSummary {
  month: { y: number; m: number }
  counts: Record<IsmStatus | 'misBorradores' | 'misDevueltos', number>
  checklist: IsmChecklistItem[]
}
