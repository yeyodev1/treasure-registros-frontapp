<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useToastStore } from '@/stores/toast'
import { apiRecords, apiSummary } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { STATUS_ICONS, authorName, formatRecordDate, statusLabel, todayGalapagos } from '@/utils/ism'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import type { IsmRecord, IsmSummary } from '@/types'

const router = useRouter()
const userStore = useUserStore()
const toast = useToastStore()

const summary = shallowRef<IsmSummary | null>(null)
const recent = shallowRef<IsmRecord[]>([])
const drafts = shallowRef<IsmRecord[]>([])
const loading = shallowRef(true)
const loadError = shallowRef('')

/** Acciones reconocibles; el código R queda como referencia secundaria. */
const TASKS = [
  {
    key: 'zarpe',
    title: 'Preparar el zarpe',
    text: 'Ronda de seguridad y chequeos previos al zarpe, al arribo y fondeado.',
    code: 'R-14',
    icon: 'fa-anchor',
    to: '/zarpe/nuevo',
    guided: true,
  },
  {
    key: 'equipo',
    title: 'Revisar un equipo',
    text: 'Mantenimiento preventivo de un equipo de cubierta o máquinas.',
    code: 'R-16',
    icon: 'fa-screwdriver-wrench',
    to: '/nuevo?formato=R-16',
    guided: false,
  },
  {
    key: 'descanso',
    title: 'Registrar descanso',
    text: 'Horas de descanso del mes por cargo.',
    code: 'R-23',
    icon: 'fa-bed',
    to: '/nuevo?formato=R-23',
    guided: false,
  },
  {
    key: 'problema',
    title: 'Reportar un problema',
    text: 'Accidente, cuasi accidente o condición peligrosa.',
    code: 'R-09',
    icon: 'fa-triangle-exclamation',
    to: '/nuevo?formato=R-09',
    guided: false,
  },
]

/** Chequeo del zarpe abierto: la tarjeta lo continúa en vez de crear otro (falla 10). */
const openZarpe = computed(() => {
  const list = drafts.value.filter((d) => d.code === 'R-14' && d.schemaVersion)
  return (
    list.find((d) => d.returnInfo) ??
    list.find((d) => d.context?.activityDate === todayGalapagos()) ??
    list[0] ??
    null
  )
})

const tasks = computed(() =>
  TASKS.map((t) => {
    const d = t.key === 'zarpe' ? openZarpe.value : null
    if (!d) return { ...t, extra: '' }
    const progress = d.flags ? ` (${d.flags.answered} de ${d.flags.total})` : ''
    const today = d.context?.activityDate === todayGalapagos()
    return {
      ...t,
      to: `/registro/${d._id}`,
      text: d.returnInfo
        ? `Corregir el chequeo devuelto${progress}`
        : today
          ? `Continuar el chequeo de hoy${progress}`
          : `Continuar el chequeo${progress}`,
      extra: 'Para otro zarpe, toca «Nuevo zarpe» dentro.',
    }
  }),
)

/** 30 de 30 respondidos y sin enviar: no es lo mismo que uno a medias (falla 11). */
function complete(r: IsmRecord): boolean {
  return Boolean(r.flags && r.flags.total > 0 && r.flags.answered === r.flags.total)
}

/** Primero lo devuelto para corregir, luego lo más reciente. */
const toContinue = computed(() =>
  [...drafts.value].sort((a, b) => Number(Boolean(b.returnInfo)) - Number(Boolean(a.returnInfo))),
)

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const monthLabel = computed(() => (summary.value ? `${MONTHS[summary.value.month.m - 1]} ${summary.value.month.y}` : ''))

const cards = computed(() => {
  const c = summary.value?.counts
  if (!c) return []
  return [
    { key: 'misBorradores', label: 'Mis borradores', icon: 'fa-pen-to-square', value: c.misBorradores, to: '/por-firmar?tab=borradores' },
    { key: 'por_capitan', label: 'Por firmar · Capitán', icon: 'fa-anchor', value: c.por_capitan, to: '/por-firmar?tab=capitan' },
    { key: 'por_oficina', label: 'Por firmar · Persona Designada', icon: 'fa-building', value: c.por_oficina, to: '/por-firmar?tab=oficina' },
    { key: 'archivado', label: 'Archivados', icon: 'fa-box-archive', value: c.archivado, to: '/archivo' },
  ]
})

