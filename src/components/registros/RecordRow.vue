<script setup lang="ts">
import { computed } from 'vue'
import { useCatalogStore } from '@/stores/catalog'
import { formatStamp, recordWhen, recordWho } from '@/utils/ism'
import SignTrail from '@/components/sign/SignTrail.vue'
import type { IsmRecord } from '@/types'

/**
 * Una fila de Por firmar o del Archivo: qué es, cuándo y quién, las marcas
 * que importan (novedad, devuelto, prueba) y la cadena de firmas. El PDF se
 * abre con un botón con texto, no con un ícono suelto.
 */
const props = defineProps<{ record: IsmRecord }>()
const emit = defineEmits<{ pdf: [record: IsmRecord] }>()
const catalog = useCatalogStore()

/** Nombre reconocible: la tarjeta del formato guiado ("Preparar el zarpe") o el título oficial. */
const title = computed(() => {
  const card = catalog.byCode.get(props.record.code)?.card
  return props.record.schemaVersion && card ? card.title : props.record.title
})

const readyToSign = computed(() => {
  const r = props.record
  return r.status === 'borrador' && !r.returnInfo && r.flags && r.flags.total > 0 && r.flags.answered === r.flags.total
})

const place = computed(() => {
  const r = props.record
  return [r.context?.place, r.equipment?.name, r.position ? catalog.positionLabel.get(r.position) ?? r.position : '']
    .filter(Boolean)
    .join(' · ')
})
</script>

<template>
  <div class="rr" :class="{ 'rr--returned': record.returnInfo && record.status !== 'archivado', 'rr--nov': record.flags?.novedades }">
    <RouterLink :to="`/registro/${record._id}`" class="rr-main">
      <span class="rr-title">
        {{ title }} <span class="rr-code">{{ record.code.replace('_', ' · ') }}</span>
      </span>
      <span class="rr-meta">
        {{ recordWhen(record) }}<template v-if="place"> · {{ place }}</template><template v-if="recordWho(record)"> · {{ recordWho(record) }}</template>
      </span>
      <span v-if="record.returnInfo && record.status !== 'archivado'" class="rr-returned">
        <i class="fa-solid fa-rotate-left" aria-hidden="true" />
        <span>Devuelto<template v-if="record.returnInfo.section"> · {{ record.returnInfo.section }}</template>: {{ record.returnInfo.reason }}</span>
      </span>
      <span class="rr-tags">
        <SignTrail :record="record" />
        <span v-if="record.flags?.novedades" class="pill pill--nov">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          {{ record.flags.novedades }} {{ record.flags.novedades === 1 ? 'novedad' : 'novedades' }}
        </span>
        <span v-if="record.flags?.noAplica" class="pill">{{ record.flags.noAplica }} no aplican</span>
        <span v-if="readyToSign" class="pill pill--turn">
          <i class="fa-solid fa-signature" aria-hidden="true" /> Falta firmar y enviar
        </span>
        <span v-if="record.test" class="pill"><i class="fa-solid fa-flask" aria-hidden="true" /> Prueba</span>
      </span>
      <span class="rr-by">Actualizado {{ formatStamp(record.updatedAt) }} · {{ record.fileName }}</span>
    </RouterLink>
    <button type="button" class="rr-pdf" :aria-label="`Ver el PDF ${record.fileName}`" @click="emit('pdf', record)">
      <i class="fa-regular fa-file-pdf" aria-hidden="true" />
      <span>PDF</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.rr {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.9rem 0 0;
  background: var(--surface);
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }

  &--returned {
    box-shadow: inset 4px 0 0 var(--danger);
  }
}

.rr-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 0 1rem 1.25rem;
}

.rr-title {
  font-weight: 600;
  font-size: 1.08rem;
}

.rr-code {
  font-weight: 500;
  color: var(--ink-400);
  white-space: nowrap;
}

.rr-meta {
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.rr-returned {
  display: flex;
  gap: 0.5rem;
  color: var(--danger);
  font-weight: 600;

  i {
    margin-top: 0.3rem;
    font-size: 0.85rem;
  }
}

.rr-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.8rem;
  margin-top: 0.15rem;
}

.rr-by {
  font-size: 1rem;
  color: var(--ink-400);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rr-pdf {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 48px;
  padding: 0 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: #fff;
  font-weight: 600;
  color: var(--navy-800);
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    border-color: var(--navy-600);
    background: var(--hover);
  }

  // En el teléfono el botón queda solo con el ícono (su nombre lo lee el lector).
  @media (max-width: 639px) {
    width: 48px;
    padding: 0;
    justify-content: center;
    align-self: flex-start;
    margin-top: 0.9rem;

    span {
      display: none;
    }
  }
}

.rr {
  @media (max-width: 639px) {
    padding-right: 0.6rem;
  }
}

.rr-main {
  @media (max-width: 639px) {
    padding-left: 1rem;
  }
}
</style>
