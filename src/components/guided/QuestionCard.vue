<script setup lang="ts">
import { computed, reactive, shallowRef, useTemplateRef } from 'vue'
import { apiUploadPhoto } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { useToastStore } from '@/stores/toast'
import { emptyAnswer, hasNovedad } from '@/utils/guided'
import type { AnswerValue, IsmAnswer, IsmSchemaItem } from '@/types'

/**
 * Un punto del chequeo: respuesta explícita SI / NO / No aplica (nada viene
 * marcado), "Hay un problema" con descripción, evidencia y acción tomada, y
 * motivo cuando no aplica.
 */
const props = defineProps<{
  item: IsmSchemaItem
  answer: IsmAnswer | undefined
  editable: boolean
  /** Campos que faltan en este punto (value, descripcion, accion, motivo). */
  missing?: Set<string>
}>()

const emit = defineEmits<{ update: [answer: IsmAnswer] }>()

const toast = useToastStore()
const uploading = shallowRef(false)
const photoInput = useTemplateRef<HTMLInputElement>('photoInput')

const current = computed<IsmAnswer>(() => ({ ...emptyAnswer(), ...(props.answer ?? {}) }))
const novedad = computed(() => hasNovedad(current.value))

/** Lo escrito no se pierde si se toca otra respuesta por error y se vuelve. */
const memory = reactive({ descripcion: '', accion: '', motivo: '', evidencia: [] as string[] })

function emitWith(patch: Partial<IsmAnswer>) {
  const next = { ...current.value, ...patch }
  const keepsNovedad = next.value === 'no' || (next.value === 'si' && next.problem)
  if (!keepsNovedad) {
    if (current.value.descripcion) memory.descripcion = current.value.descripcion
    if (current.value.accion) memory.accion = current.value.accion
    if (current.value.evidencia.length) memory.evidencia = current.value.evidencia
    next.descripcion = ''
    next.accion = ''
    next.evidencia = []
    next.problem = false
  } else {
    next.descripcion = next.descripcion || memory.descripcion
    next.accion = next.accion || memory.accion
    next.evidencia = next.evidencia.length ? next.evidencia : memory.evidencia
  }
  if (next.value !== 'na') {
    if (current.value.motivo) memory.motivo = current.value.motivo
    next.motivo = ''
  } else {
    next.motivo = next.motivo || memory.motivo
  }
  emit('update', next)
}

function choose(value: AnswerValue) {
  if (!props.editable) return
  emitWith({ value, problem: value === 'si' ? current.value.problem : false })
}

function toggleProblem() {
  if (!props.editable || current.value.value !== 'si') return
  emitWith({ problem: !current.value.problem })
}

function onText(field: 'descripcion' | 'accion' | 'motivo', e: Event) {
  emit('update', { ...current.value, [field]: (e.target as HTMLTextAreaElement).value })
}

function pickMotivo(text: string) {
  emit('update', { ...current.value, motivo: text })
}

async function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploading.value = true
  try {
    const url = await apiUploadPhoto(file)
    emit('update', { ...current.value, evidencia: [...current.value.evidencia, url].slice(0, 4) })
  } catch (err) {
    toast.error(`No se pudo subir la foto: ${apiErrorMessage(err)}`)
  } finally {
    uploading.value = false
  }
}

function removePhoto(url: string) {
  emit('update', { ...current.value, evidencia: current.value.evidencia.filter((u) => u !== url) })
}

const NA_SUGGESTIONS = ['No corresponde a esta maniobra', 'El barco está en puerto', 'Equipo fuera de servicio programado']

const miss = (f: string) => props.missing?.has(f) ?? false
</script>

