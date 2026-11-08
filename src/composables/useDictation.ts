import { onBeforeUnmount, shallowRef } from 'vue'

/** Dictado por voz (Chrome en Android lo trae; si no, el botón no se muestra). */
type Recognition = {
  lang: string
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
const Speech = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

/** Agrega lo dictado como una frase nueva, con mayúscula. */
export function appendSaid(current: string, said: string): string {
  const s = said.charAt(0).toUpperCase() + said.slice(1)
  const c = current.trim()
  return c ? `${c.replace(/\.?$/, '.')} ${s}` : s
}

export function useDictation() {
  const canDictate = Boolean(Speech)
  /** Clave del campo que escucha ('' = ninguno). */
  const listening = shallowRef('')
  let recognition: Recognition | null = null

  function dictate(key: string, onSaid: (said: string) => void) {
    if (listening.value) {
      recognition?.stop()
      return
    }
    recognition = new Speech() as Recognition
    recognition.lang = 'es-EC'
    recognition.interimResults = false
    recognition.onresult = (e) => {
      const said = Array.from(e.results as ArrayLike<any>).map((r) => r[0].transcript).join(' ').trim()
      if (said) onSaid(said)
    }
    recognition.onend = recognition.onerror = () => (listening.value = '')
    listening.value = key
    recognition.start()
  }

  onBeforeUnmount(() => recognition?.stop())
  return { canDictate, listening, dictate }
}
