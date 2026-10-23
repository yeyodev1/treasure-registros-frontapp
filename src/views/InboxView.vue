<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useToastStore } from '@/stores/toast'
import { apiPdfUrl, apiRecords } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import RecordRow from '@/components/registros/RecordRow.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmRecord } from '@/types'

type Tab = 'capitan' | 'oficina' | 'borradores'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const catalog = useCatalogStore()
const toast = useToastStore()

const tabs = computed(() => {
  const list: Array<{ key: Tab; label: string; icon: string }> = []
  if (userStore.isCaptain) list.push({ key: 'capitan', label: 'Por firmar · Capitán', icon: 'fa-anchor' })
  if (userStore.isOffice) list.push({ key: 'oficina', label: 'Por firmar · Oficina', icon: 'fa-building' })
  list.push({ key: 'borradores', label: userStore.isAdmin ? 'Borradores' : 'Mis borradores', icon: 'fa-pen-to-square' })
  return list
})

const tab = computed<Tab>(() => {
  const q = route.query.tab as Tab | undefined
  return tabs.value.some((t) => t.key === q) ? q! : tabs.value[0]!.key
})

const records = shallowRef<IsmRecord[]>([])
const loading = shallowRef(true)

async function load() {
  loading.value = true
  try {
    const params =
      tab.value === 'capitan'
        ? { status: 'por_capitan' }
        : tab.value === 'oficina'
          ? { status: 'por_oficina' }
          : { status: 'borrador', ...(userStore.isAdmin ? {} : { mine: '1' as const }) }
    const [{ records: list }] = await Promise.all([apiRecords({ ...params, limit: 100 }), catalog.load()])
    records.value = list
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

watch(tab, load, { immediate: true })

async function openPdf(r: IsmRecord) {
  try {
    window.open(await apiPdfUrl(r._id), '_blank')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}

const emptyText = computed(() =>
  tab.value === 'borradores'
    ? 'No hay borradores. Todo lo que empezaste ya fue enviado.'
    : 'No hay registros esperando tu firma.',
)
</script>

<template>
  <div class="page">
    <h1 class="page-title">Por firmar</h1>

    <div class="tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: tab === t.key }"
        :aria-selected="tab === t.key"
        @click="router.replace({ query: { tab: t.key } })"
      >
        <i class="fa-solid" :class="t.icon" aria-hidden="true" /> {{ t.label }}
      </button>
    </div>

    <SkeletonList v-if="loading" variant="card" :rows="5" />
    <p v-else-if="!records.length" class="empty">
      <i class="fa-regular fa-circle-check" aria-hidden="true" /> {{ emptyText }}
    </p>
    <TransitionGroup v-else tag="div" name="list" appear class="list">
      <RecordRow v-for="r in records" :key="r._id" :record="r" @pdf="openPdf" />
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.tabs {
  display: flex;
  gap: 0.4rem;
  margin: 0.4rem 0 1rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1.5px solid var(--cream-200);
  background: var(--surface);
  color: var(--ink-600);
  font-weight: 600;
  font-size: 0.88rem;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;

  &.active {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty {
  color: var(--ink-400);
  padding: 2rem 0;
}
</style>
