<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useConfirmStore } from '@/stores/confirm'
import { emptyAnswer, sectionProgress, validateGuided } from '@/utils/guided'
import QuestionCard from './QuestionCard.vue'
import GuidedContextForm, { type ContextDraft } from './GuidedContextForm.vue'
import GuidedSummary from './GuidedSummary.vue'
import type { IsmAnswer, IsmContext, IsmMissing, IsmReturnInfo, IsmSchema } from '@/types'

/**
 * Asistente por secciones del formato: contexto → Ronda → Previo al zarpe →
 * Previo al arribo → Fondeado → Revisar y enviar. Se puede ir y volver sin
 * perder nada: cada respuesta se guarda al tocarla.
 */
const props = defineProps<{
  schema: IsmSchema
  answers: Record<string, IsmAnswer>
  context: ContextDraft
  fullContext: IsmContext | null
  accountName: string
  positions: Array<{ value: string; label: string }>
  editable: boolean
  submitting: boolean
  returnInfo?: IsmReturnInfo | null
  /** Faltantes que devolvió el servidor al intentar enviar. */
  serverMissing?: IsmMissing[]
  syncLabel?: string
}>()

const emit = defineEmits<{
  answer: [id: string, answer: IsmAnswer]
  context: [value: ContextDraft]
  submit: []
}>()

const confirmStore = useConfirmStore()

const steps = computed(() => [
  { id: 'contexto', title: 'Contexto', icon: 'fa-ship' },
  ...props.schema.sections.map((s) => ({ id: s.id, title: s.title, icon: 'fa-list-check' })),
  { id: 'revisar', title: 'Revisar y enviar', icon: 'fa-paper-plane' },
])

const missing = computed(() =>
  validateGuided(props.schema, props.answers, {
    ...(props.fullContext ?? {}),
    activityDate: props.context.activityDate,
    activityTime: props.context.activityTime,
    place: props.context.place,
    filledBy: { ...(props.fullContext?.filledBy ?? { user: '', accountName: '', role: '', position: '' }), name: props.context.name, position: props.context.position } as IsmContext['filledBy'],
  }),
)

/** Los faltantes se señalan después de intentar revisar (no asustan al empezar). */
const showMissing = shallowRef(false)

function missingFor(itemId: string): Set<string> | undefined {
  if (!showMissing.value) return undefined
  const fields = missing.value.filter((m) => m.item === itemId).map((m) => m.field)
  return fields.length ? new Set(fields) : undefined
}

const contextMissing = computed(() =>
  showMissing.value ? new Set(missing.value.filter((m) => m.section === 'contexto').map((m) => m.field)) : undefined,
)

const answeredTotal = computed(() => {
  let done = 0
  let total = 0
  for (const s of props.schema.sections) {
    const p = sectionProgress(s, props.answers)
    done += p.done
    total += p.total
  }
  return { done, total }
})

function stepState(id: string): 'done' | 'partial' | 'todo' | 'miss' {
  if (id === 'revisar') return missing.value.length ? 'todo' : 'done'
  const sectionMiss = missing.value.filter((m) => m.section === id)
  if (id === 'contexto') return sectionMiss.length ? (showMissing.value ? 'miss' : 'todo') : 'done'
  const s = props.schema.sections.find((x) => x.id === id)!
  const p = sectionProgress(s, props.answers)
  if (showMissing.value && sectionMiss.length) return 'miss'
  if (p.done === p.total && !sectionMiss.length) return 'done'
  return p.done ? 'partial' : 'todo'
}

/** Empieza donde hace falta: la sección devuelta, o la primera incompleta. */
function initialStep(): number {
  if (props.returnInfo?.section) {
    const i = steps.value.findIndex((s) => s.title === props.returnInfo!.section)
    if (i >= 0) return i
  }
  if (!props.fullContext?.confirmedAt && missing.value.some((m) => m.section === 'contexto')) return 0
  const firstOpen = props.schema.sections.findIndex((s) => sectionProgress(s, props.answers).done < s.items.length)
  return firstOpen >= 0 ? firstOpen + 1 : steps.value.length - 1
}

const step = shallowRef(initialStep())
const direction = shallowRef<'next' | 'prev'>('next')
const currentSection = computed(() => (step.value >= 1 && step.value <= props.schema.sections.length ? props.schema.sections[step.value - 1]! : null))

