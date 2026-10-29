import axios from 'axios'

const TOKEN_KEY = 'treasure.token'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8200/api',
  // Con la señal del barco una petición colgada no debe dejar la pantalla esperando.
  timeout: 25000,
})

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Sin almacenamiento local disponible.
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export interface TokenClaims {
  sub: string
  name: string
  role: string
  remember?: boolean
  iat: number
  exp: number
}

/** Lee el contenido del JWT (sin verificarlo: eso lo hace el servidor). */
export function tokenClaims(token: string | null = getToken()): TokenClaims | null {
  if (!token) return null
  try {
    const part = token.split('.')[1] ?? ''
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenClaims
  } catch {
    return null
  }
}

export function tokenExpired(token: string | null = getToken()): boolean {
  const claims = tokenClaims(token)
  return !claims || claims.exp * 1000 <= Date.now()
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error) => {
    // Solo un 401 real de una petición con sesión cierra la sesión. Un 503 por
    // arranque en frío o la red del barco nunca te saca al login.
    const sentToken = Boolean(error.config?.headers?.Authorization)
    const isLogin = String(error.config?.url ?? '').includes('/auth/login')
    if (error.response?.status === 401 && sentToken && !isLogin) {
      window.dispatchEvent(new CustomEvent('auth:token-expired'))
    }
    return Promise.reject(error)
  },
)

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

/** Sin respuesta del servidor: sin señal, tiempo agotado o servidor despertando. */
export function isNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  if (!error.response) return true
  return [502, 503, 504].includes(error.response.status)
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'La conexión tardó demasiado. Revisa la señal e inténtalo otra vez.'
    if (!error.response) return 'Sin conexión con el servidor'
    return (error.response.data as { message?: string })?.message ?? 'Error de conexión'
  }
  return 'Error inesperado'
}
