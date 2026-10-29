<script setup lang="ts">
import { computed } from 'vue'
import { hasNovedad, schemaItems } from '@/utils/guided'
import type { IsmAnswer, IsmContext, IsmMissing, IsmSchema } from '@/types'

/**
 * Resumen de un registro guiado: novedades destacadas arriba (para quien
 * revisa), "no aplica" con su motivo y cada sección con sus respuestas. Los
 * faltantes llevan a su pregunta exacta.
 */
const props = defineProps<{
  schema: IsmSchema
  answers: Record<string, IsmAnswer>
  context: Partial<IsmContext> | null
  missing?: IsmMissing[]
  positionLabel?: (value: string) => string
  /** Muestra el botón para ir a la pregunta (solo quien llena). */
  canGoTo?: boolean
}>()

const emit = defineEmits<{ goto: [sectionId: string, itemId: string] }>()

const rows = computed(() => schemaItems(props.schema).map(({ section, item }) => ({ section, item, answer: props.answers[item.id] })))
const novedades = computed(() => rows.value.filter((r) => hasNovedad(r.answer)))
const noAplica = computed(() => rows.value.filter((r) => r.answer?.value === 'na'))

const missingByItem = computed(() => {
  const map = new Map<string, IsmMissing[]>()
  for (const m of props.missing ?? []) {
    const key = m.item || `ctx.${m.field}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return map
})
const contextMissing = computed(() => (props.missing ?? []).filter((m) => m.section === 'contexto'))

const LABEL: Record<string, string> = { si: 'Sí', no: 'No', na: 'No aplica' }

function fmtDate(key?: string) {
  const [y, m, d] = (key ?? '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}
</script>

<template>
  <div class="sum">
    <section class="sum-ctx card">
      <dl>
        <div><dt>Embarcación</dt><dd>{{ context?.vessel || schema.vessel }}</dd></div>
        <div><dt>Fecha de la actividad</dt><dd>{{ fmtDate(context?.activityDate) }}</dd></div>
        <div><dt>Hora</dt><dd>{{ context?.activityTime || '—' }}</dd></div>
        <div><dt>Lugar</dt><dd>{{ context?.place || '—' }}</dd></div>
        <div>
          <dt>Quién llena</dt>
          <dd>
            {{ context?.filledBy?.name || '—' }}
            <template v-if="context?.filledBy?.position"> · {{ positionLabel?.(context.filledBy.position) ?? context.filledBy.position }}</template>
          </dd>
        </div>
      </dl>
      <ul v-if="contextMissing.length" class="sum-missing">
        <li v-for="m in contextMissing" :key="m.field">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true" /> {{ m.message }}
          <button v-if="canGoTo" type="button" class="goto" @click="emit('goto', 'contexto', '')">Completar</button>
        </li>
      </ul>
    </section>

    <section class="sum-block sum-block--nov" :class="{ empty: !novedades.length }">
      <h3>
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        {{ novedades.length ? `${novedades.length} ${novedades.length === 1 ? 'novedad' : 'novedades'}` : 'Sin novedades' }}
      </h3>
      <TransitionGroup tag="ul" name="list">
        <li v-for="r in novedades" :key="r.item.id" class="nov">
          <p class="nov-ref">{{ r.section.title }} · {{ r.item.n }} · <strong>{{ r.answer?.value === 'no' ? 'No' : 'Sí, con problema' }}</strong></p>
          <p class="nov-q">{{ r.item.prompt }}</p>
          <p class="nov-d"><span>Novedad:</span> {{ r.answer?.descripcion || '—' }}</p>
          <p class="nov-d"><span>Acción tomada:</span> {{ r.answer?.accion || '—' }}</p>
          <div v-if="r.answer?.evidencia?.length" class="nov-photos">
            <a v-for="u in r.answer.evidencia" :key="u" :href="u" target="_blank" rel="noopener">
              <img :src="u" alt="Evidencia" />
            </a>
          </div>
        </li>
      </TransitionGroup>
    </section>

    <section v-if="noAplica.length" class="sum-block">
      <h3><i class="fa-solid fa-minus" aria-hidden="true" /> {{ noAplica.length }} no aplican</h3>
      <ul>
        <li v-for="r in noAplica" :key="r.item.id" class="na">
          <span class="na-ref">{{ r.section.title }} · {{ r.item.n }}</span>
          <span>{{ r.answer?.motivo || '—' }}</span>
        </li>
      </ul>
    </section>

    <section v-for="s in schema.sections" :key="s.id" class="sum-sec card">
      <h3>{{ s.title }}</h3>
      <ul>
        <li
          v-for="it in s.items"
          :key="it.id"
          class="row"
          :class="{ 'row--miss': missingByItem.has(it.id), 'row--nov': hasNovedad(answers[it.id]) }"
        >
          <span class="row-n">{{ it.n }}</span>
          <span class="row-q">
            {{ it.prompt }}
            <small v-for="m in missingByItem.get(it.id) ?? []" :key="m.field" class="row-miss">
              <i class="fa-solid fa-circle-exclamation" aria-hidden="true" /> {{ m.message }}
            </small>
          </span>
          <span class="row-a" :class="answers[it.id]?.value ? `a-${answers[it.id]!.value}` : 'a-none'">
            {{ answers[it.id]?.value ? LABEL[answers[it.id]!.value!] : 'Sin responder' }}
          </span>
          <button v-if="canGoTo && missingByItem.has(it.id)" type="button" class="goto" @click="emit('goto', s.id, it.id)">
            Ir a la pregunta
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.sum {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.sum-ctx dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 1rem;

  @include desktop {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  dt {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-400);
  }

  dd {
    margin: 0.1rem 0 0;
    font-weight: 600;
  }
}

.sum-missing {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  color: var(--danger);
  font-size: 0.86rem;
  font-weight: 600;

  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
}

.sum-block {
  border-radius: var(--radius);
  padding: 1rem;
  background: var(--surface);
  box-shadow: var(--shadow);

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  &--nov {
    background: rgba(185, 128, 47, 0.1);
    border: 1.5px solid rgba(185, 128, 47, 0.45);

    h3 {
      color: #7a4f14;
    }

    &.empty {
      background: rgba(63, 122, 87, 0.08);
      border-color: rgba(63, 122, 87, 0.35);

      h3 {
        color: var(--success);
        margin: 0;
      }
    }
  }
}

.nov {
  background: #fff;
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.8rem;
  border-left: 4px solid var(--warning);

  p {
    margin: 0;
  }
}

.nov-ref {
  font-size: 0.75rem;
  color: var(--ink-400);
}

.nov-q {
  font-weight: 600;
  margin: 0.15rem 0 0.3rem !important;
}

.nov-d {
  font-size: 0.9rem;

  span {
    color: var(--ink-400);
    font-weight: 600;
  }
}

.nov-photos {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;

  img {
    width: 76px;
    height: 58px;
    object-fit: cover;
    border-radius: 6px;
  }
}

.na {
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.na-ref {
  font-size: 0.75rem;
  color: var(--ink-400);
}

.sum-sec {
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 0.2rem 0.6rem;
  align-items: center;
  padding: 0.5rem 0.2rem;
  border-bottom: 1px solid var(--cream-200);
  font-size: 0.9rem;

  &:last-child {
    border-bottom: none;
  }

  &--miss {
    background: rgba(180, 72, 59, 0.06);
  }

  .goto {
    grid-column: 2 / -1;
    justify-self: start;
  }
}

.row-n {
  font-weight: 700;
  color: var(--ink-400);
  font-variant-numeric: tabular-nums;
}

.row-q {
  display: flex;
  flex-direction: column;
}

.row-miss {
  color: var(--danger);
  font-weight: 600;
  font-size: 0.78rem;
}

.row-a {
  justify-self: end;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;

  &.a-si {
    background: rgba(63, 122, 87, 0.14);
    color: var(--success);
  }

  &.a-no {
    background: rgba(180, 72, 59, 0.12);
    color: var(--danger);
  }

  &.a-na {
    background: var(--cream-200);
    color: var(--ink-600);
  }

  &.a-none {
    background: transparent;
    color: var(--danger);
    border: 1px dashed rgba(180, 72, 59, 0.5);
  }
}

.goto {
  min-height: 40px;
  padding: 0 0.85rem;
  border-radius: 999px;
  background: var(--navy-800);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
