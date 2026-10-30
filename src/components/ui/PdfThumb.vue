<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { apiPdfUrl } from '@/services/api'

/**
 * Primera página del PDF oficial en pequeño (pantalla 5): la Persona
 * Designada ve la hoja que va a archivar. Tocarla abre el visor.
 */
const props = defineProps<{ recordId: string; width?: number }>()
const emit = defineEmits<{ open: [] }>()

const host = useTemplateRef<HTMLDivElement>('host')
const state = shallowRef<'loading' | 'ready' | 'error'>('loading')
let blobUrl = ''
let alive = true

onMounted(async () => {
  try {
    const [url, pdfjs] = await Promise.all([apiPdfUrl(props.recordId), import('pdfjs-dist/legacy/build/pdf.mjs')])
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    blobUrl = url
    if (!alive) return
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ url }).promise
    const page = await doc.getPage(1)
    if (!alive || !host.value) return
    const width = props.width ?? 160
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (width / base.width) * ratio })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${width}px`
    host.value.appendChild(canvas)
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    if (alive) state.value = 'ready'
  } catch {
    if (alive) state.value = 'error'
  }
})

onBeforeUnmount(() => {
  alive = false
  if (blobUrl) URL.revokeObjectURL(blobUrl)
})
</script>

<template>
  <button type="button" class="thumb" :style="{ width: `${(width ?? 160) + 2}px` }" aria-label="Abrir el PDF" @click="emit('open')">
    <div ref="host" class="thumb-page" :class="{ ready: state === 'ready' }" />
    <span v-if="state === 'loading'" class="thumb-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true" /></span>
    <span v-else-if="state === 'error'" class="thumb-state">Vista previa no disponible</span>
  </button>
</template>

<style scoped lang="scss">
.thumb {
  position: relative;
  display: block;
  min-height: 200px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s ease, transform 0.12s ease;

  &:hover {
    border-color: var(--navy-600);
  }

  &:active {
    transform: scale(0.99);
  }
}

.thumb-page {
  opacity: 0;
  transition: opacity 0.25s ease;

  &.ready {
    opacity: 1;
  }

  :deep(canvas) {
    display: block;
  }
}

.thumb-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0.75rem;
  text-align: center;
  font-size: 1rem;
  color: var(--ink-600);
}
</style>
