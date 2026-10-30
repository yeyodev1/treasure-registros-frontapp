<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { useToastStore } from '@/stores/toast'
import { useCatalogStore } from '@/stores/catalog'
import { apiRecords, apiSummary } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { recordWhen, recordWho, statusLabel, todayGalapagos } from '@/utils/ism'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import SignTrail from '@/components/sign/SignTrail.vue'
import type { IsmRecord, IsmSummary } from '@/types'

const userStore = useUserStore()
const toast = useToastStore()
const catalog = useCatalogStore()

const summary = shallowRef<IsmSummary | null>(null)
const recent = shallowRef<IsmRecord[]>([])
const drafts = shallowRef<IsmRecord[]>([])
/** Registros que esperan la firma de esta cuenta (Capitán o Persona Designada). */
const awaiting = shallowRef<IsmRecord[]>([])
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
    to: '/formato/R-14/nuevo',
    guided: true,
    newLabel: 'Nuevo zarpe',
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
    title: 'Reportar una novedad',
    text: 'Accidente, cuasi accidente o condición peligrosa.',
    code: 'R-09',
    icon: 'fa-triangle-exclamation',
    to: '/nuevo?formato=R-09',
    guided: false,
  },
]

type Task = (typeof TASKS)[number] & { newLabel?: string }

/**
 * Formatos guiados: la tarjeta sale del esquema (plantilla, criterio 5). Si
 * el catálogo aún no carga, queda la del R-14 de siempre.
 */
const guidedTasks = computed<Task[]>(() =>
  catalog.forms
    .filter((f) => f.guidedVersion && f.card)
    .map((f) => ({
      key: f.code === 'R-14' ? 'zarpe' : `guided-${f.code}`,
      title: f.card!.title,
      text: f.card!.text,
      code: f.code,
      icon: f.card!.icon,
      to: `/formato/${f.code}/nuevo`,
      guided: true,
      newLabel: f.card!.newLabel,
    })),
)

const baseTasks = computed<Task[]>(() => {
  const guided = guidedTasks.value
  if (!guided.length) return TASKS
  return [...guided, ...TASKS.filter((t) => !t.guided && !guided.some((g) => g.code === t.code))]
})

/** Chequeo abierto del formato: la tarjeta lo continúa en vez de crear otro (falla 10). */
function openDraft(code: string) {
  const list = drafts.value.filter((d) => d.code === code && d.schemaVersion)
  return (
    list.find((d) => d.returnInfo) ??
    list.find((d) => d.context?.activityDate === todayGalapagos()) ??
    list[0] ??
    null
  )
}

