<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogStore } from '@/stores/catalog'
import { useUserStore } from '@/stores/user'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { apiCreateRecord } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { FREQUENCY_LABELS, todayGalapagos } from '@/utils/ism'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmCatalogItem } from '@/types'

const router = useRouter()
const catalog = useCatalogStore()
const userStore = useUserStore()
const toast = useToastStore()
const { play } = useSound()

const loading = shallowRef(!catalog.loaded)
const query = shallowRef('')
const chosen = shallowRef<IsmCatalogItem | null>(null)
const recordDate = shallowRef(todayGalapagos())
const equipmentFolder = shallowRef('')
const position = shallowRef('')
const creating = shallowRef(false)

onMounted(async () => {
  try {
    await catalog.load()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
})

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const groups = computed(() => {
  const q = normalize(query.value.trim())
  const map = new Map<string, IsmCatalogItem[]>()
  for (const f of catalog.forms) {
    if (q && !normalize(`${f.code} ${f.title} ${f.group}`).includes(q)) continue
    if (!map.has(f.group)) map.set(f.group, [])
    map.get(f.group)!.push(f)
  }
  return [...map.entries()]
})

const equipmentOptions = computed(() =>
  catalog.equipment.map((e) => ({ value: e.folder, label: e.name, hint: e.category })),
)

const needsEquipment = computed(() => chosen.value?.frequency === 'por_equipo')
const needsPosition = computed(() => chosen.value?.frequency.startsWith('por_cargo') ?? false)
const blocked = (f: IsmCatalogItem) => f.officeOnly && !userStore.isOffice

function choose(f: IsmCatalogItem) {
  if (blocked(f)) {
    toast.push('Este registro lo llena la oficina (Persona Designada).', 'info')
    return
  }
  chosen.value = f
  recordDate.value = todayGalapagos()
  equipmentFolder.value = ''
  position.value = f.frequency.startsWith('por_cargo') ? userStore.user?.position ?? '' : ''
}

const canCreate = computed(
  () =>
    Boolean(recordDate.value) &&
    (!needsEquipment.value || Boolean(equipmentFolder.value)) &&
    (!needsPosition.value || Boolean(position.value)),
)

async function create() {
  if (!chosen.value || !canCreate.value) return
  creating.value = true
  try {
    const rec = await apiCreateRecord({
      code: chosen.value.code,
      recordDate: recordDate.value,
      equipmentFolder: needsEquipment.value ? equipmentFolder.value : undefined,
      position: needsPosition.value ? position.value : undefined,
    })
    play('success')
    router.push(`/registro/${rec._id}`)
  } catch (err) {
    play('error')
    toast.error(apiErrorMessage(err))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">Nuevo registro</h1>
    <p class="lead">Elige el formato oficial. Se abre igual que el papel, listo para llenar y firmar.</p>

    <div class="search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
      <input v-model="query" type="search" placeholder="Buscar por código o nombre (R-16, botiquín, zarpe…)" />
    </div>

    <SkeletonList v-if="loading" variant="card" :rows="6" />

    <p v-else-if="!groups.length" class="empty">No hay formatos con «{{ query }}».</p>

    <section v-for="[group, items] in groups" :key="group" class="group">
      <h2>{{ group }}</h2>
      <TransitionGroup tag="div" name="list" appear class="grid">
        <button
          v-for="f in items"
          :key="f.code"
          type="button"
          class="form card"
          :class="{ locked: blocked(f) }"
          @click="choose(f)"
        >
          <span class="fcode">{{ f.code.replace('_', ' · ') }}</span>
          <span class="ftitle">{{ f.title }}</span>
          <span class="fmeta">
            <span><i class="fa-regular fa-clock" aria-hidden="true" /> {{ FREQUENCY_LABELS[f.frequency] ?? f.frequency }}</span>
            <span v-if="f.stages.capitan"><i class="fa-solid fa-anchor" aria-hidden="true" /> Capitán</span>
            <span v-if="f.officeOnly"><i class="fa-solid fa-building" aria-hidden="true" /> Solo oficina</span>
            <span v-if="f.pages > 1"><i class="fa-regular fa-copy" aria-hidden="true" /> {{ f.pages }} págs.</span>
          </span>
        </button>
      </TransitionGroup>
    </section>

    <BaseModal v-if="chosen" :title="`${chosen.code.replace('_', ' · ')} · ${chosen.title}`" @close="chosen = null">
      <form class="new-form" @submit.prevent="create">
        <div class="field">
          <label>Fecha del registro</label>
          <BaseDatePicker v-model="recordDate" />
        </div>

        <div v-if="needsEquipment" class="field">
          <label>Equipo</label>
          <BaseSelect v-model="equipmentFolder" :options="equipmentOptions" searchable placeholder="Elige el equipo" />
          <small>Se llenan solos el nombre, la marca, el modelo y la serie del equipo.</small>
        </div>

        <div v-if="needsPosition" class="field">
          <label>Cargo</label>
          <BaseSelect v-model="position" :options="catalog.positions" placeholder="Elige el cargo" />
        </div>

        <p class="note">
          <i class="fa-solid fa-circle-info" aria-hidden="true" />
          Se guarda solo mientras llenas. Cuando esté completo y firmado, tocas «Listo para enviar».
        </p>

        <button type="submit" class="btn btn-primary" :disabled="!canCreate || creating">
          <i class="fa-solid fa-file-pen" aria-hidden="true" /> {{ creating ? 'Abriendo…' : 'Empezar a llenar' }}
        </button>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.lead {
  margin: 0.2rem 0 1rem;
  color: var(--ink-600);
}

.search {
  position: relative;
  margin-bottom: 1.2rem;
  max-width: 560px;

  i {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-400);
  }

  input {
    width: 100%;
    min-height: 48px;
    padding: 0 1rem 0 2.5rem;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--cream-200);
    background: var(--surface);
    font: inherit;
    transition: border-color 0.15s ease;

    &:focus {
      outline: none;
      border-color: var(--gold-500);
    }
  }
}

.group {
  margin-bottom: 1.4rem;

  h2 {
    margin: 0 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-400);
  }
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.6rem;

  @include tablet {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include desktop {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--gold-400);
    box-shadow: var(--shadow-lg);
  }

  &.locked {
    opacity: 0.55;
  }
}

.fcode {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--gold-500);
}

.ftitle {
  font-weight: 600;
  line-height: 1.3;
}

.fmeta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.75rem;
  font-size: 0.75rem;
  color: var(--ink-400);
}

.empty {
  color: var(--ink-400);
}

.new-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  small {
    color: var(--ink-400);
    font-size: 0.78rem;
  }
}

.note {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-600);
  background: var(--powder-100);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.75rem;
}
</style>