<template>
  <article
    :id="`q-${item.id}`"
    class="q"
    :class="{ 'q--novedad': novedad, 'q--missing': missing?.size, 'q--na': current.value === 'na' }"
  >
    <header class="q-head">
      <span class="q-n">{{ item.n }}</span>
      <div class="q-text">
        <p class="q-prompt">{{ item.prompt }}</p>
        <p class="q-official">Formato: «{{ item.official }}»</p>
      </div>
    </header>

    <div class="q-options" role="radiogroup" :aria-label="item.prompt">
      <button
        type="button"
        role="radio"
        class="opt opt--si"
        :class="{ on: current.value === 'si' }"
        :aria-checked="current.value === 'si'"
        :disabled="!editable"
        @click="choose('si')"
      >
        <i class="fa-solid fa-check" aria-hidden="true" /> Sí
      </button>
      <button
        type="button"
        role="radio"
        class="opt opt--no"
        :class="{ on: current.value === 'no' }"
        :aria-checked="current.value === 'no'"
        :disabled="!editable"
        @click="choose('no')"
      >
        <i class="fa-solid fa-xmark" aria-hidden="true" /> No
      </button>
      <button
        v-if="item.allowNa"
        type="button"
        role="radio"
        class="opt opt--na"
        :class="{ on: current.value === 'na' }"
        :aria-checked="current.value === 'na'"
        :disabled="!editable"
        @click="choose('na')"
      >
        <i class="fa-solid fa-minus" aria-hidden="true" /> No aplica
      </button>
      <Transition name="fade">
        <button
          v-if="current.value === 'si'"
          type="button"
          class="opt opt--problem"
          :class="{ on: current.problem }"
          :aria-pressed="current.problem"
          :disabled="!editable"
          @click="toggleProblem"
        >
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Hay un problema
        </button>
      </Transition>
    </div>

    <Transition name="fade">
      <p v-if="miss('value')" class="q-miss"><i class="fa-solid fa-circle-exclamation" aria-hidden="true" /> Falta la respuesta</p>
    </Transition>

    <Transition name="reveal">
      <div v-if="novedad" class="q-more">
        <div class="field" :class="{ 'field--miss': miss('descripcion') }">
          <label :for="`d-${item.id}`">¿Qué encontraste?</label>
          <textarea
            :id="`d-${item.id}`"
            rows="2"
            :value="current.descripcion"
            :readonly="!editable"
            placeholder="Describe la novedad"
            @input="onText('descripcion', $event)"
          />
          <small v-if="miss('descripcion')" class="q-miss">Describe la novedad</small>
        </div>
        <div class="field" :class="{ 'field--miss': miss('accion') }">
          <label :for="`a-${item.id}`">¿Qué acción tomaste?</label>
          <textarea
            :id="`a-${item.id}`"
            rows="2"
            :value="current.accion"
            :readonly="!editable"
            placeholder="Lo que hiciste o a quién avisaste"
            @input="onText('accion', $event)"
          />
          <small v-if="miss('accion')" class="q-miss">Indica la acción tomada</small>
        </div>
        <div class="q-photos">
          <TransitionGroup name="list">
            <figure v-for="url in current.evidencia" :key="url" class="q-photo">
              <img :src="url" alt="Evidencia" />
              <button v-if="editable" type="button" aria-label="Quitar foto" @click="removePhoto(url)">
                <i class="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </figure>
          </TransitionGroup>
          <button
            v-if="editable && current.evidencia.length < 4"
            type="button"
            class="q-add-photo"
            :disabled="uploading"
            @click="photoInput?.click()"
          >
            <i class="fa-solid" :class="uploading ? 'fa-spinner fa-spin' : 'fa-camera'" aria-hidden="true" />
            {{ uploading ? 'Subiendo…' : 'Agregar foto (opcional)' }}
          </button>
          <input ref="photoInput" type="file" accept="image/*" capture="environment" hidden @change="onPhoto" />
        </div>
      </div>
    </Transition>

    <Transition name="reveal">
      <div v-if="current.value === 'na'" class="q-more">
        <div class="field" :class="{ 'field--miss': miss('motivo') }">
          <label :for="`m-${item.id}`">¿Por qué no aplica?</label>
          <div v-if="editable" class="q-chips">
            <button
              v-for="s in NA_SUGGESTIONS"
              :key="s"
              type="button"
              class="q-chip"
              :class="{ on: current.motivo === s }"
              @click="pickMotivo(s)"
            >
              {{ s }}
            </button>
          </div>
          <textarea
            :id="`m-${item.id}`"
            rows="2"
            :value="current.motivo"
            :readonly="!editable"
            placeholder="Escribe el motivo"
            @input="onText('motivo', $event)"
          />
          <small v-if="miss('motivo')" class="q-miss">Indica por qué no aplica</small>
        </div>
      </div>
    </Transition>
  </article>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.q {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1rem;
  border-left: 4px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  scroll-margin-top: 140px;

  @include tablet {
    padding: 1.1rem 1.25rem;
  }

  &--novedad {
    border-left-color: var(--warning);
  }

  &--na {
    border-left-color: var(--ink-400);
  }

  &--missing {
    border-left-color: var(--danger);
    box-shadow: 0 0 0 1.5px rgba(180, 72, 59, 0.35), var(--shadow);
  }
}

.q-head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.q-n {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-100);
  color: var(--navy-700);
  font-weight: 700;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

.q-text {
  min-width: 0;
}

.q-prompt {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.35;
}

.q-official {
  margin: 0.2rem 0 0;
  font-size: 0.76rem;
  color: var(--ink-400);
}

.q-options {
  margin-top: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.opt {
  min-height: 52px;
  min-width: 96px;
  padding: 0 1.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  border: 2px solid var(--cream-200);
  background: #fff;
  font-weight: 700;
  font-size: 1rem;
  color: var(--ink-600);
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.12s ease;

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    cursor: default;
  }

  &--si.on {
    background: var(--success);
    border-color: var(--success);
    color: #fff;
  }

  &--no.on {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }

  &--na.on {
    background: var(--ink-600);
    border-color: var(--ink-600);
    color: #fff;
  }

  &--problem {
    font-weight: 600;
    font-size: 0.92rem;
    color: #8a5d1d;
    border-style: dashed;

    &.on {
      background: rgba(185, 128, 47, 0.14);
      border-color: var(--warning);
      border-style: solid;
    }
  }
}

.q-miss {
  margin: 0.5rem 0 0;
  color: var(--danger);
  font-size: 0.82rem;
  font-weight: 600;
}

.q-more {
  margin-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px dashed var(--cream-200);

  textarea {
    resize: vertical;
    min-height: 64px;
  }
}

.field--miss textarea {
  border-color: rgba(180, 72, 59, 0.6);
}

.q-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.q-chip {
  min-height: 40px;
  padding: 0 0.85rem;
  border-radius: 999px;
  border: 1.5px solid var(--cream-200);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink-600);
  transition: background 0.14s ease, color 0.14s ease;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.q-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.q-photo {
  position: relative;
  margin: 0;
  width: 92px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  button {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(18, 30, 25, 0.7);
    color: #fff;
    font-size: 0.75rem;
  }
}

.q-add-photo {
  min-height: 48px;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--gold-400);
  color: var(--gold-500);
  font-weight: 600;
  font-size: 0.88rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
</style>
