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
    <Transition name="pdfv">
      <div v-if="viewer.recordId" class="pdfv" role="dialog" :aria-label="viewer.fileName">
        <header class="pdfv-head">
          <button type="button" class="btn btn-ghost pdfv-back" aria-label="Cerrar el PDF" @click="viewer.close()">
            <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Volver
          </button>
          <div class="pdfv-name">
            <i class="fa-regular fa-file-pdf" aria-hidden="true" />
            <span class="pdfv-file num">{{ viewer.fileName }}</span>
            <Transition name="fade">
              <span v-if="pageCount" class="pdfv-pages-count">{{ pageCount === 1 ? '1 página' : `${pageCount} páginas` }}</span>
            </Transition>
          </div>
          <a
            class="btn btn-primary pdfv-download"
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
              <p><i class="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preparando el PDF…</p>
            </div>
            <div v-else-if="state === 'error'" key="e" class="pdfv-state pdfv-state--error">
              <p>
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <span><strong>No se pudo abrir el PDF.</strong> {{ error }}</span>
              </p>
              <button type="button" class="btn btn-primary" @click="render(viewer.recordId!)">
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
@use '@/styles/mixins' as *;

// Visor claro: barra blanca con el nombre del archivo y Descargar; las hojas
// sobre el azul gris del libro de registro.
.pdfv {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: var(--cream-200);
}

.pdfv-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  color: var(--ink-900);

  @include tablet {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}

.pdfv-back,
.pdfv-download {
  flex-shrink: 0;
  white-space: nowrap;
}

.pdfv-download.disabled {
  opacity: 0.5;
  pointer-events: none;
}

// En el teléfono el nombre del archivo baja a su propia línea, entero.
.pdfv-name {
  order: 3;
  flex: 1 0 100%;
  min-width: 0;

  @include tablet {
    order: 0;
    flex: 1 1 auto;
  }

  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 0.6rem;
  row-gap: 0;
  font-size: 1rem;

  > i {
    color: var(--navy-700);
  }
}

.pdfv-file {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.pdfv-pages-count {
  color: var(--ink-600);
  white-space: nowrap;
}

.pdfv-body {
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 1rem 0.75rem calc(1.5rem + env(safe-area-inset-bottom));

  @include tablet {
    padding: 1.5rem 1.5rem calc(2rem + env(safe-area-inset-bottom));
  }
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
    border: 1px solid var(--line-strong);
    border-radius: 2px;
    animation: page-in 0.3s var(--ease) both;
  }
}

.pdfv-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.9rem;
  max-width: 640px;
  margin: 2rem auto;
  padding: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 1rem;
  color: var(--ink-600);

  p {
    margin: 0;
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
  }

  i {
    margin-top: 0.2rem;
  }

  strong {
    color: var(--ink-900);
  }

  &--error i {
    color: var(--danger);
  }
}

.pdfv-enter-active,
.pdfv-leave-active {
  transition: opacity 0.2s ease, transform 0.22s var(--ease);
}

.pdfv-enter-from,
.pdfv-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes page-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