async function go(i: number, itemId?: string) {
  if (i < 0 || i >= steps.value.length) return
  direction.value = i >= step.value ? 'next' : 'prev'
  step.value = i
  if (i === steps.value.length - 1) showMissing.value = true
  await nextTick()
  if (itemId) {
    setTimeout(() => document.getElementById(`q-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260)
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function gotoMissing(sectionId: string, itemId: string) {
  const i = steps.value.findIndex((s) => s.id === sectionId)
  go(i >= 0 ? i : 0, itemId || undefined)
}

watch(
  () => props.serverMissing,
  (list) => {
    if (list?.length) showMissing.value = true
  },
)

async function sectionNotApplicable() {
  const s = currentSection.value
  if (!s) return
  const reason = await confirmStore.askReason({
    title: `¿«${s.title}» no aplica?`,
    message: 'Se marcan como «No aplica» los puntos de esta sección que aún no respondiste, con el mismo motivo. Puedes cambiar cualquiera después.',
    confirmLabel: 'Marcar como no aplica',
    icon: 'fa-minus',
    reason: {
      label: 'Motivo (obligatorio)',
      suggestions: ['No corresponde a esta maniobra', 'El barco está en puerto', 'El barco no está fondeado'],
    },
  })
  if (!reason) return
  for (const item of s.items) {
    if (!item.allowNa || props.answers[item.id]?.value) continue
    emit('answer', item.id, { ...emptyAnswer(), value: 'na', motivo: reason })
  }
}

const sectionAllowsNa = computed(() => currentSection.value?.items.some((i) => i.allowNa && !props.answers[i.id]?.value) ?? false)

const RETURN_HINT = computed(() => props.returnInfo)
</script>

<template>
  <div class="wiz">
    <div class="wiz-top">
      <div class="wiz-progress" role="progressbar" :aria-valuenow="answeredTotal.done" :aria-valuemax="answeredTotal.total">
        <span :style="{ width: `${(answeredTotal.done / Math.max(1, answeredTotal.total)) * 100}%` }" />
      </div>
      <p class="wiz-count">
        {{ answeredTotal.done }} de {{ answeredTotal.total }} puntos respondidos
        <span v-if="syncLabel" class="wiz-sync">· {{ syncLabel }}</span>
      </p>
      <nav class="wiz-steps" aria-label="Secciones">
        <button
          v-for="(s, i) in steps"
          :key="s.id"
          type="button"
          class="wiz-step"
          :class="[`st-${stepState(s.id)}`, { active: i === step }]"
          :aria-current="i === step ? 'step' : undefined"
          @click="go(i)"
        >
          <span class="wiz-dot">
            <i
              class="fa-solid"
              :class="stepState(s.id) === 'done' ? 'fa-check' : stepState(s.id) === 'miss' ? 'fa-exclamation' : s.icon"
              aria-hidden="true"
            />
          </span>
          <span class="wiz-step-title">{{ s.title }}</span>
        </button>
      </nav>
    </div>

    <Transition name="fade">
      <p v-if="RETURN_HINT" class="wiz-returned">
        <i class="fa-solid fa-rotate-left" aria-hidden="true" />
        <span>
          Devuelto por {{ RETURN_HINT.byName }} · sección <strong>{{ RETURN_HINT.section }}</strong>: {{ RETURN_HINT.reason }}
        </span>
      </p>
    </Transition>

    <Transition :name="`step-${direction}`" mode="out-in">
      <section v-if="step === 0" key="ctx" class="wiz-body">
        <h2 class="wiz-title">Confirma el contexto</h2>
        <GuidedContextForm
          :schema="schema"
          :model-value="context"
          :account-name="accountName"
          :positions="positions"
          :editable="editable"
          :missing="contextMissing"
          @update:model-value="emit('context', $event)"
        />
      </section>

      <section v-else-if="currentSection" :key="currentSection.id" class="wiz-body">
        <header class="wiz-sec-head">
          <div>
            <p class="wiz-eyebrow">Sección {{ step }} de {{ schema.sections.length }} · {{ sectionProgress(currentSection, answers).done }}/{{ currentSection.items.length }}</p>
            <h2 class="wiz-title">{{ currentSection.title }}</h2>
            <p v-if="currentSection.hint" class="wiz-hint">{{ currentSection.hint }}</p>
          </div>
          <button v-if="editable && sectionAllowsNa" type="button" class="btn btn-ghost wiz-na" @click="sectionNotApplicable">
            <i class="fa-solid fa-minus" aria-hidden="true" /> Esta sección no aplica
          </button>
        </header>
        <div class="wiz-questions">
          <QuestionCard
            v-for="item in currentSection.items"
            :key="item.id"
            :item="item"
            :answer="answers[item.id]"
            :editable="editable"
            :missing="missingFor(item.id)"
            @update="emit('answer', item.id, $event)"
          />
        </div>
      </section>

      <section v-else key="review" class="wiz-body">
        <h2 class="wiz-title">Revisar y enviar</h2>
        <p class="wiz-notice">
          <i class="fa-solid fa-anchor" aria-hidden="true" />
          {{ schema.notice }}
        </p>
        <Transition name="fade" mode="out-in">
          <p v-if="missing.length" key="m" class="wiz-missing">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {{ missing.length === 1 ? 'Falta 1 dato' : `Faltan ${missing.length} datos` }}. Toca «Ir a la pregunta» para completarlos.
          </p>
          <p v-else key="ok" class="wiz-ready">
            <i class="fa-solid fa-circle-check" aria-hidden="true" /> Todo respondido. Revisa el resumen y envía al Capitán.
          </p>
        </Transition>
        <GuidedSummary
          :schema="schema"
          :answers="answers"
          :context="{ ...(fullContext ?? {}), activityDate: context.activityDate, activityTime: context.activityTime, place: context.place, filledBy: { ...(fullContext?.filledBy as IsmContext['filledBy']), name: context.name, position: context.position } }"
          :missing="missing"
          :position-label="(v: string) => positions.find((p) => p.value === v)?.label ?? v"
          can-go-to
          @goto="gotoMissing"
        />
      </section>
    </Transition>

    <footer class="wiz-nav">
      <button type="button" class="btn btn-ghost" :disabled="step === 0" @click="go(step - 1)">
        <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Anterior
      </button>
      <button v-if="step < steps.length - 1" type="button" class="btn btn-primary" @click="go(step + 1)">
        {{ step === steps.length - 2 ? 'Revisar y enviar' : 'Siguiente' }} <i class="fa-solid fa-arrow-right" aria-hidden="true" />
      </button>
      <button
        v-else-if="editable"
        type="button"
        class="btn btn-gold"
        :disabled="submitting || missing.length > 0"
        @click="emit('submit')"
      >
        <i class="fa-solid" :class="submitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'" aria-hidden="true" />
        {{ submitting ? 'Enviando…' : 'Enviar al Capitán' }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.wiz {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.wiz-top {
  position: sticky;
  top: calc(64px + env(safe-area-inset-top));
  z-index: 10;
  background: var(--bg);
  padding: 0.6rem 0 0.4rem;
  margin-top: -0.6rem;
}

.wiz-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--cream-200);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--gold-500);
    border-radius: inherit;
    transition: width 0.4s ease;
  }
}

.wiz-count {
  margin: 0.35rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.wiz-sync {
  color: var(--ink-400);
}

.wiz-steps {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 0.15rem;
}

.wiz-step {
  flex-shrink: 0;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.85rem 0 0.4rem;
  border-radius: 999px;
  border: 1.5px solid var(--cream-200);
  background: var(--surface);
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--ink-600);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;

  &.active {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.wiz-dot {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-100);
  color: var(--navy-700);
  font-size: 0.75rem;

  .st-done & {
    background: var(--success);
    color: #fff;
  }

  .st-partial & {
    background: rgba(159, 107, 60, 0.2);
    color: var(--gold-500);
  }

  .st-miss & {
    background: var(--danger);
    color: #fff;
  }
}

.wiz-returned {
  margin: 0;
  display: flex;
  gap: 0.5rem;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-sm);
  background: rgba(180, 72, 59, 0.08);
  border: 1px solid rgba(180, 72, 59, 0.3);
  font-size: 0.9rem;

  i {
    margin-top: 0.2rem;
    color: var(--danger);
  }
}

.wiz-body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.wiz-sec-head {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  @include tablet {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
}

.wiz-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold-500);
}

.wiz-title {
  font-size: 1.4rem;

  @include tablet {
    font-size: 1.6rem;
  }
}

.wiz-hint {
  margin: 0.25rem 0 0;
  color: var(--ink-600);
  font-size: 0.92rem;
}

.wiz-na {
  flex-shrink: 0;
  border-color: var(--cream-200);
  color: var(--ink-600);
}

.wiz-questions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.wiz-notice {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  padding: 0.8rem 0.95rem;
  border-radius: var(--radius-sm);
  background: var(--navy-800);
  color: var(--cream-100);
  font-weight: 600;
  line-height: 1.4;

  i {
    margin-top: 0.2rem;
    color: var(--gold-400);
  }
}

.wiz-missing,
.wiz-ready {
  margin: 0;
  font-weight: 600;
  font-size: 0.92rem;
}

.wiz-missing {
  color: var(--danger);
}

.wiz-ready {
  color: var(--success);
}

.wiz-nav {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0 calc(0.75rem + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--bg) 70%, transparent);

  .btn {
    min-height: 52px;
    min-width: 150px;
  }
}
</style>
