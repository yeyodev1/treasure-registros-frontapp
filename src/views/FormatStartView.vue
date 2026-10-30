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
    <p class="eyebrow">{{ schema?.officialTitle ?? CODE }}</p>
    <h1 class="page-title">{{ pageTitle }}</h1>

    <SkeletonList v-if="loading" variant="card" :rows="3" />

    <div v-else-if="error" class="card state-error">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true" />
      <div>
        <p><strong>No se pudo abrir el formato.</strong> {{ error }}</p>
        <button type="button" class="btn btn-primary" @click="load">
          <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
        </button>
      </div>
    </div>

    <Transition v-else-if="schema" name="fade" mode="out-in">
    <section v-if="!showForm && ordered.length" key="continue" class="card resume">
      <h2>{{ card?.resumeTitle ?? 'Tienes un registro sin enviar' }}</h2>
      <RouterLink :to="`/registro/${ordered[0]!._id}`" class="btn btn-primary resume-main">
        <i class="fa-solid fa-play" aria-hidden="true" /> {{ continueLabel(ordered[0]!) }}
      </RouterLink>
      <p class="resume-meta">
        {{ formatActivity(ordered[0]!.context?.activityDate, ordered[0]!.context?.activityTime) }}
        <template v-if="ordered[0]!.context?.place"> · {{ ordered[0]!.context!.place }}</template>
        <template v-if="ordered[0]!.returnInfo"> · Devuelto: {{ ordered[0]!.returnInfo!.reason }}</template>
      </p>
      <TransitionGroup v-if="ordered.length > 1" tag="ul" name="list" appear class="resume-more">
        <li v-for="d in ordered.slice(1)" :key="d._id">
          <RouterLink :to="`/registro/${d._id}`" class="draft">
            <span class="draft-body">
              <strong>{{ continueLabel(d) }}</strong>
              <small>
                {{ formatActivity(d.context?.activityDate, d.context?.activityTime) }}
                <template v-if="d.context?.place"> · {{ d.context.place }}</template>
                · guardado {{ formatStamp(d.updatedAt) }}
              </small>
            </span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true" />
          </RouterLink>
        </li>
      </TransitionGroup>
      <div class="resume-new">
        <p>{{ otherQuestion }} Crea uno nuevo; el anterior queda guardado.</p>
        <button type="button" class="btn btn-ghost" @click="showForm = true">
          <i class="fa-solid fa-plus" aria-hidden="true" /> {{ newLabel }}
        </button>
      </div>
    </section>
    <div v-else key="form" class="cols">
      <section class="card main">
        <p class="notice">
          <i class="fa-solid fa-anchor" aria-hidden="true" />
          {{ schema.notice }}
        </p>
        <h2>Antes de empezar, confirma</h2>
        <GuidedContextForm
          v-model="ctx"
          :schema="schema"
          :account-name="userStore.user?.name ?? ''"
          :positions="catalog.positions"
          :missing="showMissing ? missing : undefined"
          editable
        />
        <div class="start">
          <button type="button" class="btn btn-gold" :disabled="creating" @click="start">
            <i class="fa-solid" :class="creating ? 'fa-spinner fa-spin' : 'fa-play'" aria-hidden="true" />
            {{ creating ? 'Abriendo…' : 'Empezar el chequeo' }}
          </button>
          <p>
            {{ schema.sections.length }} secciones · {{ schema.sections.reduce((n, s) => n + s.items.length, 0) }} puntos.
            Se guarda solo. Nada se envía hasta que firmes.
          </p>
        </div>
      </section>
    </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.back-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--ink-600);
  font-weight: 600;
  margin-bottom: 0.4rem;
}

.eyebrow {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold-500);
}

.cols {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);

  @include desktop {
    grid-template-columns: minmax(0, 1fr) 320px;
    align-items: start;
  }
}

.main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 760px;

  h2 {
    font-size: 1.2rem;
  }
}

.notice {
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

.start {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;

  .btn {
    min-height: 54px;
    padding: 0 1.6rem;
    font-size: 1.02rem;
  }

  p {
    margin: 0;
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.resume {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  max-width: 760px;

  h2 {
    font-size: 1.25rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    align-self: stretch;
  }
}

.resume-main {
  min-height: 56px;
  padding: 0 1.4rem;
  font-size: 1.05rem;
}

.resume-meta {
  margin: 0;
  color: var(--ink-600);
}

.resume-new {
  margin-top: 0.4rem;
  padding-top: 0.9rem;
  border-top: 1px dashed var(--cream-200);
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;

  p {
    margin: 0;
    color: var(--ink-600);
  }

  .btn {
    min-height: 48px;
  }
}

.side {
  h2 {
    font-size: 1rem;
    margin-bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;

    i {
      color: var(--gold-500);
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
}

.draft {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.4rem;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;

  &:hover {
    background: var(--powder-100);
  }

  i {
    color: var(--ink-400);
    font-size: 1rem;
  }
}

.draft-body {
  flex: 1;
  display: flex;
  flex-direction: column;

  small {
    color: var(--ink-400);
    font-size: 1rem;
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
