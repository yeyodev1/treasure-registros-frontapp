<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'

/**
 * Firma con el dedo (o lápiz/mouse). Devuelve un PNG con fondo transparente.
 * `askName`: la firma es de alguien que no inició sesión (asistente, tripulante).
 */
const props = defineProps<{ label: string; askName: boolean; defaultName: string }>()
const emit = defineEmits<{ close: []; signed: [image: string, signerName: string] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const name = shallowRef(props.defaultName)
const hasInk = shallowRef(false)

let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let last: { x: number; y: number } | null = null

function setup() {
  const el = canvas.value
  if (!el) return
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
  canvas.value?.setPointerCapture(e.pointerId)
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
  hasInk.value = true
}

function up() {
  drawing = false
  last = null
}

function clear() {
  const el = canvas.value
  if (!el || !ctx) return
  ctx.clearRect(0, 0, el.width, el.height)
  hasInk.value = false
}

/** Recorta el espacio vacío alrededor del trazo para una firma nítida en el PDF. */
function exportTrimmed(): string {
  const el = canvas.value!
  const c = el.getContext('2d')!
  const { width, height } = el
  const data = c.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = 0, maxY = 0
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

function confirm() {
  if (!hasInk.value || !name.value.trim()) return
  emit('signed', exportTrimmed(), name.value.trim())
}

onMounted(() => {
  requestAnimationFrame(setup)
  window.addEventListener('resize', setup)
})
onBeforeUnmount(() => window.removeEventListener('resize', setup))
</script>

<template>
  <BaseModal :title="`Firmar · ${label}`" @close="emit('close')">
    <div class="pad">
      <div class="field">
        <label for="signer-name">{{ askName ? 'Nombre de quien firma' : 'Firma como' }}</label>
        <input
          id="signer-name"
          v-model="name"
          type="text"
          :readonly="!askName"
          :placeholder="askName ? 'Nombre y apellido' : ''"
        />
      </div>

      <div class="canvas-wrap">
        <canvas
          ref="canvas"
          class="canvas"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="up"
          @pointerleave="up"
        />
        <span v-if="!hasInk" class="hint">
          <i class="fa-solid fa-signature" aria-hidden="true" /> Firma aquí con el dedo
        </span>
        <span class="line" aria-hidden="true" />
      </div>

      <p class="legal">
        Tu firma queda registrada con tu usuario, la fecha y la hora, junto a una huella del contenido del
        registro.
      </p>

      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="clear">
          <i class="fa-solid fa-eraser" aria-hidden="true" /> Limpiar
        </button>
        <button type="button" class="btn btn-primary" :disabled="!hasInk || !name.trim()" @click="confirm">
          <i class="fa-solid fa-check" aria-hidden="true" /> Firmar
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped lang="scss">
.pad {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.canvas-wrap {
  position: relative;
  height: 220px;
  border: 1.5px dashed var(--powder-300);
  border-radius: var(--radius-sm);
  background: var(--powder-100);
  overflow: hidden;
}

.canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink-400);
  font-size: 0.92rem;
  pointer-events: none;
}

.line {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 48px;
  border-bottom: 1px solid var(--ink-400);
  pointer-events: none;
  opacity: 0.5;
}

.legal {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-400);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 0.5rem;
}
</style>