const tasks = computed(() =>
  baseTasks.value.map((t) => {
    const d = t.guided ? openDraft(t.code) : null
    if (!d) return { ...t, extra: '' }
    const progress = d.flags ? ` (${d.flags.answered} de ${d.flags.total})` : ''
    const today = d.context?.activityDate === todayGalapagos()
    // La tarjeta lleva al inicio del formato: ahí se continúa el abierto o se toca «Nuevo zarpe» (falla 10).
    const newLabel = t.newLabel ?? 'Nuevo registro'
    const noun = newLabel.replace(/^nuevo\s+/i, '') || 'registro'
    return {
      ...t,
      text: d.returnInfo
        ? `Corregir el chequeo devuelto${progress}`
        : today
          ? `Continuar el chequeo de hoy${progress}`
          : `Continuar el chequeo${progress}`,
      extra: `Para otro ${noun}, toca «${newLabel}» dentro.`,
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
    { key: 'misBorradores', label: 'Mis borradores', value: c.misBorradores, to: '/por-firmar?tab=borradores' },
    { key: 'por_capitan', label: 'Por firmar · Capitán', value: c.por_capitan, to: '/por-firmar?tab=capitan' },
    { key: 'por_oficina', label: 'Por firmar · Persona Designada', value: c.por_oficina, to: '/por-firmar?tab=oficina' },
    { key: 'archivado', label: 'Archivados', value: c.archivado, to: '/archivo' },
  ]
})

/** Estado a la que firma esta cuenta: solo el rol firma su paso. */
const myStatus = computed(() =>
  userStore.role === 'capitan' ? 'por_capitan' : userStore.role === 'designada' ? 'por_oficina' : null,
)

/** Nombre reconocible de un registro: la tarjeta del guiado o el título oficial. */
function recordTitle(r: IsmRecord): string {
  const card = catalog.byCode.get(r.code)?.card
  return r.schemaVersion && card ? card.title : r.title
}

/** Qué hace el botón de cada borrador. */
function draftAction(r: IsmRecord): string {
  if (r.returnInfo) return 'Corregir'
  if (complete(r)) return 'Firmar'
  return 'Continuar'
}

const done = computed(() => summary.value?.checklist.filter((i) => i.done).length ?? 0)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    catalog.load().catch(() => undefined)
    const [s, r, d, w] = await Promise.all([
      apiSummary(),
      apiRecords({ limit: 6 }),
      apiRecords({ status: 'borrador', mine: '1', limit: 12 }),
      myStatus.value ? apiRecords({ status: myStatus.value, limit: 4 }) : Promise.resolve({ records: [] as IsmRecord[] }),
    ])
    summary.value = s
    recent.value = r.records
    drafts.value = d.records
    awaiting.value = w.records
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
    <header class="page-head">
      <div>
        <h1 class="page-title">Mis tareas</h1>
        <p class="page-lead">Elige lo que vas a hacer. La app te guía y llena el formato oficial.</p>
      </div>
      <RouterLink to="/nuevo" class="btn btn-ghost">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true" /> Todos los formatos
      </RouterLink>
    </header>

    <div v-if="loadError && !loading" class="card load-error" role="alert">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true" />
      <span>{{ loadError }}</span>
      <button type="button" class="btn btn-primary" @click="load">
        <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
      </button>
    </div>

    <!-- Capitán y Persona Designada: primero lo que espera su firma. -->
    <section v-if="awaiting.length" class="block" aria-labelledby="h-awaiting">
      <div class="panel-head">
        <h2 id="h-awaiting">Esperan tu firma</h2>
        <RouterLink to="/por-firmar" class="panel-link">Ver todos</RouterLink>
      </div>
      <TransitionGroup tag="ul" name="list" appear class="rows card">
        <li v-for="r in awaiting" :key="r._id">
          <RouterLink :to="`/registro/${r._id}`" class="row">
            <span class="row-main">
              <strong class="row-title">{{ recordTitle(r) }} <span class="row-code">{{ r.code.replace('_', ' · ') }}</span></strong>
              <span class="row-meta">{{ recordWhen(r) }}<template v-if="recordWho(r)"> · {{ recordWho(r) }}</template></span>
              <span class="row-tags">
                <span v-if="r.flags?.novedades" class="pill pill--nov">
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  {{ r.flags.novedades }} {{ r.flags.novedades === 1 ? 'novedad' : 'novedades' }}
                </span>
                <SignTrail :record="r" />
              </span>
            </span>
            <span class="row-go">Revisar y firmar <i class="fa-solid fa-chevron-right" aria-hidden="true" /></span>
          </RouterLink>
        </li>
      </TransitionGroup>
    </section>

    <!-- Lo que dejaste a medias o te devolvieron: se continúa, no se crea otro. -->
    <section v-if="toContinue.length" class="block" aria-labelledby="h-continue">
      <div class="panel-head">
        <h2 id="h-continue">Para continuar</h2>
        <RouterLink to="/por-firmar?tab=borradores" class="panel-link">Ver todos</RouterLink>
      </div>
      <TransitionGroup tag="ul" name="list" appear class="rows card">
        <li v-for="r in toContinue" :key="r._id" :class="{ 'is-returned': r.returnInfo }">
          <RouterLink :to="`/registro/${r._id}`" class="row">
            <span class="row-main">
              <strong class="row-title">{{ recordTitle(r) }} <span class="row-code">{{ r.code.replace('_', ' · ') }}</span></strong>
              <span class="row-meta">
                {{ recordWhen(r) }}<template v-if="r.context?.place"> · {{ r.context.place }}</template><template v-if="r.equipment"> · {{ r.equipment.name }}</template><template v-if="recordWho(r)"> · {{ recordWho(r) }}</template>
              </span>
              <span v-if="r.returnInfo" class="row-returned">
                <i class="fa-solid fa-rotate-left" aria-hidden="true" />
                <span>Devuelto<template v-if="r.returnInfo.section"> · {{ r.returnInfo.section }}</template>: {{ r.returnInfo.reason }}</span>
              </span>
              <span v-if="r.flags" class="row-progress">
                <span class="bar"><span :style="{ width: `${(r.flags.answered / Math.max(1, r.flags.total)) * 100}%` }" /></span>
                <span class="num">{{ r.flags.answered }} de {{ r.flags.total }}</span>
                <span v-if="complete(r) && !r.returnInfo" class="pill pill--turn">
                  <i class="fa-solid fa-signature" aria-hidden="true" /> Falta firmar y enviar
                </span>
              </span>
            </span>
            <span class="row-btn btn" :class="r.returnInfo || complete(r) ? 'btn-primary' : 'btn-ghost'">
              {{ draftAction(r) }} <i class="fa-solid fa-chevron-right" aria-hidden="true" />
            </span>
          </RouterLink>
        </li>
      </TransitionGroup>
    </section>

    <section class="block" aria-labelledby="h-tasks">
      <div class="panel-head">
        <h2 id="h-tasks">¿Qué vas a hacer?</h2>
      </div>
      <TransitionGroup tag="div" name="list" appear class="tasks">
        <RouterLink v-for="t in tasks" :key="t.key" :to="t.to" class="task" :class="{ 'task--guided': t.guided }">
          <i class="fa-solid task-icon" :class="t.icon" aria-hidden="true" />
          <span class="task-body">
            <strong>{{ t.title }}</strong>
            <span>{{ t.text }}</span>
            <small v-if="t.extra" class="task-extra">{{ t.extra }}</small>
            <small class="task-code">
              {{ t.code }}<template v-if="t.guided"> · Paso a paso</template>
            </small>
          </span>
          <i class="fa-solid fa-chevron-right task-chev" aria-hidden="true" />
        </RouterLink>
      </TransitionGroup>
    </section>

    <section class="block" aria-labelledby="h-counts">
      <div class="panel-head">
        <h2 id="h-counts">Registros en curso</h2>
      </div>
      <div v-if="loading" class="counts card">
        <SkeletonBlock v-for="i in 4" :key="i" height="64px" />
      </div>
      <div v-else class="counts card">
        <RouterLink v-for="c in cards" :key="c.key" :to="c.to" class="count">
          <span class="count-label">{{ c.label }}</span>
          <strong class="num" :class="{ zero: !c.value }">{{ c.value }}</strong>
        </RouterLink>
      </div>
    </section>

    <div class="cols">
      <section class="card checklist" aria-labelledby="h-month">
        <div class="panel-head">
          <h2 id="h-month">Obligatorios del mes</h2>
          <span v-if="summary" class="month num">{{ monthLabel }} · {{ done }} de {{ summary.checklist.length }}</span>
        </div>
        <SkeletonList v-if="loading" :rows="5" />
        <ul v-else-if="summary">
          <li v-for="item in summary.checklist" :key="item.code" :class="{ ok: item.done }">
            <i class="fa-solid" :class="item.done ? 'fa-circle-check' : 'fa-circle'" aria-hidden="true" />
            <div class="ci-body">
              <p class="ci-title">
                {{ item.title }} <span class="ci-code">{{ item.code.replace('_', ' · ') }}</span>
              </p>
              <template v-if="item.progress">
                <span class="bar"><span :style="{ width: `${(item.progress.done / Math.max(1, item.progress.total)) * 100}%` }" /></span>
                <p class="ci-hint num">
                  {{ item.progress.done }} de {{ item.progress.total }}
                  <template v-if="item.missing?.length && item.missing.length <= 4"> · Faltan: {{ item.missing.join(', ') }}</template>
                </p>
              </template>
              <p v-else class="ci-hint">{{ item.done ? 'Hecho este mes' : 'Falta este mes' }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section class="card recent" aria-labelledby="h-recent">
        <div class="panel-head">
          <h2 id="h-recent">Recientes</h2>
          <RouterLink to="/archivo" class="panel-link">Ver todo</RouterLink>
        </div>
        <SkeletonList v-if="loading" :rows="5" />
        <p v-else-if="!recent.length" class="empty-state">
          <i class="fa-regular fa-folder-open" aria-hidden="true" />
          <span><strong>Aún no hay registros.</strong> Empieza con «¿Qué vas a hacer?».</span>
        </p>
        <TransitionGroup v-else tag="ul" name="list" appear class="recent-list">
          <li v-for="r in recent" :key="r._id">
            <RouterLink :to="`/registro/${r._id}`" class="rrow">
              <span class="rbody">
                <strong>{{ r.code.replace('_', ' · ') }} · {{ recordTitle(r) }}</strong>
                <small>{{ recordWhen(r) }}<template v-if="recordWho(r)"> · {{ recordWho(r) }}</template></small>
                <span class="rtrail">
                  <SignTrail :record="r" />
                  <span v-if="r.status === 'borrador' && !r.returnInfo" class="sr-only">{{ statusLabel(r) }}</span>
                </span>
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

.block {
  margin-bottom: 2rem;
}

.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 1.5rem;
  color: var(--danger);

  span {
    flex: 1;
    min-width: 200px;
    color: var(--ink-900);
  }
}

// Filas de trabajo: lo que está a medias o espera firma.
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;

  li + li {
    border-top: 1px solid var(--line);
  }

  li.is-returned {
    box-shadow: inset 4px 0 0 var(--danger);
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.1rem 1rem 1.25rem;
  min-height: 72px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.row-title {
  font-weight: 600;
  font-size: 1.08rem;
}

.row-code {
  font-weight: 500;
  color: var(--ink-400);
  white-space: nowrap;
}

.row-meta {
  color: var(--ink-600);
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  margin-top: 0.15rem;
}

.row-returned {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.15rem;
  color: var(--danger);
  font-weight: 600;

  i {
    margin-top: 0.3rem;
    font-size: 0.85rem;
  }
}

.row-progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  margin-top: 0.2rem;
  color: var(--ink-600);

  .bar {
    width: 160px;
  }
}

.row-go {
  flex-shrink: 0;
  display: none;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--navy-800);

  @include tablet {
    display: inline-flex;
  }

  i {
    font-size: 0.85rem;
  }
}

