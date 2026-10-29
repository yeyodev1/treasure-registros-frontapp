import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Acción destructiva: el botón se pinta en rojo. */
  danger?: boolean
  icon?: string
  /** Pide un motivo obligatorio antes de confirmar. */
  reason?: {
    label: string
    placeholder?: string
    /** Motivos frecuentes para tocar en vez de escribir. */
    suggestions?: string[]
  }
  /** Elección obligatoria entre opciones (p. ej. sección afectada al devolver). */
  choice?: {
    label: string
    options: string[]
  }
}

/**
 * Confirmaciones de toda la app en un solo modal con estilo propio.
 * `ask()` devuelve true/false; `askReason()` devuelve el motivo o null.
 */
export const useConfirmStore = defineStore('confirm', () => {
  const current = ref<ConfirmRequest | null>(null)
  const visible = shallowRef(false)
  const reasonText = shallowRef('')
  const choiceValue = shallowRef('')

  let resolver: ((value: string | null) => void) | null = null

  function open(request: ConfirmRequest): Promise<string | null> {
    current.value = request
    reasonText.value = ''
    choiceValue.value = ''
    visible.value = true
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  async function ask(request: Omit<ConfirmRequest, 'reason'>): Promise<boolean> {
    return (await open(request)) !== null
  }

  function askReason(request: ConfirmRequest & { reason: NonNullable<ConfirmRequest['reason']> }) {
    return open(request)
  }

  /** Motivo + elección (devolver con sección afectada). */
  async function askReasonChoice(
    request: ConfirmRequest & {
      reason: NonNullable<ConfirmRequest['reason']>
      choice: NonNullable<ConfirmRequest['choice']>
    },
  ): Promise<{ reason: string; choice: string } | null> {
    const reason = await open(request)
    return reason === null ? null : { reason, choice: choiceValue.value }
  }

  function settle(confirmed: boolean) {
    if (confirmed && current.value?.reason && !reasonText.value.trim()) return
    if (confirmed && current.value?.choice && !choiceValue.value) return
    visible.value = false
    resolver?.(confirmed ? reasonText.value.trim() || 'ok' : null)
    resolver = null
  }

  return { current, visible, reasonText, choiceValue, ask, askReason, askReasonChoice, settle }
})
