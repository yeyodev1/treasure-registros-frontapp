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
  /** Tarjeta de Mis tareas (sale del esquema guiado). */
  card?: IsmCard
}

/** Tarjeta y textos de inicio de un formato guiado (plantilla). */
export interface IsmCard {
  title: string
  text: string
  icon: string
  newLabel?: string
  resumeTitle?: string
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
  /** Cargo en el momento de firmar. */
  position?: string
  /** Sesión de la tablet con que se capturó (si no es quien firma). */
  capturedByName?: string
  method?: string
}

export interface IsmAnnulledSignature extends IsmSignature {
  annulledAt: string
  annulReason: string
}

export interface CrewMember {
  id: string
  name: string
  role: UserRole
  position: string
  positionLabel: string
  active: boolean
  hasAccount: boolean
  /** Cuenta compartida (tablet del barco): no es una persona, no hace chequeos ni firma. */
  sharedDevice?: boolean
  onboard: boolean
  hasPin: boolean
  pinTemporary: boolean
  lockedUntil: string | null
}

export interface IsmNotice {
  _id: string
  kind: string
  title: string
  body: string
  record: string | null
  link: string
  readAt: string | null
  createdAt: string
}

export interface IsmSigner {
  step: SignatureStage
  /** Rol libre de quien firma, o 'lista' (se elige de la lista de tripulantes). */
  who: string
  label: string
  field: string
  print: 'anexo' | 'casilla'
  status: 'borrador' | 'por_capitan' | 'por_oficina'
  next: 'por_capitan' | 'por_oficina' | 'archivado'
  returnsTo: SignatureStage | null
  /** Mismo orden = firmas en paralelo. */
  order?: number
  /** Número de firmantes del paso. */
  signers?: number
}

export type AnswerValue = 'si' | 'no' | 'na'

export interface IsmAnswer {
  value: AnswerValue | null
  problem: boolean
  descripcion: string
  accion: string
  motivo: string
  evidencia: string[]
  /** Seguimiento de la novedad: quién la resuelve, para cuándo y si quedó cerrada. */
  responsable?: string
  plazo?: string
  estado?: '' | 'abierta' | 'cerrada'
  at?: string | null
  /** Hora de la tablet al responder (ISO). */
  deviceAt?: string | null
}

export interface IsmContext {
  vessel: string
  activityDate: string
  activityTime: string
  place: string
  filledBy: {
    user: string
    accountName: string
    name: string
    role: string
    position: string
    /** Elegido de la lista de tripulantes. */
    fromList?: boolean
    /** El cargo vino de su ficha. */
    positionFixed?: boolean
  }
  /** Hora de cada sección ('HH:MM'). */
  sectionTimes?: Record<string, string>
  confirmedAt: string | null
}

export interface IsmFlags {
  answered: number
  total: number
  novedades: number
  noAplica: number
  /** Marca de novedad: al menos un "No". */
  hasNovedad?: boolean
}

export interface IsmReturnInfo {
  reason: string
  section: string
  byName: string
  at: string
  /** A qué paso se devolvió (tripulacion o capitan). */
  toStage?: SignatureStage
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
  archiveFolder?: string
  signers?: IsmSigner[]
  card?: IsmCard
  fileNamePattern?: string
  uniqueness?: { by: 'fileName'; onConflict: 'suffix' | 'reject' }
  answerTypes?: AnswerValue[]
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
  annulledSignatures?: IsmAnnulledSignature[]
  position: string
  equipment: { folder: string; name: string; category: string } | null
  createdBy: { _id: string; name: string; role: UserRole } | string
  submittedAt: string | null
  archivedAt: string | null
  /** Carpeta del archivo con el mes de la actividad (calculada en el servidor). */
  archivePath?: string
  /** PDF congelado al archivar: siempre se sirve el mismo archivo (sha256). */
  archivedPdf?: { sha256: string; size: number; generatedAt: string } | null
  contentHash: string
  history?: Array<{ action: string; byName: string; at: string; reason: string; section?: string }>
  schemaVersion?: number | null
  context?: IsmContext | null
  answers?: Record<string, IsmAnswer>
  flags?: IsmFlags | null
  returnInfo?: IsmReturnInfo | null
  /** Edición del formato oficial con que se llenó. */
  formEdition?: string
  /** Registro de prueba: fuera de indicadores y avisos. */
  test?: boolean
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