.row-btn {
  flex-shrink: 0;
  min-width: 128px;

  i {
    font-size: 0.8rem;
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
    transition: width 0.4s var(--ease);
  }
}

// Las cuatro acciones del barco.
.tasks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;

  @media (min-width: 1100px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.task {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.1rem 1rem 1.1rem 1.1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;

  &:hover {
    border-color: var(--navy-600);
  }

  &:active {
    transform: scale(0.99);
  }
}

// El formato guiado del día (R-14) ocupa toda la fila: es lo que más se hace.
.task--guided {
  border-color: var(--navy-700);
  box-shadow: inset 0 0 0 1px var(--navy-700);

  grid-column: 1 / -1;

  .task-body strong {
    font-size: 1.55rem;
  }
}

.task-icon {
  width: 1.6rem;
  margin-top: 0.35rem;
  font-size: 1.25rem;
  text-align: center;
  color: var(--navy-700);
  flex-shrink: 0;
}

.task-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  strong {
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.35rem;
    line-height: 1.2;
  }

  > span {
    color: var(--ink-600);
  }
}

.task-extra {
  font-size: 1rem;
  color: var(--ink-900);
  font-weight: 500;
}

.task-code {
  margin-top: 0.15rem;
  font-size: 1rem;
  color: var(--ink-400);
}

