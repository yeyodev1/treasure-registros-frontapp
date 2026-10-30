<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { apiCreateRecord, apiRecords } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { newKey } from '@/utils/format'
import { formatStamp, nowTimeGalapagos, todayGalapagos } from '@/utils/ism'
import GuidedContextForm, { type ContextDraft } from '@/components/guided/GuidedContextForm.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmRecord, IsmSchema } from '@/types'

const CODE = 'R-14'
const KEY_STORAGE = 'ism.zarpe.key'

const router = useRouter()
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

const ctx = ref<ContextDraft>({
  activityDate: todayGalapagos(),
  activityTime: nowTimeGalapagos(),
  place: '',
  name: userStore.user?.name ?? '',
  position: userStore.user?.position ?? '',
})

/** La misma clave mientras no se cree: un reintento (doble toque, sin señal) no duplica. */
function creationKey(): string {
  try {
    const saved = sessionStorage.getItem(KEY_STORAGE)
    if (saved) return saved
    const key = newKey()
    sessionStorage.setItem(KEY_STORAGE, key)
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
  if (!ctx.value.name.trim()) m.add('name')
  if (!ctx.value.position) m.add('position')
  return m
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    await catalog.load()
    const version = catalog.byCode.get(CODE)?.guidedVersion ?? 1
    const [s, list] = await Promise.all([
      catalog.schema(CODE, version),
      apiRecords({ code: CODE, status: 'borrador', mine: '1', limit: 10 }),
    ])
    schema.value = s
    drafts.value = list.records
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function start() {
  if (missing.value.size) {
    showMissing.value = true
    return
  }
  creating.value = true
  try {
    const rec = await apiCreateRecord({
      code: CODE,
      recordDate: ctx.value.activityDate,
      idempotencyKey: creationKey(),
      context: { ...ctx.value, confirmed: true },
    })
    try {
      sessionStorage.removeItem(KEY_STORAGE)
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
    <p class="eyebrow">R-14 · Chequeo previo al zarpe y rondas de seguridad</p>
    <h1 class="page-title">Preparar el zarpe</h1>

    <SkeletonList v-if="loading" variant="card" :rows="3" />

    <div v-else-if="error" class="card state-error">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true" />
      <div>
        <p><strong>No se pudo cargar el chequeo.</strong> {{ error }}</p>
        <button type="button" class="btn btn-primary" @click="load">
          <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
        </button>
      </div>
    </div>

    <div v-else-if="schema" class="cols">
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
            Se guarda solo; nada se envía hasta que toques «Enviar al Capitán».
          </p>
        </div>
      </section>

      <aside v-if="drafts.length" class="card side">
        <h2><i class="fa-solid fa-pen-to-square" aria-hidden="true" /> Continuar un chequeo</h2>
        <TransitionGroup tag="ul" name="list" appear>
          <li v-for="d in drafts" :key="d._id">
            <RouterLink :to="`/registro/${d._id}`" class="draft">
              <span class="draft-body">
                <strong>{{ d.context?.place || 'Sin lugar' }} · {{ d.context?.activityTime || '—' }}</strong>
                <small>
                  {{ d.flags ? `${d.flags.answered}/${d.flags.total} respondidos` : '' }}
                  <template v-if="d.returnInfo"> · Devuelto</template>
                  · {{ formatStamp(d.updatedAt) }}
                </small>
              </span>
              <i class="fa-solid fa-chevron-right" aria-hidden="true" />
            </RouterLink>
          </li>
        </TransitionGroup>
      </aside>
    </div>
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
  font-size: 0.72rem;
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
    font-size: 0.82rem;
    color: var(--ink-600);
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
    font-size: 0.75rem;
  }
}

.draft-body {
  flex: 1;
  display: flex;
  flex-direction: column;

  small {
    color: var(--ink-400);
    font-size: 0.76rem;
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
