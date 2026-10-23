import { onBeforeUnmount, shallowRef } from 'vue'
import axios from 'axios'
import { apiSaveData } from '@/services/api'

type Values = Record<string, string | boolean>

/**
 * Guardado automático del registro mientras se llena. Si la tablet pierde
 * la señal, lo pendiente queda guardado en el dispositivo y se envía solo
 * cuando vuelve la conexión.
 */
export function useAutosave(recordId: () => string) {
  const state = shallowRef<'idle' | 'saving' | 'saved' | 'offline' | 'error'>('idle')
  const savedAt = shallowRef<Date | null>(null)
  let pending: Values = {}
  let timer: ReturnType<typeof setTimeout> | null = null
  let retry: ReturnType<typeof setInterval> | null = null

  const storageKey = () => `ism.pending.${recordId()}`

  function persistLocal() {
    try {
      const prev = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as Values
      localStorage.setItem(storageKey(), JSON.stringify({ ...prev, ...pending }))
    } catch {
      // Sin almacenamiento local disponible.
    }
  }

  /** Lo que quedó guardado en la tablet sin conexión (se aplica al abrir). */
  function localPending(): Values {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as Values
    } catch {
      return {}
    }
  }

  async function flush() {
    const local = localPending()
    const batch = { ...local, ...pending }
    if (!Object.keys(batch).length) return
    pending = {}
    state.value = 'saving'
    try {
      await apiSaveData(recordId(), batch)
      try {
        localStorage.removeItem(storageKey())
      } catch {
        // nada
      }
      state.value = 'saved'
      savedAt.value = new Date()
      if (retry) {
        clearInterval(retry)
        retry = null
      }
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        pending = { ...batch, ...pending }
        persistLocal()
        pending = {}
        state.value = 'offline'
        if (!retry) retry = setInterval(flush, 15000)
      } else {
        state.value = 'error'
        throw err
      }
    }
  }

  function queue(name: string, value: string | boolean) {
    pending[name] = value
    state.value = 'saving'
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      flush().catch(() => undefined)
    }, 900)
  }

  function onOnline() {
    flush().catch(() => undefined)
  }

  window.addEventListener('online', onOnline)
  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline)
    if (timer) clearTimeout(timer)
    if (retry) clearInterval(retry)
    if (Object.keys(pending).length) persistLocal()
  })

  return { state, savedAt, queue, flush, localPending }
}
