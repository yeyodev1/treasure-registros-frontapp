<script setup lang="ts">
import { computed } from 'vue'
import { useCatalogStore } from '@/stores/catalog'
import type { IsmRecord } from '@/types'

/**
 * Cadena de firmas en una línea, para las filas de las listas: tres marcas
 * (firmado, le toca, después) y a quién le toca, en palabras. Es la misma
 * cadena de las pantallas de firma: Tripulante → Capitán → Persona Designada.
 */
const props = defineProps<{ record: Pick<IsmRecord, 'code' | 'status' | 'returnInfo'> }>()
const catalog = useCatalogStore()

const STAGE_NAMES: Record<string, string> = {
  tripulacion: 'Tripulante',
  capitan: 'Capitán',
  oficina: 'Persona Designada',
}

const trail = computed(() => {
  const form = catalog.byCode.get(props.record.code)
  const stages = (['tripulacion', 'capitan', 'oficina'] as const).filter((s) => {
    if (s === 'oficina') return true
    if (!form) return true
    if (s === 'tripulacion') return !form.officeOnly
    return (form.stages?.capitan ?? 0) > 0
  })
  const status = props.record.status
  const nowStage = status === 'borrador' ? (form?.officeOnly ? 'oficina' : 'tripulacion') : status === 'por_capitan' ? 'capitan' : status === 'por_oficina' ? 'oficina' : null
  const nowIndex = nowStage ? stages.indexOf(nowStage) : stages.length
  const returned = Boolean(props.record.returnInfo) && status !== 'archivado'
  const marks = stages.map((s, i) => ({
    key: s,
    name: STAGE_NAMES[s]!,
    state: i < nowIndex ? 'done' : i === nowIndex ? (returned ? 'ret' : 'now') : 'later',
  }))
  const TURN: Record<string, string> = {
    tripulacion: 'Le toca a quien lo hizo',
    capitan: 'Le toca al Capitán',
    oficina: 'Le toca a la Persona Designada',
  }
  const BACK: Record<string, string> = {
    tripulacion: 'Devuelto a quien lo hizo',
    capitan: 'Devuelto al Capitán',
    oficina: 'Devuelto',
  }
  const current = marks[nowIndex]
  const text = status === 'archivado' ? 'Archivado' : current ? (returned ? BACK : TURN)[current.key]! : ''
  return { marks, text }
})
</script>

<template>
  <span class="trail" :aria-label="`Firmas: ${trail.text}`">
    <span class="trail-marks" aria-hidden="true">
      <span v-for="m in trail.marks" :key="m.key" class="trail-mark" :class="`trail-mark--${m.state}`" :title="m.name">
        <i v-if="m.state === 'done'" class="fa-solid fa-check" />
        <i v-else-if="m.state === 'ret'" class="fa-solid fa-rotate-left" />
      </span>
    </span>
    <span class="trail-text">{{ trail.text }}</span>
  </span>
</template>

<style scoped lang="scss">
.trail {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.trail-marks {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.trail-mark {
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.62rem;
  color: #fff;
  border: 2px solid var(--line-strong);
  background: var(--surface);

  & + & {
    margin-left: 12px;

    &::before {
      content: '';
      position: absolute;
      right: 100%;
      top: 50%;
      width: 12px;
      height: 2px;
      margin-right: 2px;
      transform: translateY(-50%);
      background: var(--line-strong);
    }
  }

  &--done {
    background: var(--success);
    border-color: var(--success);
  }

  &--now {
    background: var(--gold-500);
    border-color: var(--gold-500);
  }

  &--ret {
    background: var(--danger);
    border-color: var(--danger);
  }
}

.trail-text {
  font-size: 1rem;
  color: var(--ink-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
