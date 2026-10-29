import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { apiSignatureImage } from '@/services/api'
import type { IsmSignature } from '@/types'

/**
 * Las imágenes de las firmas no vienen dentro del registro (con 27 firmas
 * pesaba varios MB): se piden una por una, con la sesión, y se guardan en
 * memoria mientras el registro está abierto.
 */
export function useSignatureImages(recordId: () => string, signatures: Ref<IsmSignature[]>) {
  const images = shallowRef<Map<string, string>>(new Map())
  const loaded = new Map<string, string>()

  const keyOf = (s: IsmSignature) => `${s.field}@${s.signedAt}`

  async function load(list: IsmSignature[]) {
    const wanted = new Set(list.map(keyOf))
    for (const [key, url] of loaded) {
      if (!wanted.has(key)) {
        URL.revokeObjectURL(url)
        loaded.delete(key)
      }
    }
    await Promise.all(
      list
        .filter((s) => !loaded.has(keyOf(s)))
        .map(async (s) => {
          try {
            loaded.set(keyOf(s), await apiSignatureImage(recordId(), s.field, String(new Date(s.signedAt).getTime())))
          } catch {
            // Sin imagen: el recuadro muestra el nombre de quien firmó.
          }
        }),
    )
    const next = new Map<string, string>()
    for (const s of list) {
      const url = loaded.get(keyOf(s))
      if (url) next.set(s.field, url)
    }
    images.value = next
  }

  watch(signatures, (list) => load(list ?? []), { immediate: true })

  onBeforeUnmount(() => {
    for (const url of loaded.values()) URL.revokeObjectURL(url)
    loaded.clear()
  })

  return { images }
}
