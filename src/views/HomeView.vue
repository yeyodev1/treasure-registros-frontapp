<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useToastStore } from '@/stores/toast'
import { apiRecords, apiSummary } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { STATUS_ICONS, STATUS_LABELS, authorName, formatRecordDate } from '@/utils/ism'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import type { IsmRecord, IsmSummary } from '@/types'

const router = useRouter()
const userStore = useUserStore()
const toast = useToastStore()

const summary = shallowRef<IsmSummary | null>(null)
const recent = shallowRef<IsmRecord[]>([])
const loading = shallowRef(true)

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const monthLabel = computed(() => (summary.value ? `${MONTHS[summary.value.month.m - 1]} ${summary.value.month.y}` : ''))

const cards = computed(() => {
  const c = summary.value?.counts
  if (!c) return []
  return [
    { key: 'misBorradores', label: 'Mis borradores', icon: 'fa-pen-to-square', value: c.misBorradores, to: '/por-firmar?tab=borradores' },
    { key: 'por_capitan', label: 'Por firmar Capitán', icon: 'fa-anchor', value: c.por_capitan, to: '/por-firmar?tab=capitan' },
    { key: 'por_oficina', label: 'Por firmar oficina', icon: 'fa-building', value: c.por_oficina, to: '/por-firmar?tab=oficina' },
    { key: 'archivado', label: 'Archivados', icon: 'fa-box-archive', value: c.archivado, to: '/archivo' },
  ]
})

const done = computed(() => summary.value?.checklist.filter((i) => i.done).length ?? 0)