.task-chev {
  align-self: center;
  color: var(--ink-400);
  font-size: 0.9rem;
}

// Cuatro cifras en una sola tarjeta dividida, sin íconos.
.counts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0;
  overflow: hidden;

  @include tablet {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.count {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.4rem;
  min-height: 96px;
  padding: 1rem 1.1rem;
  transition: background 0.15s ease;
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);

  &:hover {
    background: var(--hover);
  }

  strong {
    font-size: 2rem;
    font-weight: 500;
    line-height: 1;

    &.zero {
      color: var(--ink-400);
    }
  }
}

.count-label {
  color: var(--ink-600);
}

.counts .count:nth-child(-n + 2) {
  border-top: none;
}

.counts .count:nth-child(odd) {
  border-left: none;
}

@include tablet {
  .counts .count {
    border-top: none;
    border-left: 1px solid var(--line);
  }

  .counts .count:first-child {
    border-left: none;
  }
}

.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;

  @media (min-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.month {
  color: var(--ink-600);
  white-space: nowrap;
}

.checklist ul,
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.checklist li {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0;

  & + li {
    border-top: 1px solid var(--line);
  }

  > i {
    margin-top: 0.3rem;
    font-size: 0.9rem;
    color: var(--line-strong);
  }

  &.ok > i {
    color: var(--success);
  }
}

.ci-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ci-title {
  margin: 0;
  font-weight: 500;
}

.ci-code {
  color: var(--ink-400);
  font-weight: 400;
  white-space: nowrap;
}

.ci-hint {
  margin: 0;
  color: var(--ink-600);
}

.rrow {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }
}

.recent-list li + li .rrow {
  border-top: 1px solid var(--line);
  border-radius: 0;
}

.rbody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  strong {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.rtrail {
  display: flex;
  margin-top: 0.15rem;
}

.chev {
  color: var(--ink-400);
  font-size: 0.85rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
