<script setup lang="ts">
import { computed } from 'vue'
import { hasNovedad, schemaItems } from '@/utils/guided'
import { formatActivity } from '@/utils/ism'
import type { IsmAnswer, IsmContext, IsmSchema } from '@/types'

/**
 * Resumen corto de un chequeo (pantallas 1 y 4): fecha y hora, lugar, quién
 * lo hizo, respuestas y las novedades arriba con lo que se encontró y lo que
 * se hizo.
 */
const props = defineProps<{
  schema: IsmSchema
  answers: Record<string, IsmAnswer>
  context: Partial<IsmContext> | null
  positionLabel: (value: string) => string
  /** Muestra "Cambiar" en cada novedad (quien llena). */
  canChange?: boolean
  /** Texto de la acción: "Qué hiciste" (tripulante) o "Qué hizo el tripulante" (Capitán). */
  actionLabel?: string
  hideSummary?: boolean
}>()

const emit = defineEmits<{ change: [sectionId: string, itemId: string] }>()

const rows = computed(() => schemaItems(props.schema).map(({ section, item }) => ({ section, item, answer: props.answers[item.id] })))
const novedades = computed(() => rows.value.filter((r) => hasNovedad(r.answer)))
const answered = computed(() => rows.value.filter((r) => r.answer?.value).length)
const noAplica = computed(() => rows.value.filter((r) => r.answer?.value === 'na').length)
const who = computed(() => {
  const f = props.context?.filledBy
  if (!f?.name) return '—'
  return f.position ? `${f.name} · ${props.positionLabel(f.position)}` : f.name
})
</script>

<template>
  <div class="rc">
    <dl v-if="!hideSummary" class="rc-sum card">
      <div><dt>Fecha y hora</dt><dd>{{ formatActivity(context?.activityDate, context?.activityTime) }}</dd></div>
      <div><dt>Lugar</dt><dd>{{ context?.place || '—' }}</dd></div>
      <div><dt>Quién hizo el chequeo</dt><dd>{{ who }}</dd></div>
      <div>
        <dt>Respuestas</dt>
        <dd>{{ answered }} de {{ rows.length }}<template v-if="noAplica"> · {{ noAplica }} no aplican</template></dd>
      </div>
    </dl>

    <TransitionGroup tag="div" name="list" class="rc-novs">
      <article v-for="r in novedades" :key="r.item.id" class="rc-nov">
        <header>
          <span class="rc-eyebrow">
            {{ novedades.length === 1 ? '1 novedad' : `${novedades.length} novedades` }} · {{ r.section.title }} {{ r.item.n }}
          </span>
          <button v-if="canChange" type="button" class="rc-change" @click="emit('change', r.section.id, r.item.id)">
            Cambiar
          </button>
        </header>
        <p class="rc-found">{{ r.answer?.descripcion || r.item.prompt }}</p>
        <p class="rc-did">{{ actionLabel ?? 'Qué hiciste' }}: {{ r.answer?.accion || '—' }}</p>
        <p v-if="r.answer?.responsable || r.answer?.plazo || r.answer?.estado" class="rc-did">
          Seguimiento:
          <template v-if="r.answer?.responsable">{{ r.answer.responsable }}</template>
          <template v-if="r.answer?.plazo"> · para el {{ formatActivity(r.answer.plazo) }}</template>
          · {{ r.answer?.estado === 'cerrada' ? 'cerrada' : 'abierta' }}
        </p>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.rc {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

// Datos del chequeo: etiqueta en gris, dato en tinta.
.rc-sum {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.5rem;

  dt {
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink-600);
  }

  dd {
    margin: 0.15rem 0 0;
    font-size: 1.08rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.rc-novs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

// La novedad va arriba y se distingue: fondo ámbar claro y borde a la izquierda.
.rc-nov {
  padding: 1rem 1.1rem 1.05rem 1.25rem;
  border-radius: var(--radius);
  background: var(--warning-100);
  border: 1px solid var(--warning-line);
  box-shadow: inset 4px 0 0 var(--warning);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  p {
    margin: 0.35rem 0 0;
    font-size: 1rem;
  }
}

.rc-eyebrow {
  font-size: 1rem;
  font-weight: 600;
  color: #7a4f12;
}

.rc-change {
  min-height: 44px;
  padding: 0 0.6rem;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--navy-800);
}

.rc-found {
  font-weight: 600;
  font-size: 1.12rem !important;
  line-height: 1.4;
}

.rc-did {
  color: var(--ink-900);
}
</style>