onMounted(async () => {
  try {
    const [s, r] = await Promise.all([apiSummary(), apiRecords({ limit: 8 })])
    summary.value = s
    recent.value = r.records
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page home">
    <div class="hero">
      <div>
        <p class="eyebrow">Hola, {{ userStore.user?.name?.split(' ')[0] }}</p>
        <h1 class="page-title">Registros del SGS</h1>
        <p class="lead">Llena, firma y archiva los registros ISM del barco sin papel.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="router.push('/nuevo')">
        <i class="fa-solid fa-plus" aria-hidden="true" /> Nuevo registro
      </button>
    </div>

    <section class="counts">
      <template v-if="loading">
        <SkeletonBlock v-for="i in 4" :key="i" height="92px" />
      </template>
      <TransitionGroup v-else name="list" appear>
        <RouterLink v-for="c in cards" :key="c.key" :to="c.to" class="count card">
          <i class="fa-solid" :class="c.icon" aria-hidden="true" />
          <strong>{{ c.value }}</strong>
          <span>{{ c.label }}</span>
        </RouterLink>
      </TransitionGroup>
    </section>

    <div class="cols">
      <section class="card checklist">
        <header>
          <h2><i class="fa-solid fa-list-check" aria-hidden="true" /> Obligatorios del mes</h2>
          <span v-if="summary" class="month">{{ monthLabel }} · {{ done }}/{{ summary.checklist.length }}</span>
        </header>
        <SkeletonList v-if="loading" :rows="5" />
        <ul v-else-if="summary">
          <li v-for="item in summary.checklist" :key="item.code" :class="{ ok: item.done }">
            <i class="fa-solid" :class="item.done ? 'fa-circle-check' : 'fa-circle-exclamation'" aria-hidden="true" />
            <div class="ci-body">
              <p class="ci-title">
                <span class="code">{{ item.code.replace('_', ' · ') }}</span> {{ item.title }}
              </p>
              <div v-if="item.progress" class="bar">
                <span :style="{ width: `${(item.progress.done / Math.max(1, item.progress.total)) * 100}%` }" />
              </div>
              <p v-if="item.progress" class="ci-hint">
                {{ item.progress.done }} de {{ item.progress.total }}
                <template v-if="item.missing?.length && item.missing.length <= 4"> · Faltan: {{ item.missing.join(', ') }}</template>
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section class="card recent">
        <header>
          <h2><i class="fa-solid fa-clock-rotate-left" aria-hidden="true" /> Recientes</h2>
          <RouterLink to="/archivo" class="more">Ver todo</RouterLink>
        </header>
        <SkeletonList v-if="loading" :rows="5" />
        <p v-else-if="!recent.length" class="empty">
          <i class="fa-regular fa-folder-open" aria-hidden="true" /> Aún no hay registros. Empieza con «Nuevo registro».
        </p>
        <TransitionGroup v-else tag="ul" name="list" appear>
          <li v-for="r in recent" :key="r._id">
            <RouterLink :to="`/registro/${r._id}`" class="rrow">
              <span class="status-dot" :class="`s-${r.status}`">
                <i class="fa-solid" :class="STATUS_ICONS[r.status]" aria-hidden="true" />
              </span>
              <span class="rbody">
                <strong>{{ r.code.replace('_', ' · ') }} · {{ r.title }}</strong>
                <small>
                  {{ formatRecordDate(r.recordDate) }} · {{ STATUS_LABELS[r.status] }}
                  <template v-if="authorName(r)"> · {{ authorName(r) }}</template>
                  <template v-if="r.equipment"> · {{ r.equipment.name }}</template>
                </small>
              </span>
              <i class="fa-solid fa-chevron-right chev" aria-hidden="true" />
            </RouterLink>
          </li>
        </TransitionGroup>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.hero {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.2rem;

  @include tablet {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold-500);
}

.lead {
  margin: 0.2rem 0 0;
  color: var(--ink-600);
}

.counts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 1rem;

  @include desktop {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.count {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  i {
    color: var(--gold-500);
  }

  strong {
    font-size: 1.7rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  span {
    font-size: 0.82rem;
    color: var(--ink-600);
  }
}

.cols {
  display: grid;
  gap: 1rem;

  @include desktop {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

.card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.7rem;

  h2 {
    margin: 0;
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;

    i {
      color: var(--gold-500);
    }
  }
}

.month,
.more {
  font-size: 0.8rem;
  color: var(--ink-400);
}

.more {
  color: var(--gold-500);
  font-weight: 600;
  text-decoration: none;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.checklist li {
  display: flex;
  gap: 0.6rem;
  padding: 0.5rem 0.2rem;
  border-bottom: 1px solid var(--cream-200);

  &:last-child {
    border-bottom: none;
  }

  > i {
    margin-top: 0.15rem;
    color: var(--warning);
  }

  &.ok > i {
    color: var(--success);
  }
}

.ci-body {
  flex: 1;
  min-width: 0;
}

.ci-title {
  margin: 0;
  font-size: 0.9rem;
}

.code {
  font-weight: 700;
  color: var(--navy-700);
}

.bar {
  margin-top: 0.35rem;
  height: 6px;
  border-radius: 999px;
  background: var(--cream-200);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--gold-500);
    border-radius: inherit;
    transition: width 0.5s ease;
  }
}

.ci-hint {
  margin: 0.25rem 0 0;
  font-size: 0.76rem;
  color: var(--ink-400);
}

.rrow {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.4rem;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;

  &:hover {
    background: var(--powder-100);
  }
}

.status-dot {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-100);
  color: var(--navy-700);
  font-size: 0.8rem;

  &.s-por_capitan,
  &.s-por_oficina {
    background: rgba(185, 128, 47, 0.15);
    color: #8a5d1d;
  }

  &.s-archivado {
    background: rgba(63, 122, 87, 0.14);
    color: var(--success);
  }
}

.rbody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  strong {
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    font-size: 0.75rem;
    color: var(--ink-400);
  }
}

.chev {
  color: var(--ink-400);
  font-size: 0.75rem;
}

.empty {
  margin: 0;
  color: var(--ink-400);
  font-size: 0.9rem;
}
</style>
