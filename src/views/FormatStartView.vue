<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { apiCreateRecord, apiRecords } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { newKey } from '@/utils/format'
import { formatActivity, formatStamp, nowTimeGalapagos, todayGalapagos } from '@/utils/ism'
import GuidedContextForm, { type ContextDraft } from '@/components/guided/GuidedContextForm.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmRecord, IsmSchema } from '@/types'

/**
 * Inicio genérico de un formato guiado (/formato/:code/nuevo; /zarpe/nuevo es
 * el alias del R-14). Código, título, textos y la tarjeta salen del esquema
 * (plantilla, criterio 5 del informe).
 */
const route = useRoute()
const router = useRouter()
const CODE = computed(() => String(route.params.code ?? 'R-14'))
/** La clave de creación es por formato (un reintento no duplica). */
const KEY_STORAGE = computed(() => (CODE.value === 'R-14' ? 'ism.zarpe.key' : `ism.start.${CODE.value}.key`))
const userStore = useUserStore()
const catalog = useCatalogStore()
const toast = useToastStore()
const { play } = useSound()

const schema = shallowRef<IsmSchema | null>(null)
const drafts = shallowRef<IsmRecord[]>([])
const loading = shallowRef(true)
const error = shallowRef('')
const creating = shallowRef(false)
const showMissing = shallowRef(false)
/** Con un chequeo abierto, primero se ofrece continuarlo; "Nuevo zarpe" crea otro a propósito. */
const showForm = shallowRef(false)

const card = computed(() => schema.value?.card)
const pageTitle = computed(() => card.value?.title ?? schema.value?.title ?? CODE.value)
const newLabel = computed(() => card.value?.newLabel ?? 'Nuevo registro')
/** "Nuevo zarpe" → "¿Es otro zarpe?" */
const otherQuestion = computed(() => `¿Es otro ${newLabel.value.replace(/^nuevo\s+/i, '') || 'registro'}?`)

/** Primero los del día y los devueltos. */
const ordered = computed(() =>
  [...drafts.value].sort(
    (a, b) =>
      Number(Boolean(b.returnInfo)) - Number(Boolean(a.returnInfo)) ||
      Number(b.context?.activityDate === todayGalapagos()) - Number(a.context?.activityDate === todayGalapagos()),
  ),
)

function continueLabel(d: IsmRecord): string {
  const progress = d.flags ? ` (${d.flags.answered} de ${d.flags.total})` : ''
  if (d.returnInfo) return `Corregir el chequeo devuelto${progress}`
  return d.context?.activityDate === todayGalapagos() ? `Continuar el chequeo de hoy${progress}` : `Continuar el chequeo${progress}`
}

const ctx = ref<ContextDraft>({
  activityDate: todayGalapagos(),
  activityTime: nowTimeGalapagos(),
  place: '',
  name: '',
  position: '',
  crewId: '',
})

/** La misma clave mientras no se cree: un reintento (doble toque, sin señal) no duplica. */
function creationKey(): string {
  try {
    const saved = sessionStorage.getItem(KEY_STORAGE.value)
    if (saved) return saved
    const key = newKey()
    sessionStorage.setItem(KEY_STORAGE.value, key)
    return key
  } catch {
    return newKey()
  }
}

