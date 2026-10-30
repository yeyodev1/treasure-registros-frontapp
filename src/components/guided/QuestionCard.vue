<script setup lang="ts">
import { computed, reactive, shallowRef, useTemplateRef } from 'vue'
import { apiUploadPhoto } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { useToastStore } from '@/stores/toast'
import { emptyAnswer, hasNovedad } from '@/utils/guided'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import type { AnswerValue, IsmAnswer, IsmSchemaItem } from '@/types'

/**
 * Un punto del chequeo: respuesta explícita Sí · No · No aplica (nada viene
 * marcado). "No" abre qué encontraste y qué hiciste (con seguimiento
 * opcional); "No aplica" pide por qué. El texto del formato queda plegado.
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
const memory = reactive({
  descripcion: '',
  accion: '',
  motivo: '',
  evidencia: [] as string[],
  responsable: '',
  plazo: '',
  estado: '' as IsmAnswer['estado'],
})

function emitWith(patch: Partial<IsmAnswer>) {
  const next = { ...current.value, ...patch }
  // Solo "No" es novedad (ya no existe "Hay un problema").
  next.problem = false
  if (next.value !== 'no') {
    if (current.value.descripcion) memory.descripcion = current.value.descripcion
    if (current.value.accion) memory.accion = current.value.accion
    if (current.value.evidencia.length) memory.evidencia = current.value.evidencia
    if (current.value.responsable) memory.responsable = current.value.responsable
    if (current.value.plazo) memory.plazo = current.value.plazo
    if (current.value.estado) memory.estado = current.value.estado
    next.descripcion = ''
    next.accion = ''
    next.evidencia = []
    delete next.responsable
    delete next.plazo
    delete next.estado
  } else {
    next.descripcion = next.descripcion || memory.descripcion
    next.accion = next.accion || memory.accion
    next.evidencia = next.evidencia.length ? next.evidencia : memory.evidencia
    if (!next.responsable && memory.responsable) next.responsable = memory.responsable
    if (!next.plazo && memory.plazo) next.plazo = memory.plazo
    if (!next.estado && memory.estado) next.estado = memory.estado
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
  emitWith({ value })
}

function onText(field: 'descripcion' | 'accion' | 'motivo' | 'responsable', e: Event) {
  emit('update', { ...current.value, [field]: (e.target as HTMLTextAreaElement).value })
}

function setFollow(patch: Pick<IsmAnswer, 'plazo' | 'estado'>) {
  if (!props.editable) return
  emit('update', { ...current.value, ...patch })
}

const plazo = computed({
  get: () => current.value.plazo ?? '',
  set: (v: string) => setFollow({ plazo: v }),
})

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
        <details class="q-official">
          <summary>Ver texto del formato</summary>
          <p>{{ item.official }}</p>
        </details>
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
          <label :for="`a-${item.id}`">¿Qué hiciste?</label>
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
        <details class="q-follow" :open="Boolean(current.responsable || current.plazo || current.estado)">
          <summary>Seguimiento de la novedad (opcional)</summary>
          <div class="q-follow-grid">
            <div class="field">
              <label :for="`r-${item.id}`">¿Quién la resuelve?</label>
              <input
                :id="`r-${item.id}`"
                :value="current.responsable ?? ''"
                :readonly="!editable"
                placeholder="Nombre o cargo"
                @input="onText('responsable', $event)"
              />
            </div>
            <div class="field">
              <label>¿Para cuándo?</label>
              <BaseDatePicker v-if="editable" v-model="plazo" />
              <p v-else class="q-ro">{{ current.plazo || '—' }}</p>
            </div>
            <div class="field q-follow-state">
              <label>¿Quedó resuelta?</label>
              <div class="q-chips">
                <button
                  type="button"
                  class="q-chip"
                  :class="{ on: current.estado !== 'cerrada' }"
                  :disabled="!editable"
                  @click="setFollow({ estado: 'abierta' })"
                >
                  No, sigue abierta
                </button>
                <button
                  type="button"
                  class="q-chip"
                  :class="{ on: current.estado === 'cerrada' }"
                  :disabled="!editable"
                  @click="setFollow({ estado: 'cerrada' })"
                >
                  Sí, quedó cerrada
                </button>
              </div>
            </div>
          </div>
        </details>
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

// Un punto: la pregunta arriba, las tres respuestas grandes debajo. El
// borde izquierdo dice el estado: novedad, no aplica o falta responder.
.q {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1rem 1rem 1.1rem;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  scroll-margin-top: 180px;

  @include tablet {
    padding: 1.15rem 1.35rem 1.25rem;
  }

  &--novedad {
    box-shadow: inset 4px 0 0 var(--warning);
  }

  &--na {
    box-shadow: inset 4px 0 0 var(--ink-400);
  }

  &--missing {
    border-color: var(--danger);
    box-shadow: inset 4px 0 0 var(--danger);
  }
}

.q-head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.q-n {
  flex-shrink: 0;
  min-width: 2rem;
  padding-top: 0.05rem;
  color: var(--ink-400);
  font-weight: 600;
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.q-text {
  min-width: 0;
}

.q-prompt {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 600;
  line-height: 1.4;
}

.q-official {
  margin: 0.15rem 0 0;
  font-size: 1rem;
  color: var(--ink-600);

  summary {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    color: var(--ink-600);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--line-strong);
  }

  p {
    margin: 0 0 0.3rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--bg);
  }
}

.q-follow summary {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  color: var(--ink-600);
}

.q-follow-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(0, 1fr);

  @include tablet {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.q-follow-state {
  @include tablet {
    grid-column: 1 / -1;
  }
}

.q-ro {
  margin: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
}

.q-options {
  margin-top: 0.75rem;
  margin-left: 2.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;

  @media (max-width: 480px) {
    margin-left: 0;

    .opt {
      flex: 1;
      min-width: 0;
    }
  }
}

.opt {
  min-height: 56px;
  min-width: 120px;
  padding: 0 1.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: #fff;
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--ink-900);
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.12s ease;

  &:hover:not(:disabled):not(.on) {
    border-color: var(--navy-600);
    background: var(--hover);
  }

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

}

.q-miss {
  margin: 0.5rem 0 0;
  color: var(--danger);
  font-size: 1rem;
  font-weight: 600;
}

.q-more {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);

  textarea {
    resize: vertical;
    min-height: 64px;
  }
}

.field--miss textarea {
  border-color: var(--danger);
}

.q-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.q-chip {
  min-height: 48px;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: #fff;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-900);
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
  width: 112px;
  height: 84px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--line);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  button {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(18, 30, 25, 0.7);
    color: #fff;
    font-size: 1rem;
  }
}

.q-add-photo {
  min-height: 48px;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
  background: #fff;
  color: var(--navy-800);
  font-weight: 600;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
</style>
