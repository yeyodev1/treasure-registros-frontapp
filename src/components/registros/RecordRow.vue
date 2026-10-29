<script setup lang="ts">
import { useCatalogStore } from '@/stores/catalog'
import { STATUS_ICONS, STATUS_LABELS, authorName, formatRecordDate, formatStamp } from '@/utils/ism'
import type { IsmRecord } from '@/types'

defineProps<{ record: IsmRecord }>()
const emit = defineEmits<{ pdf: [record: IsmRecord] }>()
const catalog = useCatalogStore()
</script>

<template>
  <div class="row card" :class="{ 'row--nov': record.flags?.novedades, 'row--returned': record.returnInfo }">
    <RouterLink :to="`/registro/${record._id}`" class="main">
      <span class="dot" :class="`s-${record.status}`">
        <i class="fa-solid" :class="STATUS_ICONS[record.status]" aria-hidden="true" />
      </span>
      <span class="body">
        <strong>{{ record.code.replace('_', ' · ') }} · {{ record.title }}</strong>
        <small>
          {{ formatRecordDate(record.recordDate) }} · {{ STATUS_LABELS[record.status] }}
          <template v-if="record.equipment"> · {{ record.equipment.name }}</template>
          <template v-if="record.position"> · {{ catalog.positionLabel.get(record.position) ?? record.position }}</template>
        </small>
        <span v-if="record.flags?.novedades || record.flags?.noAplica || record.returnInfo" class="tags">
          <span v-if="record.flags?.novedades" class="tag tag--nov">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            {{ record.flags.novedades }} {{ record.flags.novedades === 1 ? 'novedad' : 'novedades' }}
          </span>
          <span v-if="record.flags?.noAplica" class="tag">
            <i class="fa-solid fa-minus" aria-hidden="true" /> {{ record.flags.noAplica }} no aplican
          </span>
          <span v-if="record.returnInfo" class="tag tag--ret">
            <i class="fa-solid fa-rotate-left" aria-hidden="true" /> Devuelto · {{ record.returnInfo.section }}
          </span>
        </span>
        <small class="by">
          <template v-if="record.context?.filledBy?.name || authorName(record)">{{ record.context?.filledBy?.name || authorName(record) }} · </template>actualizado {{ formatStamp(record.updatedAt) }}
        </small>
      </span>
    </RouterLink>
    <button type="button" class="pdf" aria-label="Ver PDF" title="Ver PDF" @click="emit('pdf', record)">
      <i class="fa-regular fa-file-pdf" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  transition: box-shadow 0.18s ease, transform 0.18s ease;

  &:hover {
    box-shadow: var(--shadow-lg);
  }
}

.row--nov {
  border-left: 4px solid var(--warning);
}

.row--returned {
  border-left: 4px solid var(--danger);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.25rem 0 0.1rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--cream-200);
  color: var(--ink-600);

  &--nov {
    background: rgba(185, 128, 47, 0.18);
    color: #7a4f14;
  }

  &--ret {
    background: rgba(180, 72, 59, 0.12);
    color: var(--danger);
  }
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: inherit;
  padding: 0.2rem;
}

.dot {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-100);
  color: var(--navy-700);
  font-size: 0.85rem;

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

.body {
  min-width: 0;
  display: flex;
  flex-direction: column;

  strong {
    font-size: 0.92rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    font-size: 0.76rem;
    color: var(--ink-600);
  }

  .by {
    color: var(--ink-400);
  }
}

.pdf {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--danger);
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 72, 59, 0.08);
  }
}
</style>
