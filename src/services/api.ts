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
  }>('/ism/catalog')
  return data
}

export async function apiSchema(code: string, version: number) {
  const { data } = await http.get<{ schema: IsmSchema }>(`/ism/schemas/${code}/${version}`)
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
