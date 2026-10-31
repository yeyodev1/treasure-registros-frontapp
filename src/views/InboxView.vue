<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useToastStore } from '@/stores/toast'
import { apiRecords, apiSummary } from '@/services/api'
import { usePdfViewerStore } from '@/stores/pdfViewer'
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
const pdfViewer = usePdfViewerStore()

const tabs = computed(() => {
  const list: Array<{ key: Tab; label: string; icon: string }> = []
  if (userStore.isCaptain) list.push({ key: 'capitan', label: 'Por firmar · Capitán', icon: 'fa-anchor' })
  if (userStore.isOffice) list.push({ key: 'oficina', label: 'Por firmar · Persona Designada', icon: 'fa-building' })
  list.push({ key: 'borradores', label: userStore.isAdmin ? 'Borradores' : 'Mis borradores', icon: 'fa-pen-to-square' })
  return list
})

const tab = computed<Tab>(() => {
  const q = route.query.tab as Tab | undefined
  return tabs.value.some((t) => t.key === q) ? q! : tabs.value[0]!.key
})

const records = shallowRef<IsmRecord[]>([])
const loading = shallowRef(true)
/** Cuántos hay en cada pestaña, para saber dónde mirar sin abrirlas. */
const counts = shallowRef<Partial<Record<Tab, number>>>({})

async function loadCounts() {
  try {
    const s = await apiSummary()
    counts.value = { capitan: s.counts.por_capitan, oficina: s.counts.por_oficina, borradores: userStore.isAdmin ? s.counts.borrador : s.counts.misBorradores }
  } catch {
    // Las cifras son de ayuda.
  }
}
loadCounts()

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
    // En la bandeja de revisión, lo que trae novedades va primero.
    records.value =
      tab.value === 'borradores'
        ? list
        : [...list].sort((a, b) => Number(Boolean(b.flags?.novedades)) - Number(Boolean(a.flags?.novedades)))
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

watch(tab, load, { immediate: true })

/** El PDF se abre dentro de la app (visor con Descargar). */
function openPdf(r: IsmRecord) {
  pdfViewer.open(r._id, r.fileName)
}

const emptyText = computed(() =>
  tab.value === 'borradores'
    ? { title: 'No hay borradores.', text: 'Todo lo que empezaste ya fue enviado.' }
    : { title: 'No hay registros esperando tu firma.', text: 'Cuando te llegue uno, verás un aviso en la campana.' },
)

const lead = computed(() =>
  tab.value === 'borradores'
    ? 'Lo que empezaste y aún no firmas. Solo quien lo creó lo edita.'
    : 'Lo que espera tu firma. Lo que trae novedad va primero.',
)
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">Por firmar</h1>
        <p class="page-lead">{{ lead }}</p>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Bandejas">
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
        {{ t.label }}
        <span v-if="counts[t.key] !== undefined" class="tab-count num" :class="{ zero: !counts[t.key] }">{{ counts[t.key] }}</span>
      </button>
    </div>

    <SkeletonList v-if="loading" variant="card" :rows="5" />
    <p v-else-if="!records.length" class="empty-state">
      <i class="fa-regular fa-circle-check" aria-hidden="true" />
      <span><strong>{{ emptyText.title }}</strong> {{ emptyText.text }}</span>
    </p>
    <TransitionGroup v-else tag="ul" name="list" appear class="list card">
      <li v-for="r in records" :key="r._id">
        <RecordRow :record="r" @pdf="openPdf" />
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

// Bandejas: una fila de pestañas con su cifra; la activa se marca en gris azul.
.tabs {
  display: flex;
  gap: 0.4rem;
  margin: 0 0 1.25rem;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 48px;
  padding: 0 1.1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-900);
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;

  &:hover:not(.active) {
    border-color: var(--navy-600);
  }

  &.active {
    background: var(--active);
    border-color: var(--navy-800);
    box-shadow: inset 0 0 0 1px var(--navy-800);
    color: var(--navy-900);
  }
}

.tab-count {
  min-width: 26px;
  height: 26px;
  padding: 0 0.45rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--gold-500);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;

  &.zero {
    background: var(--powder-100);
    color: var(--ink-600);
  }
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;

  li + li {
    border-top: 1px solid var(--line);
  }
}
</style>
