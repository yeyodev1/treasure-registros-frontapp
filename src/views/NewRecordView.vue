<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore } from '@/stores/catalog'
import { useUserStore } from '@/stores/user'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { apiCreateRecord } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { FREQUENCY_LABELS, todayGalapagos } from '@/utils/ism'
import { newKey } from '@/utils/format'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmCatalogItem } from '@/types'

const router = useRouter()
const route = useRoute()
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
/** Una clave por intento de creación: reintentar no duplica el registro. */
let creationKey = newKey()

onMounted(async () => {
  try {
    await catalog.load()
    // Acceso directo desde "Mis tareas" (?formato=R-16).
    const code = route.query.formato
    const target = typeof code === 'string' ? catalog.byCode.get(code) : undefined
    if (target) choose(target)
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
  // Los formatos con llenado guiado (R-14) se abren en su asistente.
  if (f.guidedVersion) {
    router.push(`/formato/${f.code}/nuevo`)
    return
  }
  chosen.value = f
  creationKey = newKey()
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
      idempotencyKey: creationKey,
    })
    creationKey = newKey()
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
    <header class="page-head">
      <div>
        <h1 class="page-title">Nuevo registro</h1>
        <p class="page-lead">Elige el formato oficial. Se abre igual que el papel, listo para llenar y firmar.</p>
      </div>
    </header>

    <div class="search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
      <input v-model="query" type="search" aria-label="Buscar formato" placeholder="Busca por código o nombre: R-16, botiquín, zarpe" />
    </div>

    <SkeletonList v-if="loading" variant="card" :rows="6" />

    <p v-else-if="!groups.length" class="empty-state">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
      <span><strong>No hay formatos con «{{ query }}».</strong> Prueba con el código, por ejemplo R-16.</span>
    </p>

    <section v-for="[group, items] in groups" :key="group" class="group" :aria-label="group">
      <h2>{{ group }}</h2>
      <TransitionGroup tag="ul" name="list" appear class="forms card">
        <li v-for="f in items" :key="f.code">
          <button type="button" class="form" :class="{ locked: blocked(f) }" @click="choose(f)">
            <span class="fbody">
              <span class="ftitle">{{ f.title }} <span class="fcode">{{ f.code.replace('_', ' · ') }}</span></span>
              <span class="fmeta">
                {{ FREQUENCY_LABELS[f.frequency] ?? f.frequency }}<template v-if="f.stages.capitan"> · Firma el Capitán</template><template v-if="f.pages > 1"> · {{ f.pages }} páginas</template>
              </span>
              <span v-if="f.officeOnly" class="fmeta flock">
                <i class="fa-solid fa-lock" aria-hidden="true" /> Lo llena la Persona Designada
              </span>
            </span>
            <span v-if="f.guidedVersion" class="pill pill--ok">Paso a paso</span>
            <i class="fa-solid fa-chevron-right fchev" aria-hidden="true" />
          </button>
        </li>
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

.search {
  position: relative;
  margin-bottom: 1.75rem;
  max-width: 620px;

  i {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-400);
  }

  input {
    width: 100%;
    min-height: 52px;
    padding: 0 1rem 0 2.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font: inherit;
    font-size: 1.05rem;
    transition: border-color 0.15s ease;

    &:focus {
      outline: 3px solid var(--powder-300);
      border-color: var(--navy-600);
    }
  }
}

.group {
  margin-bottom: 2rem;

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.35rem;
  }
}

// Los formatos de un grupo en una sola lista; dos columnas en computadora.
.forms {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr);

  li {
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: none;
  }

  @media (min-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 0;

    li:nth-child(2) {
      border-top: none;
    }

    li:nth-child(even) {
      border-left: 1px solid var(--line);
    }
  }
}

.form {
  width: 100%;
  height: 100%;
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.85rem 1rem 0.85rem 1.25rem;
  text-align: left;
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }

  &.locked .ftitle {
    color: var(--ink-600);
  }
}

.fbody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ftitle {
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.35;
}

.fcode {
  font-weight: 500;
  color: var(--ink-400);
  white-space: nowrap;
}

.fmeta {
  font-size: 1rem;
  color: var(--ink-600);
}

.flock i {
  font-size: 0.85rem;
  margin-right: 0.2rem;
}

.fchev {
  color: var(--ink-400);
  font-size: 0.85rem;
}

.new-form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;

  small {
    color: var(--ink-600);
    font-size: 1rem;
  }

  .btn {
    min-height: 56px;
  }
}

.note {
  margin: 0;
  font-size: 1rem;
  color: var(--navy-900);
  background: var(--powder-100);
  border-radius: var(--radius-sm);
  padding: 0.75rem 0.9rem;
}
</style>
