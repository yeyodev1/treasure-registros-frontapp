import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { SessionUser, UserRole } from '@/types'
import { apiLogin, apiMe } from '@/services/api'
import { getToken, setToken } from '@/services/httpBase'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administración',
  direccion: 'Dirección de crucero',
  bartender: 'Bar',
  bodega: 'Bodega',
  capitan: 'Capitán',
  tripulante: 'Tripulación',
  designada: 'Persona Designada',
}

export const useUserStore = defineStore('user', () => {
  const user = ref<SessionUser | null>(null)
  const loading = shallowRef(false)

  const isLogged = computed(() => Boolean(user.value))
  const role = computed(() => user.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  /** Firma y aprueba como Capitán. */
  const isCaptain = computed(() => role.value === 'capitan' || role.value === 'admin')
  /** Recibe, firma y archiva en oficina. */
  const isOffice = computed(() => role.value === 'designada' || role.value === 'admin')
  /** Ve todos los registros (la tripulación ve los suyos). */
  const seesAll = computed(() => ['admin', 'capitan', 'designada'].includes(role.value ?? ''))

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const data = await apiLogin(email, password)
      setToken(data.token)
      user.value = data.user
    } finally {
      loading.value = false
    }
  }

  async function restore() {
    if (!getToken()) return
    try {
      user.value = await apiMe()
    } catch {
      clear()
    }
  }

  function clear() {
    setToken(null)
    user.value = null
  }

  return { user, loading, isLogged, role, isAdmin, isCaptain, isOffice, seesAll, login, restore, clear }
})
