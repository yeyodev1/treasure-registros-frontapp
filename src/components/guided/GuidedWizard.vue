<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useConfirmStore } from '@/stores/confirm'
import { emptyAnswer, sectionProgress, validateGuided } from '@/utils/guided'
import QuestionCard from './QuestionCard.vue'
import GuidedContextForm, { type ContextDraft } from './GuidedContextForm.vue'
import GuidedSummary from './GuidedSummary.vue'
import BaseTimePicker from '@/components/ui/BaseTimePicker.vue'
import ReviewCard from '@/components/sign/ReviewCard.vue'
import type { IsmAnswer, IsmContext, IsmMissing, IsmReturnInfo, IsmSchema } from '@/types'

/**
 * Asistente por secciones del formato: contexto → Ronda → Previo al zarpe →
 * Previo al arribo → Fondeado → Revisa y firma. Se puede ir y volver sin
 * perder nada: cada respuesta se guarda al tocarla. "Siguiente" avisa en el
 * momento si quedan puntos sin responder (informe 29-oct, falla 5).
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
  sectionTime: [sectionId: string, time: string]
  /** Ir a firmar (pantalla 2). */
  sign: []
  pdf: []
}>()

const confirmStore = useConfirmStore()

const steps = computed(() => [
  { id: 'contexto', title: 'Contexto', icon: 'fa-ship' },
  ...props.schema.sections.map((s) => ({ id: s.id, title: s.title, icon: 'fa-list-check' })),
  { id: 'revisar', title: 'Revisa y firma', icon: 'fa-signature' },
])

