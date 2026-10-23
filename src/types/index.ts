export type UserRole =
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
  image?: string
  signedAt: string
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
  history?: Array<{ action: string; byName: string; at: string; reason: string }>
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
  counts: Record<IsmStatus | 'misBorradores', number>
  checklist: IsmChecklistItem[]
}