const missing = computed(() => {
  const m = new Set<string>()
  if (!ctx.value.activityDate) m.add('activityDate')
  if (!ctx.value.activityTime) m.add('activityTime')
  if (!ctx.value.place.trim()) m.add('place')
  if (!ctx.value.crewId) m.add('name')
  if (!ctx.value.position) m.add('position')
  return m
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    await catalog.load()
    const version = catalog.byCode.get(CODE.value)?.guidedVersion
    if (!version) {
      schema.value = null
      error.value = `El formato ${CODE.value} no tiene llenado paso a paso. Ábrelo desde «Todos los formatos».`
      return
    }
    const [s, list] = await Promise.all([
      catalog.schema(CODE.value, version),
      apiRecords({ code: CODE.value, status: 'borrador', mine: '1', limit: 10 }),
    ])
    schema.value = s
    drafts.value = list.records
    showForm.value = !list.records.length
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(CODE, load)

async function start() {
  if (missing.value.size) {
    showMissing.value = true
    return
  }
  creating.value = true
  try {
    const rec = await apiCreateRecord({
      code: CODE.value,
      recordDate: ctx.value.activityDate,
      idempotencyKey: creationKey(),
      context: { ...ctx.value, confirmed: true },
    })
    try {
      sessionStorage.removeItem(KEY_STORAGE.value)
    } catch {
      // nada
    }
    play('success')
    router.replace(`/registro/${rec._id}`)
  } catch (err) {
    play('error')
    toast.error(apiErrorMessage(err))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page zarpe">
    <button type="button" class="back-link" @click="router.push('/')">
      <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Mis tareas
    </button>
    <header class="zarpe-head">
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-lead">{{ schema?.officialTitle ?? CODE }}</p>
    </header>

    <SkeletonList v-if="loading" variant="card" :rows="3" />

    <div v-else-if="error" class="card state-error" role="alert">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true" />
      <div>
        <p><strong>No se pudo abrir el formato.</strong> {{ error }}</p>
        <button type="button" class="btn btn-primary" @click="load">
          <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
        </button>
      </div>
    </div>

    <Transition v-else-if="schema" name="fade" mode="out-in">
      <div v-if="!showForm && ordered.length" key="continue" class="resume">
        <section class="card resume-main" :class="{ 'is-returned': ordered[0]!.returnInfo }" aria-labelledby="h-resume">
          <h2 id="h-resume">{{ card?.resumeTitle ?? 'Tienes un registro sin enviar' }}</h2>
          <p class="resume-meta">
            {{ formatActivity(ordered[0]!.context?.activityDate, ordered[0]!.context?.activityTime) }}
            <template v-if="ordered[0]!.context?.place"> · {{ ordered[0]!.context!.place }}</template>
            <template v-if="ordered[0]!.context?.filledBy?.name"> · {{ ordered[0]!.context!.filledBy!.name }}</template>
          </p>
          <p v-if="ordered[0]!.returnInfo" class="resume-returned">
            <i class="fa-solid fa-rotate-left" aria-hidden="true" />
            <span>
              <strong>Te lo devolvieron.</strong>
              {{ ordered[0]!.returnInfo!.reason }}
            </span>
          </p>
          <div v-if="ordered[0]!.flags" class="resume-progress">
            <span class="bar"><span :style="{ width: `${(ordered[0]!.flags!.answered / Math.max(1, ordered[0]!.flags!.total)) * 100}%` }" /></span>
            <span class="num">{{ ordered[0]!.flags!.answered }} de {{ ordered[0]!.flags!.total }} puntos</span>
          </div>
          <RouterLink :to="`/registro/${ordered[0]!._id}`" class="btn btn-primary btn-lg resume-btn">
            {{ continueLabel(ordered[0]!) }} <i class="fa-solid fa-arrow-right" aria-hidden="true" />
          </RouterLink>
        </section>

        <section v-if="ordered.length > 1" class="card resume-more" aria-labelledby="h-more">
          <h2 id="h-more">También sin enviar</h2>
          <TransitionGroup tag="ul" name="list" appear>
            <li v-for="d in ordered.slice(1)" :key="d._id">
              <RouterLink :to="`/registro/${d._id}`" class="draft">
                <span class="draft-body">
                  <strong>{{ continueLabel(d) }}</strong>
                  <small>
                    {{ formatActivity(d.context?.activityDate, d.context?.activityTime) }}
                    <template v-if="d.context?.place"> · {{ d.context.place }}</template>
                    <template v-if="d.context?.filledBy?.name"> · {{ d.context.filledBy.name }}</template>
                  </small>
                  <small>Guardado {{ formatStamp(d.updatedAt) }}</small>
                </span>
                <span class="draft-go">Abrir <i class="fa-solid fa-chevron-right" aria-hidden="true" /></span>
              </RouterLink>
            </li>
          </TransitionGroup>
        </section>

        <section class="resume-new" aria-labelledby="h-new">
          <h2 id="h-new">{{ otherQuestion }}</h2>
          <p>Crea uno nuevo. El anterior queda guardado.</p>
          <button type="button" class="btn btn-ghost" @click="showForm = true">
            <i class="fa-solid fa-plus" aria-hidden="true" /> {{ newLabel }}
          </button>
        </section>
      </div>

      <section v-else key="form" class="card main" aria-labelledby="h-start">
        <p class="notice">
          <i class="fa-solid fa-anchor" aria-hidden="true" />
          <span>{{ schema.notice }}</span>
        </p>
        <h2 id="h-start">Antes de empezar, confirma</h2>
        <GuidedContextForm
          v-model="ctx"
          :schema="schema"
          :account-name="userStore.user?.name ?? ''"
          :positions="catalog.positions"
          :missing="showMissing ? missing : undefined"
          editable
        />
        <div class="start">
          <p v-if="showMissing && missing.size" class="start-miss" role="alert">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true" /> Falta completar lo marcado en rojo.
          </p>
          <button type="button" class="btn btn-primary btn-lg" :disabled="creating" @click="start">
            <i class="fa-solid" :class="creating ? 'fa-spinner fa-spin' : 'fa-play'" aria-hidden="true" />
            {{ creating ? 'Abriendo…' : 'Empezar el chequeo' }}
          </button>
          <p class="start-facts">
            {{ schema.sections.length }} secciones · {{ schema.sections.reduce((n, s) => n + s.items.length, 0) }} puntos.
          </p>
          <p class="start-facts">Se guarda solo. Nada se envía hasta que firmes.</p>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.back-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--navy-800);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.zarpe-head {
  margin-bottom: 1.5rem;
}

.main,
.resume {
  max-width: 780px;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  h2 {
    font-size: 1.4rem;
  }
}

// Aviso del formato: la decisión de zarpar es del Capitán.
.notice {
  margin: 0;
  display: flex;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--powder-100);
  color: var(--navy-900);
  font-weight: 500;
  line-height: 1.45;

  i {
    margin-top: 0.25rem;
    color: var(--navy-700);
  }
}

.start {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
  padding-top: 0.5rem;

  .btn {
    min-width: 260px;
    margin-bottom: 0.35rem;
  }
}

.start-facts {
  margin: 0;
  color: var(--ink-600);
}

.start-miss {
  margin: 0 0 0.25rem;
  color: var(--danger);
  font-weight: 600;
}

.resume {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.resume-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;

  h2 {
    font-size: 1.5rem;
  }

  &.is-returned {
    box-shadow: inset 4px 0 0 var(--danger);
  }
}

.resume-meta {
  margin: 0;
  color: var(--ink-600);
}

.resume-returned {
  margin: 0.2rem 0;
  display: flex;
  gap: 0.6rem;
  padding: 0.8rem 0.95rem;
  border-radius: var(--radius-sm);
  background: var(--danger-100);
  color: var(--ink-900);
  align-self: stretch;

  i {
    margin-top: 0.3rem;
    color: var(--danger);
  }

  strong {
    color: var(--danger);
  }
}

.resume-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--ink-600);

  .bar {
    width: 200px;
  }
}

.bar {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--powder-100);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--navy-700);
  }
}

.resume-btn {
  margin-top: 0.5rem;
  min-width: 300px;

  @media (max-width: 480px) {
    min-width: 0;
    width: 100%;
  }
}

.resume-more {
  h2 {
    font-size: 1.25rem;
    margin-bottom: 0.4rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li + li {
    border-top: 1px solid var(--line);
  }
}

.draft {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }
}

.draft-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;

  strong {
    font-weight: 600;
  }

  small {
    color: var(--ink-600);
    font-size: 1rem;
  }
}

.draft-go {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
  color: var(--navy-800);

  i {
    font-size: 0.8rem;
  }
}

.resume-new {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0 0 0.4rem;
    color: var(--ink-600);
  }
}

.state-error {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  max-width: 640px;

  > i {
    font-size: 1.4rem;
    color: var(--warning);
    margin-top: 0.2rem;
  }

  p {
    margin: 0 0 0.7rem;
  }
}
</style>
