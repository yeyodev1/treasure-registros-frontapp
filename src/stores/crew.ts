import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { apiCrew } from '@/services/api'
import type { CrewMember } from '@/types'

/** Lista de tripulantes a bordo, para elegir quién hace el chequeo. */
export const useCrewStore = defineStore('crew', () => {
  const members = ref<CrewMember[]>([])
  const loaded = shallowRef(false)
  const byId = computed(() => new Map(members.value.map((m) => [m.id, m])))

  async function load(force = false) {
    if (loaded.value && !force) return
    // Primero quienes hacen los chequeos; Capitán y Persona Designada al final.
    const order: Record<string, number> = { tripulante: 0, capitan: 1, designada: 2 }
    members.value = (await apiCrew({ onboard: '1' })).sort(
      (a, b) => (order[a.role] ?? 0) - (order[b.role] ?? 0) || a.name.localeCompare(b.name),
    )
    loaded.value = true
  }

  return { members, loaded, byId, load }
})
