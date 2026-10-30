<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { usePdfViewerStore } from '@/stores/pdfViewer'
import { apiPdfUrl } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'

/**
 * Muestra el PDF oficial con pdf.js (cada página en un lienzo), así se ve
 * igual en la tablet, el teléfono y la computadora. El archivo se pide con la
 * sesión y se descarga con su nombre (R-14_AAAAMMDD_HHMM.pdf).
 */
const viewer = usePdfViewerStore()
const pagesEl = useTemplateRef<HTMLDivElement>('pages')
const state = shallowRef<'loading' | 'ready' | 'error'>('loading')
const error = shallowRef('')
const pageCount = shallowRef(0)
const url = shallowRef('')

let token = 0

async function render(id: string) {
  const mine = ++token
  state.value = 'loading'
  error.value = ''
  pageCount.value = 0
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
  try {
    const [blobUrl, pdfjs] = await Promise.all([apiPdfUrl(id), import('pdfjs-dist/legacy/build/pdf.mjs')])
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    if (mine !== token) return
    url.value = blobUrl
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ url: blobUrl }).promise
    if (mine !== token) return
    pageCount.value = doc.numPages
    state.value = 'ready'
    await nextTick()
    const host = pagesEl.value
    if (!host) return
    host.innerHTML = ''
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      if (mine !== token) return
      const base = page.getViewport({ scale: 1 })
      const width = Math.min(host.clientWidth || 800, 1100)
      const viewport = page.getViewport({ scale: (width / base.width) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
      canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages}`)
      host.appendChild(canvas)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    }
  } catch (err) {
    if (mine !== token) return
    state.value = 'error'
    error.value = apiErrorMessage(err)
  }
}

watch(
  () => viewer.recordId,
  (id) => {
    if (id) render(id)
    else {
      token++
      if (url.value) URL.revokeObjectURL(url.value)
      url.value = ''
    }
  },
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && viewer.recordId) viewer.close()
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="viewer.recordId" class="pdfv" role="dialog" :aria-label="viewer.fileName">
        <header class="pdfv-head">
          <button type="button" class="pdfv-btn" aria-label="Cerrar el PDF" @click="viewer.close()">
            <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Volver
          </button>
          <p class="pdfv-name">
            <i class="fa-regular fa-file-pdf" aria-hidden="true" />
            <span>{{ viewer.fileName }}</span>
            <small v-if="pageCount">{{ pageCount === 1 ? '1 página' : `${pageCount} páginas` }}</small>
          </p>
          <a
            class="pdfv-btn pdfv-btn--main"
            :class="{ disabled: !url }"
            :href="url || undefined"
            :download="viewer.fileName"
            :aria-disabled="!url"
          >
            <i class="fa-solid fa-download" aria-hidden="true" /> Descargar
          </a>
        </header>
        <div class="pdfv-body">
          <Transition name="fade" mode="out-in">
            <div v-if="state === 'loading'" key="l" class="pdfv-state">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preparando el PDF…
            </div>
            <div v-else-if="state === 'error'" key="e" class="pdfv-state">
              <p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true" /> No se pudo abrir el PDF. {{ error }}</p>
              <button type="button" class="pdfv-btn pdfv-btn--main" @click="render(viewer.recordId!)">
                <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
              </button>
            </div>
          </Transition>
          <div v-show="state === 'ready'" ref="pages" class="pdfv-pages" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.pdfv {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #3a4651;
}

.pdfv-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: calc(0.5rem + env(safe-area-inset-top)) 0.75rem 0.5rem;
  background: var(--navy-800);
  color: #fff;
}

.pdfv-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  small {
    color: rgba(255, 255, 255, 0.7);
    font-weight: 400;
    white-space: nowrap;
  }
}

.pdfv-btn {
  min-height: 44px;
  padding: 0 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: var(--radius-sm);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  white-space: nowrap;

  &--main {
    background: #fff;
    border-color: #fff;
    color: var(--navy-800);
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.pdfv-body {
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 1rem 0.75rem calc(1rem + env(safe-area-inset-bottom));
}

.pdfv-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;

  :deep(canvas) {
    max-width: 100%;
    height: auto;
    background: #fff;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }
}

.pdfv-state {
  color: #fff;
  font-size: 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  max-width: 640px;
  margin: 2rem auto;

  p {
    margin: 0;
  }
}
</style>
