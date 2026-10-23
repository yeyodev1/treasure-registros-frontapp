<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useCatalogStore } from '@/stores/catalog'
import { useToastStore } from '@/stores/toast'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { apiPdfUrl, apiRecords } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { STATUS_LABELS } from '@/utils/ism'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import RecordRow from '@/components/registros/RecordRow.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import type { IsmRecord, IsmStatus } from '@/types'

const catalog = useCatalogStore()
const toast = useToastStore()

const code = shallowRef('')
const status = shallowRef('archivado')
const from = shallowRef('')
const to = shallowRef('')
const position = shallowRef('')
const equipment = shallowRef('')
const q = shallowRef('')

const records = shallowRef<IsmRecord[]>([])
const hasMore = shallowRef(false)
const loading = shallowRef(true)
const loadingMore = shallowRef(false)
const sentinel = useTemplateRef<HTMLElement>('sentinel')

const codeOptions = computed(() => [
  { value: '', label: 'Todos los formatos' },
  ...catalog.forms.map((f) => ({ value: f.code, label: `${f.code.replace('_', ' · ')} · ${f.title}` })),
])
const statusOptions = [
  { value: '', label: 'Todos los estados' },
  ...(Object.keys(STATUS_LABELS) as IsmStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
]
const positionOptions = computed(() => [{ value: '', label: 'Todos los cargos' }, ...catalog.positions])
const equipmentOptions = computed(() => [
  { value: '', label: 'Todos los equipos' },
  ...catalog.equipment.map((e) => ({ value: e.folder, label: e.name, hint: e.category })),
])

const showEquipment = computed(() => !code.value || code.value === 'R-16')

function params() {
  return {
    code: code.value || undefined,
    status: status.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    position: position.value || undefined,
    equipment: equipment.value || undefined,
    q: q.value.trim() || undefined,
    limit: 30,
  }
}

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  try {
    const data = await apiRecords(params())
    if (mine !== seq) return
    records.value = data.records
    hasMore.value = data.hasMore
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function more() {
  if (!hasMore.value || loadingMore.value || loading.value) return
  const last = records.value[records.value.length - 1]
  if (!last) return
  loadingMore.value = true
  try {
    const data = await apiRecords({ ...params(), before: last.updatedAt })
    records.value = [...records.value, ...data.records]
    hasMore.value = data.hasMore
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loadingMore.value = false
  }
}

useInfiniteScroll({ sentinel, onReach: more })

let qTimer: ReturnType<typeof setTimeout> | null = null
watch(q, () => {
  if (qTimer) clearTimeout(qTimer)
  qTimer = setTimeout(load, 350)
})
watch([code, status, from, to, position, equipment], load)

onMounted(async () => {
  await Promise.all([catalog.load().catch(() => undefined), load()])
})

const hasFilters = computed(
  () => Boolean(code.value || status.value !== 'archivado' || from.value || to.value || position.value || equipment.value || q.value),
)

function reset() {
  code.value = ''
  status.value = 'archivado'
  from.value = ''
  to.value = ''
  position.value = ''
  equipment.value = ''
  q.value = ''
}

async function openPdf(r: IsmRecord) {
  try {
    window.open(await apiPdfUrl(r._id), '_blank')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">Archivo</h1>
    <p class="lead">Todos los registros con su PDF oficial. Los archivados no se pueden modificar.</p>

    <section class="filters card">
      <div class="search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input v-model="q" type="search" placeholder="Buscar por nombre de archivo o formato" />
      </div>
      <div class="grid">
        <BaseSelect v-model="code" :options="codeOptions" searchable placeholder="Formato" />
        <BaseSelect v-model="status" :options="statusOptions" placeholder="Estado" />
        <BaseDatePicker v-model="from" placeholder="Desde" clearable />
        <BaseDatePicker v-model="to" placeholder="Hasta" clearable />
        <BaseSelect v-model="position" :options="positionOptions" placeholder="Cargo" />
        <BaseSelect v-if="showEquipment" v-model="equipment" :options="equipmentOptions" searchable placeholder="Equipo" />
      </div>
      <Transition name="fade">
        <button v-if="hasFilters" type="button" class="btn btn-ghost reset" @click="reset">
          <i class="fa-solid fa-xmark" aria-hidden="true" /> Quitar filtros
        </button>
      </Transition>
    </section>

    <SkeletonList v-if="loading" variant="card" :rows="6" />
    <p v-else-if="!records.length" class="empty">
      <i class="fa-regular fa-folder-open" aria-hidden="true" /> No hay registros con estos filtros.
    </p>
    <template v-else>
      <TransitionGroup tag="div" name="list" appear class="list">
        <RecordRow v-for="r in records" :key="r._id" :record="r" @pdf="openPdf" />
      </TransitionGroup>
      <div ref="sentinel" class="sentinel">
        <BaseSpinner v-if="loadingMore" />
        <span v-else-if="!hasMore" class="end">{{ records.length }} registros</span>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.lead {
  margin: 0.2rem 0 1rem;
  color: var(--ink-600);
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-bottom: 1rem;
}

.search {
  position: relative;

  i {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-400);
  }

  input {
    width: 100%;
    min-height: 46px;
    padding: 0 1rem 0 2.5rem;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--cream-200);
    background: var(--surface);
    font: inherit;

    &:focus {
      outline: none;
      border-color: var(--gold-500);
    }
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;

  @include desktop {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.reset {
  align-self: flex-start;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sentinel {
  display: grid;
  place-items: center;
  min-height: 56px;
}

.end {
  font-size: 0.8rem;
  color: var(--ink-400);
}

.empty {
  color: var(--ink-400);
  padding: 2rem 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
