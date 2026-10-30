<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

/**
 * Recuadro para firmar con el dedo, dentro de la pantalla (no en un modal).
 * `image()` devuelve el PNG recortado; `empty` avisa si hay trazo.
 */
defineProps<{ placeholder?: string }>()
const emit = defineEmits<{ change: [hasInk: boolean] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const hasInk = shallowRef(false)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let last: { x: number; y: number } | null = null

function setup() {
  const el = canvas.value
  if (!el || hasInk.value) return
  const ratio = window.devicePixelRatio || 1
  el.width = Math.round(el.clientWidth * ratio)
  el.height = Math.round(el.clientHeight * ratio)
  ctx = el.getContext('2d')
  if (!ctx) return
  ctx.scale(ratio, ratio)
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#13233a'
}

function point(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function down(e: PointerEvent) {
  e.preventDefault()
  const el = canvas.value
  if (el && !hasInk.value && el.width !== Math.round(el.clientWidth * (window.devicePixelRatio || 1))) setup()
  el?.setPointerCapture(e.pointerId)
  drawing = true
  last = point(e)
}

function move(e: PointerEvent) {
  if (!drawing || !ctx || !last) return
  e.preventDefault()
  const p = point(e)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  last = p
  if (!hasInk.value) {
    hasInk.value = true
    emit('change', true)
  }
}

function up() {
  drawing = false
  last = null
}

function clear() {
  const el = canvas.value
  if (!el || !ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.restore()
  hasInk.value = false
  emit('change', false)
}

/** PNG recortado al trazo, para una firma nítida en el PDF. */
function image(): string {
  const el = canvas.value!
  const c = el.getContext('2d')!
  const { width, height } = el
  const data = c.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  const pad = 12
  const w = Math.min(width, maxX - minX + pad * 2)
  const h = Math.min(height, maxY - minY + pad * 2)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(el, Math.max(0, minX - pad), Math.max(0, minY - pad), w, h, 0, 0, w, h)
  return out.toDataURL('image/png')
}

defineExpose({ image, clear, hasInk })

onMounted(() => {
  requestAnimationFrame(setup)
  window.addEventListener('resize', setup)
})
onBeforeUnmount(() => window.removeEventListener('resize', setup))
</script>

<template>
  <div class="ipad">
    <canvas
      ref="canvas"
      class="ipad-canvas"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @pointerleave="up"
    />
    <Transition name="fade">
      <span v-if="!hasInk" class="ipad-hint">{{ placeholder ?? 'Firma aquí con el dedo' }}</span>
    </Transition>
    <span class="ipad-line" aria-hidden="true" />
    <button v-if="hasInk" type="button" class="ipad-clear" @click="clear">
      <i class="fa-solid fa-eraser" aria-hidden="true" /> Borrar
    </button>
  </div>
</template>

<style scoped lang="scss">
.ipad {
  position: relative;
  height: 220px;
  border: 2px dashed var(--line-strong);
  border-radius: var(--radius);
  background: #fff;
  overflow: hidden;
}

.ipad-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.ipad-hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink-400);
  font-size: 1.05rem;
  pointer-events: none;
}

.ipad-line {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: 44px;
  border-bottom: 1.5px solid var(--powder-300);
  pointer-events: none;
}

.ipad-clear {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  min-height: 44px;
  padding: 0 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: #fff;
  font-weight: 600;
  font-size: 1rem;
  color: var(--navy-800);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
</style>