const done = computed(() => summary.value?.checklist.filter((i) => i.done).length ?? 0)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [s, r, d] = await Promise.all([
      apiSummary(),
      apiRecords({ limit: 8 }),
      apiRecords({ status: 'borrador', mine: '1', limit: 12 }),
    ])
    summary.value = s
    recent.value = r.records
    drafts.value = d.records
  } catch (err) {
    loadError.value = apiErrorMessage(err)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page home">
    <div class="hero">
      <div>
        <p class="eyebrow">Hola, {{ userStore.user?.name?.split(' ')[0] }}</p>
        <h1 class="page-title">Mis tareas</h1>
        <p class="lead">Elige lo que vas a hacer. La app te guía y llena el formato oficial por detrás.</p>
      </div>
      <button type="button" class="btn btn-ghost" @click="router.push('/nuevo')">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true" /> Todos los formatos
      </button>
    </div>

    <TransitionGroup tag="section" name="list" appear class="tasks" aria-label="Acciones">
      <RouterLink v-for="t in tasks" :key="t.key" :to="t.to" class="task card" :class="{ 'task--guided': t.guided }">
        <span class="task-icon"><i class="fa-solid" :class="t.icon" aria-hidden="true" /></span>
        <span class="task-body">
          <strong>{{ t.title }}</strong>
          <span>{{ t.text }}</span>
          <small v-if="t.extra" class="task-extra">{{ t.extra }}</small>
          <small>
            {{ t.code }}
            <template v-if="t.guided"> · Paso a paso</template>
          </small>
        </span>
        <i class="fa-solid fa-chevron-right task-chev" aria-hidden="true" />
      </RouterLink>
    </TransitionGroup>

    <div v-if="loadError && !loading" class="card load-error">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true" />
      <span>{{ loadError }}</span>
      <button type="button" class="btn btn-primary" @click="load">
        <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
      </button>
    </div>

    <section v-if="toContinue.length" class="card continue">
      <header>
        <h2><i class="fa-solid fa-pen-to-square" aria-hidden="true" /> Para continuar</h2>
        <RouterLink to="/por-firmar?tab=borradores" class="more">Ver todos</RouterLink>
      </header>
      <TransitionGroup tag="ul" name="list" appear>
        <li v-for="r in toContinue" :key="r._id">
          <RouterLink :to="`/registro/${r._id}`" class="rrow" :class="{ 'rrow--returned': r.returnInfo }">
            <span class="status-dot" :class="r.returnInfo ? 's-devuelto' : `s-${r.status}`">
              <i class="fa-solid" :class="r.returnInfo ? 'fa-rotate-left' : STATUS_ICONS[r.status]" aria-hidden="true" />
            </span>
            <span class="rbody">
              <strong>{{ r.schemaVersion ? 'Preparar el zarpe' : r.title }} · {{ r.code.replace('_', ' · ') }}</strong>
              <small v-if="r.returnInfo" class="returned-hint">
                Devuelto · {{ r.returnInfo.section }}: {{ r.returnInfo.reason }}
              </small>
              <small v-else-if="complete(r)" class="ready-hint">
                <i class="fa-solid fa-signature" aria-hidden="true" /> Falta firmar y enviar
              </small>
              <small v-else>
                {{ formatRecordDate(r.recordDate) }}
                <template v-if="r.context?.place"> · {{ r.context.place }}</template>
                <template v-if="r.equipment"> · {{ r.equipment.name }}</template>
              </small>
              <span v-if="r.flags" class="bar bar--small">
                <span :style="{ width: `${(r.flags.answered / Math.max(1, r.flags.total)) * 100}%` }" />
              </span>
            </span>
            <span v-if="r.flags" class="rcount">{{ r.flags.answered }}/{{ r.flags.total }}</span>
            <i class="fa-solid fa-chevron-right chev" aria-hidden="true" />
          </RouterLink>
        </li>
      </TransitionGroup>
    </section>

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
                  {{ formatRecordDate(r.recordDate) }} · {{ statusLabel(r) }}
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

.hero .btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.tasks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.7rem;
  margin-bottom: 1rem;

  @include tablet {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.task {
  min-height: 96px;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  text-decoration: none;
  color: inherit;
  border: 1.5px solid transparent;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--gold-400);
  }

  &:active {
    transform: scale(0.99);
  }

  &--guided {
    border-color: rgba(159, 107, 60, 0.45);
  }
}

.task-icon {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--navy-800);
  color: var(--gold-400);
  font-size: 1.25rem;
}

.task-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;

  strong {
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.2rem;
  }

  span {
    font-size: 0.86rem;
    color: var(--ink-600);
  }

  small {
    margin-top: 0.15rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-400);
  }
}

.task-chev {
  color: var(--ink-400);
}

.load-error {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;

  > i {
    color: var(--warning);
    font-size: 1.2rem;
  }

  span {
    flex: 1;
  }
}

.continue {
  margin-bottom: 1rem;
}

.rrow--returned {
  background: rgba(180, 72, 59, 0.06);
}

.ready-hint {
  color: var(--navy-700) !important;
  font-weight: 700;
}

.returned-hint {
  color: var(--danger) !important;
  font-weight: 600;
}

.rcount {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.bar--small {
  display: block;
  height: 4px;
  max-width: 220px;
  margin-top: 0.3rem;
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

  &.s-devuelto {
    background: rgba(180, 72, 59, 0.12);
    color: var(--danger);
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