const missing = computed(() =>
  validateGuided(props.schema, props.answers, {
    ...(props.fullContext ?? {}),
    activityDate: props.context.activityDate,
    activityTime: props.context.activityTime,
    place: props.context.place,
    filledBy: {
      ...(props.fullContext?.filledBy ?? { user: '', accountName: '', role: '', position: '' }),
      name: props.context.name,
      position: props.context.position,
      fromList: Boolean(props.context.crewId),
    } as IsmContext['filledBy'],
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

/** Siguiente: si faltan puntos en la sección, se avisa ahora y no al final. */
async function next() {
  const s = currentSection.value
  if (s && props.editable) {
    const left = s.items.filter((i) => !props.answers[i.id]?.value)
    if (left.length) {
      const ok = await confirmStore.ask({
        title: left.length === 1 ? 'Te falta 1 punto. ¿Seguir igual?' : `Te faltan ${left.length} puntos. ¿Seguir igual?`,
        message: 'Puedes volver a esta sección después. Para firmar, los 30 puntos deben tener respuesta.',
        confirmLabel: 'Seguir igual',
        cancelLabel: 'Responder',
        icon: 'fa-circle-exclamation',
      })
      if (!ok) {
        go(step.value, left[0]!.id)
        return
      }
    }
  }
  go(step.value + 1)
}

const sectionTime = computed({
  get: () => (currentSection.value ? props.fullContext?.sectionTimes?.[currentSection.value.id] ?? '' : ''),
  set: (v: string) => {
    if (currentSection.value) emit('sectionTime', currentSection.value.id, v)
  },
})

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
    title: 'Esta sección no aplica hoy',
    message: `Los puntos de «${s.title}» que aún no respondiste quedan como «No aplica», con el mismo motivo. Puedes cambiar cualquiera después.`,
    confirmLabel: 'Marcar como no aplica',
    icon: 'fa-minus',
    reason: {
      label: '¿Por qué?',
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

const reviewContext = computed<Partial<IsmContext>>(() => ({
  ...(props.fullContext ?? {}),
  activityDate: props.context.activityDate,
  activityTime: props.context.activityTime,
  place: props.context.place,
  filledBy: {
    ...(props.fullContext?.filledBy as IsmContext['filledBy']),
    name: props.context.name,
    position: props.context.position,
    fromList: Boolean(props.context.crewId),
  },
}))

const positionOf = (v: string) => props.positions.find((p) => p.value === v)?.label ?? v
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
            <i class="fa-solid fa-minus" aria-hidden="true" /> Esta sección no aplica hoy
          </button>
        </header>
        <div class="wiz-time field">
          <label>¿A qué hora hiciste esta sección?</label>
          <BaseTimePicker v-if="editable" v-model="sectionTime" placeholder="Se pone sola al responder" />
          <p v-else>{{ sectionTime || '—' }}</p>
        </div>
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
        <h2 class="wiz-title">Revisa y firma</h2>
        <Transition name="fade" mode="out-in">
          <p v-if="missing.length" key="m" class="wiz-missing">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {{ missing.length === 1 ? 'Falta 1 dato' : `Faltan ${missing.length} datos` }}. Toca «Ir a la pregunta» para completarlos.
          </p>
          <p v-else key="ok" class="wiz-ready">
            Así va a quedar tu chequeo. Mira la novedad y, si está bien, firma abajo.
          </p>
        </Transition>
        <ReviewCard
          :schema="schema"
          :answers="answers"
          :context="reviewContext"
          :position-label="positionOf"
          :can-change="editable"
          @change="gotoMissing"
        />
        <section class="wiz-who card">
          <h3>¿Quién firma este registro?</h3>
          <p class="wiz-who-sub">Firman tres personas, una después de otra. Tú firmas primero.</p>
          <ol>
            <li>
              <span class="wiz-who-n now">1</span>
              <span><strong>Tú</strong><small>Confirmas que hiciste el chequeo</small></span>
              <span class="wiz-tag now">Ahora</span>
            </li>
            <li>
              <span class="wiz-who-n">2</span>
              <span><strong>Capitán</strong><small>Revisa y decide el zarpe. Firma desde su cuenta</small></span>
              <span class="wiz-tag">Después</span>
            </li>
            <li>
              <span class="wiz-who-n">3</span>
              <span><strong>Persona Designada</strong><small>Recibe en oficina y archiva. A bordo no hay que hacer nada</small></span>
              <span class="wiz-tag">Al final</span>
            </li>
          </ol>
        </section>
        <GuidedSummary
          v-if="missing.length"
          :schema="schema"
          :answers="answers"
          :context="reviewContext"
          :missing="missing"
          :position-label="positionOf"
          can-go-to
          @goto="gotoMissing"
        />
        <details v-else class="wiz-all">
          <summary>Ver todas las respuestas</summary>
          <GuidedSummary :schema="schema" :answers="answers" :context="reviewContext" :position-label="positionOf" />
        </details>
      </section>
    </Transition>

    <footer class="wiz-nav">
      <button type="button" class="btn btn-ghost" :disabled="step === 0" @click="go(step - 1)">
        <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Anterior
      </button>
      <button v-if="step < steps.length - 1" type="button" class="btn btn-primary" @click="next">
        {{ step === steps.length - 2 ? 'Revisa y firma' : 'Siguiente' }} <i class="fa-solid fa-arrow-right" aria-hidden="true" />
      </button>
      <div v-else-if="editable" class="wiz-sign">
        <button type="button" class="btn btn-ghost" :disabled="submitting" @click="emit('pdf')">
          <i class="fa-regular fa-file-pdf" aria-hidden="true" /> Ver cómo queda el PDF
        </button>
        <button type="button" class="btn btn-primary" :disabled="submitting || missing.length > 0" @click="emit('sign')">
          <i class="fa-solid fa-signature" aria-hidden="true" /> Firmar
        </button>
      </div>
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
  font-size: 1rem;
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
  font-size: 1rem;
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
  font-size: 1rem;

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
  font-size: 1rem;

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
  font-size: 1rem;
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
  font-size: 1rem;
}

.wiz-na {
  flex-shrink: 0;
  border-color: var(--cream-200);
  color: var(--ink-600);
}

.wiz-time {
  max-width: 320px;

  p {
    margin: 0;
    font-weight: 600;
  }
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
  font-size: 1rem;
}

.wiz-missing {
  color: var(--danger);
}

.wiz-ready {
  color: var(--success);
}

.wiz-who {
  h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  ol {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--cream-200);

    strong,
    small {
      display: block;
      font-size: 1rem;
    }

    small {
      color: var(--ink-600);
    }
  }
}

.wiz-who-sub {
  margin: 0.2rem 0 0;
  color: var(--ink-600);
}

.wiz-who-n {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  border: 2px solid var(--ink-400);
  color: var(--ink-600);

  &.now {
    background: var(--gold-500);
    border-color: var(--gold-500);
    color: #fff;
  }
}

.wiz-tag {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--powder-100);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-600);

  &.now {
    background: rgba(185, 128, 47, 0.18);
    color: #7a4f12;
  }
}

.wiz-all summary {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  font-weight: 700;
  color: var(--navy-800);
}

.wiz-sign {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
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
