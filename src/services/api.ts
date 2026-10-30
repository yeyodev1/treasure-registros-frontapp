import { http } from './httpBase'
import type {
  IsmAnswer,
  IsmCatalogItem,
  IsmContext,
  IsmEquipment,
  IsmFlags,
  IsmForm,
  IsmRecord,
  IsmSchema,
  IsmSignature,
  IsmSummary,
  SessionUser,
  CrewMember,
  IsmNotice,
} from '@/types'

export async function apiLogin(email: string, password: string, remember: boolean) {
  const { data } = await http.post<{ token: string; user: SessionUser }>('/auth/login', {
    email,
    password,
    remember,
  })
  return data
}

/** Sesión deslizante: nuevo token con la misma duración (12 h o 30 días). */
export async function apiRefresh() {
  const { data } = await http.post<{ token: string; user: SessionUser }>('/auth/refresh')
  return data
}

export async function apiMe() {
  const { data } = await http.get<{ user: SessionUser }>('/auth/me')
  return data.user
}

export async function apiCatalog() {
  const { data } = await http.get<{
    forms: IsmCatalogItem[]
    equipment: IsmEquipment[]
    positions: Array<{ value: string; label: string }>
    vessel?: { id: string; name: string } | null
  }>('/ism/catalog')
  return data
}

/** Revisión del esquema que espera esta versión de la app. */
const SCHEMA_REV = '2026-10-30-firmas'

export async function apiSchema(code: string, version: number) {
  // `rev` cambia cuando el esquema gana datos (firmantes por pasos): evita la copia en caché del navegador.
  const { data } = await http.get<{ schema: IsmSchema }>(`/ism/schemas/${code}/${version}`, {
    params: { rev: SCHEMA_REV },
  })
  return data.schema
}

export async function apiForm(code: string) {
  const { data } = await http.get<{ form: IsmForm }>(`/ism/forms/${code}`)
  return data.form
}

export async function apiSummary() {
  const { data } = await http.get<IsmSummary>('/ism/summary')
  return data
}

export async function apiRecords(
  params: {
    code?: string
    status?: string
    from?: string
    to?: string
    position?: string
    equipment?: string
    mine?: '1'
    q?: string
    before?: string
    limit?: number
  } = {},
) {
  const { data } = await http.get<{ records: IsmRecord[]; hasMore: boolean }>('/ism/records', {
    params,
  })
  return data
}

export async function apiRecord(id: string) {
  const { data } = await http.get<{ record: IsmRecord }>(`/ism/records/${id}`)
  return data.record
}

export interface ContextInput {
  activityTime?: string
  activityDate?: string
  place?: string
  name?: string
  position?: string
  /** Quien hace el chequeo, elegido de la lista de tripulantes. */
  crewId?: string
  /** Hora de una o más secciones ('HH:MM'); '' la borra. */
  sectionTimes?: Record<string, string>
  confirmed?: boolean
}

/** La clave de idempotencia hace que un reintento devuelva el mismo registro. */
export async function apiCreateRecord(payload: {
  code: string
  recordDate: string
  equipmentFolder?: string
  position?: string
  idempotencyKey: string
  context?: ContextInput
}) {
  const { data } = await http.post<{ record: IsmRecord }>('/ism/records', payload)
  return data.record
}

export interface SavePatch {
  data?: Record<string, string | boolean>
  answers?: Record<string, IsmAnswer>
  context?: ContextInput
}

export interface SaveResult {
  record: {
    data: Record<string, string | boolean>
    answers?: Record<string, IsmAnswer>
    context?: IsmContext | null
    flags?: IsmFlags | null
    recordDate: string
    fileName: string
    signatures: IsmSignature[]
    updatedAt: string
  }
  /** Firmas que dejaron de valer porque los datos cambiaron después. */
  invalidated: string[]
}

export async function apiSaveRecord(id: string, patch: SavePatch) {
  const { data } = await http.patch<SaveResult>(`/ism/records/${id}`, patch)
  return data
}

