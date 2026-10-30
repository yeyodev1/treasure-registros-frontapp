import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { SessionUser, UserRole } from '@/types'
import { apiLogin, apiMe, apiRefresh } from '@/services/api'
import { getToken, isUnauthorized, setToken, tokenClaims, tokenExpired } from '@/services/httpBase'

export const ROLE_LABELS: Record<UserRole, string> = {
  duena: 'Gerencia',
  admin: 'Administración',
  direccion: 'Dirección de crucero',
  bartender: 'Bar',
  bodega: 'Bodega',
  capitan: 'Capitán',
  tripulante: 'Tripulación',
  designada: 'Persona Designada',
}

const USER_KEY = 'treasure.user'
const REMEMBER_KEY = 'ism.remember'
const EXPIRED_KEY = 'ism.sessionExpired'

function readCachedUser(): SessionUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as SessionUser | null
  } catch {
    return null
  }
}

function cacheUser(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // Sin almacenamiento local disponible.
  }
}

export const useUserStore = defineStore('user', () => {
  const user = ref<SessionUser | null>(null)
  const loading = shallowRef(false)

  const isLogged = computed(() => Boolean(user.value))
  const role = computed(() => user.value?.role ?? null)
  /** Gerencia o Administración: ven y pueden todo. */
  const isAdmin = computed(() => role.value === 'admin' || role.value === 'duena')
  /** Firma y aprueba como Capitán. */
  const isCaptain = computed(() => role.value === 'capitan' || isAdmin.value)
  /** Recibe, firma y archiva en oficina. */
  const isOffice = computed(() => role.value === 'designada' || isAdmin.value)
  /** Ve todos los registros (la tripulación ve los suyos). */
  const seesAll = computed(() => ['duena', 'admin', 'capitan', 'designada'].includes(role.value ?? ''))

  /** Última elección de "Mantener sesión en esta tableta". */
  function rememberedChoice(): boolean {
    try {
      return localStorage.getItem(REMEMBER_KEY) !== '0'
    } catch {
      return true
    }
  }

  async function login(email: string, password: string, remember: boolean) {
    loading.value = true
    try {
      const data = await apiLogin(email, password, remember)
      setToken(data.token)
      user.value = data.user
      cacheUser(data.user)
      try {
        localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
        sessionStorage.removeItem(EXPIRED_KEY)
      } catch {
        // nada
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Recupera la sesión al abrir la app. Solo un 401 real (o un token vencido)
   * la cierra: sin señal o con el servidor despertando, la tablet sigue con
   * el usuario guardado y se valida después.
   */
  async function restore() {
    const token = getToken()
    if (!token) return
    if (tokenExpired(token)) {
      expire()
      return
    }
    const claims = tokenClaims(token)!
    const cached = readCachedUser()
    const known = Boolean(cached && cached.id === claims.sub)
    user.value = known
      ? cached
      : { id: claims.sub, name: claims.name, email: '', role: claims.role as UserRole }
    const check = apiMe()
      .then((fresh) => {
        user.value = fresh
        cacheUser(fresh)
      })
      .catch((err) => {
        if (isUnauthorized(err)) expire()
        // Otro error: se conserva la sesión; se reintenta al volver la señal.
      })
    // Con el usuario ya guardado en la tableta, la pantalla no espera al
    // servidor (falla 12: ~3 s en blanco mientras despertaba).
    if (!known) await check
  }

  let refreshing: Promise<void> | null = null

  /** Renueva el token cuando ya pasó la mitad de su vida (sesión deslizante). */
  function refreshIfNeeded(force = false): Promise<void> {
    const claims = tokenClaims()
    if (!claims || !user.value) return Promise.resolve()
    const now = Date.now() / 1000
    if (claims.exp <= now) {
      expire()
      return Promise.resolve()
    }
    const half = claims.iat + (claims.exp - claims.iat) / 2
    if (!force && now < half) return Promise.resolve()
    if (!refreshing) {
      refreshing = apiRefresh()
        .then((data) => {
          setToken(data.token)
          user.value = data.user
          cacheUser(data.user)
        })
        .catch(() => undefined)
        .finally(() => {
          refreshing = null
        })
    }
    return refreshing
  }

  /** La sesión venció: se avisa en el login que las respuestas siguen en la tableta. */
  function expire() {
    try {
      sessionStorage.setItem(EXPIRED_KEY, '1')
    } catch {
      // nada
    }
    clear()
  }

  function consumeExpiredNotice(): boolean {
    try {
      const flag = sessionStorage.getItem(EXPIRED_KEY) === '1'
      return flag
    } catch {
      return false
    }
  }

  function clear() {
    setToken(null)
    cacheUser(null)
    user.value = null
  }

  return {
    user,
    loading,
    isLogged,
    role,
    isAdmin,
    isCaptain,
    isOffice,
    seesAll,
    rememberedChoice,
    login,
    restore,
    refreshIfNeeded,
    expire,
    consumeExpiredNotice,
    clear,
  }
})
