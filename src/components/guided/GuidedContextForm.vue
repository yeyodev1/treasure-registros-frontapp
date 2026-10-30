<script setup lang="ts">
import { computed } from 'vue'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import BaseTimePicker from '@/components/ui/BaseTimePicker.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { IsmSchema } from '@/types'

export interface ContextDraft {
  activityDate: string
  activityTime: string
  place: string
  name: string
  position: string
}

/**
 * Confirmación del contexto: embarcación, fecha y hora de la actividad,
 * lugar y quién llena (identidad y cargo precargados de la sesión).
 */
const props = defineProps<{
  schema: IsmSchema
  modelValue: ContextDraft
  accountName: string
  positions: Array<{ value: string; label: string }>
  editable: boolean
  /** Campos que faltan (activityDate, activityTime, place, name). */
  missing?: Set<string>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: ContextDraft] }>()

function set<K extends keyof ContextDraft>(key: K, value: ContextDraft[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const date = computed({
  get: () => props.modelValue.activityDate,
  set: (v: string) => set('activityDate', v),
})
const time = computed({
  get: () => props.modelValue.activityTime,
  set: (v: string) => set('activityTime', v),
})
// El Capitán no va primero: un toque errado no debe dejar "Capitán" elegido.
const orderedPositions = computed(() => [
  ...props.positions.filter((p) => p.value !== 'CAP'),
  ...props.positions.filter((p) => p.value === 'CAP'),
])

const position = computed({
  get: () => props.modelValue.position,
  set: (v: string) => set('position', v),
})

const miss = (f: string) => props.missing?.has(f) ?? false
</script>

<template>
  <div class="ctx">
    <div class="ctx-vessel">
      <i class="fa-solid fa-ship" aria-hidden="true" />
      <div>
        <span class="ctx-label">Embarcación</span>
        <strong>{{ schema.vessel }}</strong>
      </div>
    </div>

    <div class="ctx-grid">
      <div class="field" :class="{ 'field--miss': miss('activityDate') }">
        <label>{{ schema.context.activityDate.label }}</label>
        <BaseDatePicker v-if="editable" v-model="date" />
        <p v-else class="ctx-ro">{{ modelValue.activityDate || '—' }}</p>
        <small v-if="miss('activityDate')" class="ctx-miss">Falta la fecha</small>
      </div>
      <div class="field" :class="{ 'field--miss': miss('activityTime') }">
        <label>{{ schema.context.activityTime.label }}</label>
        <BaseTimePicker v-if="editable" v-model="time" />
        <p v-else class="ctx-ro">{{ modelValue.activityTime || '—' }}</p>
        <small v-if="miss('activityTime')" class="ctx-miss">Falta la hora</small>
      </div>
    </div>

    <div class="field" :class="{ 'field--miss': miss('place') }">
      <label for="ctx-place">{{ schema.context.place.label }}</label>
      <div v-if="editable && schema.context.place.suggestions?.length" class="ctx-chips">
        <button
          v-for="s in schema.context.place.suggestions"
          :key="s"
          type="button"
          class="ctx-chip"
          :class="{ on: modelValue.place === s }"
          @click="set('place', s)"
        >
          {{ s }}
        </button>
      </div>
      <input
        id="ctx-place"
        :value="modelValue.place"
        :readonly="!editable"
        placeholder="Puerto, bahía o «Navegando»"
        @input="set('place', ($event.target as HTMLInputElement).value)"
      />
      <small v-if="miss('place')" class="ctx-miss">Falta el lugar</small>
    </div>

    <div class="ctx-grid">
      <div class="field" :class="{ 'field--miss': miss('name') }">
        <label for="ctx-name">Quién hace el chequeo</label>
        <input
          id="ctx-name"
          :value="modelValue.name"
          :readonly="!editable"
          autocomplete="name"
          @input="set('name', ($event.target as HTMLInputElement).value)"
        />
        <small class="ctx-hint">Sesión iniciada como {{ accountName }}. Si la cuenta es compartida, escribe tu nombre.</small>
      </div>
      <div class="field" :class="{ 'field--miss': miss('position') }">
        <label>Cargo</label>
        <BaseSelect v-if="editable" v-model="position" :options="orderedPositions" placeholder="Elige el cargo" />
        <p v-else class="ctx-ro">{{ positions.find((p) => p.value === modelValue.position)?.label ?? '—' }}</p>
        <small v-if="miss('position')" class="ctx-miss">Falta el cargo</small>
      </div>
    </div>

    <p class="ctx-note">
      <i class="fa-solid fa-circle-info" aria-hidden="true" />
      Pon la fecha y hora en que hiciste el chequeo.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.ctx {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ctx-vessel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--powder-100);

  i {
    color: var(--navy-700);
    font-size: 1.1rem;
  }

  div {
    display: flex;
    flex-direction: column;
  }
}

.ctx-label {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-400);
}

.ctx-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;

  @include tablet {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.ctx-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.ctx-chip {
  min-height: 44px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1.5px solid var(--cream-200);
  background: #fff;
  font-weight: 600;
  font-size: 1rem;
  color: var(--ink-600);
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.ctx-ro {
  margin: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  font-weight: 600;
}

.ctx-hint {
  color: var(--ink-400);
  font-size: 1rem;
}

.ctx-miss {
  color: var(--danger);
  font-weight: 600;
  font-size: 1rem;
}

.field--miss input,
.field--miss :deep(.picker-trigger),
.field--miss :deep(.tpick-trigger),
.field--miss :deep(.select-trigger) {
  border-color: rgba(180, 72, 59, 0.6);
}

.ctx-note {
  margin: 0;
  font-size: 1rem;
  color: var(--ink-600);
  background: var(--powder-100);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.75rem;
}
</style>