/** Imagen de una firma (va aparte del registro para que este pese poco). */
export async function apiSignatureImage(id: string, field: string, version: string) {
  const { data } = await http.get<Blob>(
    `/ism/records/${id}/signatures/${encodeURIComponent(field)}/image`,
    { responseType: 'blob', params: { v: version } },
  )
  return URL.createObjectURL(data)
}

export async function apiSign(id: string, field: string, image: string, signerName?: string) {
  const { data } = await http.post<{ record: IsmRecord }>(`/ism/records/${id}/signatures`, {
    field,
    image,
    signerName,
  })
  return data.record
}

export async function apiRemoveSignature(id: string, field: string) {
  const { data } = await http.delete<{ record: IsmRecord }>(
    `/ism/records/${id}/signatures/${encodeURIComponent(field)}`,
  )
  return data.record
}

export async function apiRecordAction(id: string, action: 'submit' | 'approve') {
  const { data } = await http.post<{ record: IsmRecord }>(`/ism/records/${id}/${action}`, {})
  return data.record
}

/** Devolver con motivo y sección afectada. */
export async function apiReturnRecord(id: string, reason: string, section: string) {
  const { data } = await http.post<{ record: IsmRecord }>(`/ism/records/${id}/return`, {
    reason,
    section,
  })
  return data.record
}

export async function apiDiscard(id: string) {
  await http.delete(`/ism/records/${id}`)
}

/** Descarga el PDF oficial con la sesión y devuelve una URL local para abrirlo. */
export async function apiPdfUrl(id: string) {
  const { data } = await http.get<Blob>(`/ism/records/${id}/pdf`, {
    responseType: 'blob',
    timeout: 60000,
  })
  return URL.createObjectURL(data)
}

export async function apiUploadPhoto(file: File) {
  const body = new FormData()
  body.append('file', file)
  body.append('folder', 'ism')
  const { data } = await http.post<{ url: string }>('/uploads', body, { timeout: 90000 })
  return data.url
}

/** Firma el paso actual con el dedo y la clave de 4 números (y lo pasa al siguiente). */
export async function apiSignStep(
  id: string,
  payload: { image: string; pin: string; newPin?: string; signer?: string },
) {
  const { data } = await http.post<{ record: IsmRecord }>(`/ism/records/${id}/sign-step`, payload)
  return data.record
}

export async function apiSetTest(id: string, test: boolean, reason = '') {
  const { data } = await http.post<{ record: { _id: string; test: boolean } }>(`/ism/records/${id}/test`, {
    test,
    reason,
  })
  return data.record
}

/** Lista de tripulantes (onboard: solo los que están a bordo; all: también inactivos). */
export async function apiCrew(params: { onboard?: '1'; all?: '1' } = {}) {
  const { data } = await http.get<{ crew: CrewMember[] }>('/ism/crew', { params })
  return data.crew
}

export async function apiCreateCrew(payload: { name: string; position: string; onboard: boolean }) {
  const { data } = await http.post<{ member: CrewMember }>('/ism/crew', payload)
  return data.member
}

export async function apiUpdateCrew(
  id: string,
  payload: Partial<{ name: string; position: string; onboard: boolean; active: boolean; sharedDevice: boolean }>,
) {
  const { data } = await http.patch<{ member: CrewMember }>(`/ism/crew/${id}`, payload)
  return data.member
}

/** Clave temporal de un solo uso: se muestra una sola vez. */
export async function apiTemporaryPin(id: string) {
  const { data } = await http.post<{ pin: string; name: string }>(`/ism/crew/${id}/temporary-pin`)
  return data
}

export async function apiMyPin() {
  const { data } = await http.get<{ hasPin: boolean; pinTemporary: boolean; lockedUntil: string | null }>(
    '/ism/crew/me/pin',
  )
  return data
}

export async function apiChangeMyPin(current: string, next: string) {
  await http.post('/ism/crew/me/pin', { current, next })
}

export async function apiNotices() {
  const { data } = await http.get<{ notices: IsmNotice[]; unread: number }>('/ism/notices')
  return data
}

export async function apiReadNotices(ids?: string[]) {
  await http.post('/ism/notices/read', { ids })
}
