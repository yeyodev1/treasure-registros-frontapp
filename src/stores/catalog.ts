import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { IsmCatalogItem, IsmEquipment, IsmForm, IsmSchema } from '@/types'
import { apiCatalog, apiForm, apiSchema } from '@/services/api'

/** Catálogo de registros ISM, equipos del R-16 y cargos; definiciones en caché. */
export const useCatalogStore = defineStore('catalog', () => {
  const forms = ref<IsmCatalogItem[]>([])
  const equipment = ref<IsmEquipment[]>([])
  const positions = ref<Array<{ value: string; label: string }>>([])
  const loaded = shallowRef(false)
  const definitions = new Map<string, IsmForm>()
  const schemas = new Map<string, IsmSchema>()

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

  /** Esquema guiado con la versión con que se llenó el registro. */
  async function schema(code: string, version: number) {
    const key = `${code}.v${version}`
    if (!schemas.has(key)) schemas.set(key, await apiSchema(code, version))
    return schemas.get(key)!
  }

  return { forms, equipment, positions, loaded, byCode, positionLabel, load, definition, schema }
})
