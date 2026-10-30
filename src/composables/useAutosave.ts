import { onBeforeUnmount, shallowRef } from 'vue'
import { apiSaveRecord, type ContextInput, type SaveResult } from '@/services/api'
import { apiErrorMessage, isNetworkError, isUnauthorized } from '@/services/httpBase'
import type { IsmAnswer } from '@/types'

type Values = Record<string, string | boolean>

export interface PendingPatch {
  data: Values
  answers: Record<string, IsmAnswer>
  context: ContextInput
}

export type SyncState = 'idle' | 'saving' | 'saved' | 'pending' | 'offline' | 'error'

const empty = (): PendingPatch => ({ data: {}, answers: {}, context: {} })

function merge(a: PendingPatch, b: PendingPatch): PendingPatch {
  return {
    data: { ...a.data, ...b.data },
    answers: { ...a.answers, ...b.answers },
    context: {
      ...a.context,
      ...b.context,
      // Las horas por sección se suman (el servidor también las mezcla por sección).
      ...(a.context.sectionTimes || b.context.sectionTimes
        ? { sectionTimes: { ...a.context.sectionTimes, ...b.context.sectionTimes } }
        : {}),
    },
  }
}

function isEmpty(p: PendingPatch) {
  return !Object.keys(p.data).length && !Object.keys(p.answers).length && !Object.keys(p.context).length
}

/**
 * Guardado automático. Todo lo que el servidor aún no confirmó vive también
 * en la tableta: si falla el envío (sin señal, sesión vencida, servidor
 * despertando o un rechazo), el lote vuelve a la cola y nunca se pierde. Al
 * reabrir el registro se muestra "Pendiente de sincronizar" y se envía.
 */
export function useAutosave(recordId: () => string, options?: { onSaved?: (result: SaveResult) => void }) {
  const state = shallowRef<SyncState>('idle')
  const savedAt = shallowRef<Date | null>(null)
  const lastError = shallowRef('')

  let pending: PendingPatch = empty()
  let inflight: PendingPatch | null = null
  let running: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let retry: ReturnType<typeof setInterval> | null = null

  const storageKey = () => `ism.pending.v2.${recordId()}`
  const legacyKey = () => `ism.pending.${recordId()}`

  /** Lo no confirmado por el servidor queda escrito en la tableta. */
  function persistLocal() {
    const unconfirmed = inflight ? merge(inflight, pending) : pending
    try {
      if (isEmpty(unconfirmed)) localStorage.removeItem(storageKey())
      else localStorage.setItem(storageKey(), JSON.stringify(unconfirmed))
    } catch {
      // Sin almacenamiento local disponible.
    }
  }

  /** Lo que quedó guardado en la tablet sin confirmar (se aplica al abrir). */
  function localPending(): PendingPatch {
    let stored = empty()
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) ?? 'null') as Partial<PendingPatch> | null
      if (raw) stored = merge(stored, { data: raw.data ?? {}, answers: raw.answers ?? {}, context: raw.context ?? {} })
      // Formato anterior (solo campos de la hoja).
      const legacy = JSON.parse(localStorage.getItem(legacyKey()) ?? 'null') as Values | null
      if (legacy) stored = merge({ ...empty(), data: legacy }, stored)
    } catch {
      // Datos locales ilegibles: se ignoran.
    }
    return stored
  }

  /** Carga lo pendiente de la tableta en la cola para enviarlo. */
  function adoptLocal(): PendingPatch {
    const local = localPending()
    pending = merge(local, pending)
    try {
      localStorage.removeItem(legacyKey())
    } catch {
      // nada
    }
    persistLocal()
    if (!isEmpty(pending)) state.value = 'pending'
    return local
  }

  function hasPending() {
    return !isEmpty(pending) || Boolean(inflight)
  }

  function scheduleRetry() {
    if (!retry) retry = setInterval(() => flush().catch(() => undefined), 15000)
  }

  function stopRetry() {
    if (retry) {
      clearInterval(retry)
      retry = null
    }
  }

  async function send() {
    if (isEmpty(pending)) return
    inflight = pending
    pending = empty()
    state.value = 'saving'
    try {
      const patch = inflight
      const result = await apiSaveRecord(recordId(), {
        ...(Object.keys(patch.data).length ? { data: patch.data } : {}),
        ...(Object.keys(patch.answers).length ? { answers: patch.answers } : {}),
        ...(Object.keys(patch.context).length ? { context: patch.context } : {}),
      })
      inflight = null
      persistLocal()
      lastError.value = ''
      savedAt.value = new Date()
      state.value = isEmpty(pending) ? 'saved' : 'pending'
      stopRetry()
      options?.onSaved?.(result)
    } catch (err) {
      // El lote vuelve a la cola (lo nuevo que llegó mientras tanto gana).
      pending = merge(inflight ?? empty(), pending)
      inflight = null
      persistLocal()
      lastError.value = apiErrorMessage(err)
      if (isUnauthorized(err)) {
        // La sesión venció: se envía al volver a ingresar.
        state.value = 'pending'
      } else if (isNetworkError(err) || (axiosStatus(err) ?? 0) >= 500) {
        state.value = 'offline'
        scheduleRetry()
      } else {
        // Rechazo del servidor (p. ej. ya no es editable): se conserva en la tableta.
        state.value = 'error'
      }
      throw err
    }
  }

  /** Envía lo pendiente; lanza error si no se pudo (nunca se descarta). */
  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    while (running) await running.catch(() => undefined)
    if (isEmpty(pending)) return
    running = send()
    try {
      await running
    } finally {
      running = null
    }
  }

  function queueWith(patch: Partial<PendingPatch>) {
    pending = merge(pending, { ...empty(), ...patch })
    persistLocal()
    state.value = 'saving'
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      flush().catch(() => undefined)
    }, 900)
  }

  function queue(name: string, value: string | boolean) {
    queueWith({ data: { [name]: value } })
  }

  function queueAnswer(id: string, answer: IsmAnswer) {
    queueWith({ answers: { [id]: answer } })
  }

  function queueContext(context: ContextInput) {
    queueWith({ context })
  }

  function onOnline() {
    flush().catch(() => undefined)
  }

  window.addEventListener('online', onOnline)
  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline)
    if (timer) clearTimeout(timer)
    stopRetry()
    persistLocal()
    // Último intento en segundo plano; si falla, queda en la tableta.
    if (!isEmpty(pending)) flush().catch(() => undefined)
  })

  return {
    state,
    savedAt,
    lastError,
    queue,
    queueAnswer,
    queueContext,
    flush,
    localPending,
    adoptLocal,
    hasPending,
  }
}

function axiosStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}
