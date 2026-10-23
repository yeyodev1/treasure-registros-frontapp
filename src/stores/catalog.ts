import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { IsmCatalogItem, IsmEquipment, IsmForm } from '@/types'
import { apiCatalog, apiForm } from '@/services/api'

/** Catálogo de registros ISM, equipos del R-16 y cargos; definiciones en caché. */
export const useCatalogStore = defineStore('catalog', () => {
  const forms = ref<IsmCatalogItem[]>([])
  const equipment = ref<IsmEquipment[]>([])
  const positions = ref<Array<{ value: string; label: string }>>([])
  const loaded = shallowRef(false)
  const definitions = new Map<string, IsmForm>()

  const byCode = computed(() => new Map(forms.value.map((f) => [f.code, f])))
  const positionLabel = computed(() => new Map(positions.value.map((p) => [p.value, p.label])))

  async function load() {
    if (loaded.value) return
    const data = await apiCatalog()
    forms.value = data.forms
    equipment.value = data.equipment
    positions.value = data.positions
    loaded.value = true
  }

  async function definition(code: string) {
    if (!definitions.has(code)) definitions.set(code, await apiForm(code))
    return definitions.get(code)!
  }

  return { forms, equipment, positions, loaded, byCode, positionLabel, load, definition }
})
