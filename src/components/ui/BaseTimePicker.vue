<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useAnchoredPanel } from '@/composables/useAnchoredPanel'
import { nowTimeGalapagos } from '@/utils/ism'

/** Selector de hora propio (modelo 'HH:MM'), sin input nativo. Botones grandes para el dedo. */
defineProps<{ placeholder?: string }>()

const model = defineModel<string>({ default: '' })

const open = shallowRef(false)
const trigger = useTemplateRef<HTMLElement>('trigger')
const panel = useTemplateRef<HTMLElement>('panel')
const { style: panelStyle, openUp, bind, unbind } = useAnchoredPanel(trigger, { minWidth: 320, maxHeight: 420 })

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const hour = computed(() => model.value.split(':')[0] ?? '')
const minute = computed(() => model.value.split(':')[1] ?? '')

function toggle() {
  if (open.value) return close()
  open.value = true
  bind()
}

function close() {
  open.value = false
  unbind()
}

function setHour(h: string) {
  model.value = `${h}:${minute.value || '00'}`
}

function setMinute(m: string) {
  model.value = `${hour.value || '00'}:${m}`
  close()
}

function now() {
  model.value = nowTimeGalapagos()
  close()
}

function onOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (trigger.value?.contains(target) || panel.value?.contains(target)) return
  close()
}

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div class="tpick">
    <button
      ref="trigger"
      type="button"
      class="tpick-trigger"
      :aria-expanded="open"
      @click="toggle"
      @keydown.escape="close"
    >
      <i class="fa-regular fa-clock tpick-icon" aria-hidden="true" />
      <span class="tpick-value" :class="{ 'tpick-value--placeholder': !model }">
        {{ model || placeholder || 'Elige la hora' }}
      </span>
    </button>

    <Teleport to="body">
      <Transition :name="openUp ? 'pop-up' : 'pop'">
        <div v-if="open" ref="panel" class="tpick-panel" :style="panelStyle">
          <div class="tpick-head">
            <span>Hora (Galápagos)</span>
            <button type="button" class="tpick-now" @click="now">
              <i class="fa-solid fa-location-crosshairs" aria-hidden="true" /> Ahora
            </button>
          </div>
          <p class="tpick-label">Hora</p>
          <div class="tpick-grid tpick-grid--hours">
            <button
              v-for="h in HOURS"
              :key="h"
              type="button"
              class="tpick-cell"
              :class="{ on: h === hour }"
              @click="setHour(h)"
            >
              {{ h }}
            </button>
          </div>
          <p class="tpick-label">Minutos</p>
          <div class="tpick-grid tpick-grid--minutes">
            <button
              v-for="m in MINUTES"
              :key="m"
              type="button"
              class="tpick-cell"
              :class="{ on: m === minute }"
              @click="setMinute(m)"
            >
              :{{ m }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.tpick {
  width: 100%;
}

.tpick-trigger {
  @include touch-target;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  border: 1.5px solid var(--cream-200);
  border-radius: var(--radius-sm);
  background: #fff;
  text-align: left;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    border-color: var(--gold-500);
    box-shadow: 0 0 0 3px rgba(195, 161, 105, 0.22);
  }
}

.tpick-icon {
  color: var(--ink-400);
}

.tpick-value--placeholder {
  color: var(--ink-400);
}
</style>

<style lang="scss">
.tpick-panel {
  z-index: 90;
  background: var(--surface);
  border: 1px solid var(--cream-200);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 0.75rem;
  overflow-y: auto;
  user-select: none;
}

.tpick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-serif);
  font-size: 1rem;
  margin-bottom: 0.3rem;
}

.tpick-now {
  min-height: 44px;
  padding: 0 0.8rem;
  border-radius: 999px;
  background: var(--powder-100);
  color: var(--navy-800);
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.tpick-label {
  margin: 0.45rem 0 0.25rem;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-600);
}

.tpick-grid {
  display: grid;
  gap: 4px;

  &--hours {
    grid-template-columns: repeat(6, 1fr);
  }

  &--minutes {
    grid-template-columns: repeat(6, 1fr);
  }
}

.tpick-cell {
  min-height: 44px;
  border-radius: 7px;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  transition: background 0.14s ease, color 0.14s ease;

  &:hover {
    background: var(--cream-200);
  }

  &.on {
    background: var(--navy-800);
    color: var(--cream-100);
  }
}
</style>
