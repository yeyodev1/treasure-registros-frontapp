import { http } from './httpBase'
import type {
  IsmCatalogItem,
  IsmEquipment,
  IsmForm,
  IsmRecord,
  IsmSummary,
  SessionUser,
} from '@/types'

export async function apiLogin(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: SessionUser }>('/auth/login', {
    email,
    password,
  })
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

export async function apiCreateRecord(payload: {
  code: string
  recordDate: string
  equipmentFolder?: string
  position?: string
}) {
  const { data } = await http.post<{ record: IsmRecord }>('/ism/records', payload)
  return data.record
}

export async function apiSaveData(id: string, values: Record<string, string | boolean>) {
  const { data } = await http.patch<{ record: { updatedAt: string } }>(`/ism/records/${id}`, {
    data: values,
  })
  return data.record
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

export async function apiRecordAction(
  id: string,
  action: 'submit' | 'approve' | 'return',
  reason?: string,
) {
  const { data } = await http.post<{ record: IsmRecord }>(
    `/ism/records/${id}/${action}`,
    reason ? { reason } : {},
  )
  return data.record
}

export async function apiDiscard(id: string) {
  await http.delete(`/ism/records/${id}`)
}

/** Descarga el PDF oficial con la sesión y devuelve una URL local para abrirlo. */
export async function apiPdfUrl(id: string) {
  const { data } = await http.get<Blob>(`/ism/records/${id}/pdf`, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

export async function apiUploadPhoto(file: File) {
  const body = new FormData()
  body.append('file', file)
  body.append('folder', 'ism')
  const { data } = await http.post<{ url: string }>('/uploads', body)
  return data.url
}
