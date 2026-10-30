import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * Visor del PDF oficial dentro de la app (informe 29-oct, falla 9): en la
 * tablet una pestaña nueva con el PDF salía en blanco. Se abre encima de la
 * pantalla actual, con el nombre del archivo y el botón Descargar.
 */
export const usePdfViewerStore = defineStore('pdfViewer', () => {
  const recordId = shallowRef<string | null>(null)
  const fileName = shallowRef('')

  function open(id: string, name: string) {
    recordId.value = id
    fileName.value = name
  }

  function close() {
    recordId.value = null
  }

  return { recordId, fileName, open, close }
})
