import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Ingresar', public: true },
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Mis tareas' },
  },
  {
    path: '/nuevo',
    name: 'New',
    component: () => import('@/views/NewRecordView.vue'),
    meta: { title: 'Nuevo registro' },
  },
  {
    path: '/zarpe/nuevo',
    name: 'ZarpeStart',
    component: () => import('@/views/ZarpeStartView.vue'),
    meta: { title: 'Preparar el zarpe' },
  },
  {
    path: '/por-firmar',
    name: 'Inbox',
    component: () => import('@/views/InboxView.vue'),
    meta: { title: 'Por firmar' },
  },
  {
    path: '/archivo',
    name: 'Archive',
    component: () => import('@/views/ArchiveView.vue'),
    meta: { title: 'Archivo' },
  },
  {
    path: '/registro/:id',
    name: 'Record',
    component: () => import('@/views/RecordView.vue'),
    meta: { title: 'Registro' },
  },
  {
    path: '/tripulantes',
    name: 'Crew',
    component: () => import('@/views/CrewView.vue'),
    meta: { title: 'Tripulantes', roles: ['designada', 'duena'] },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * Destino de la navegación en curso. Si la sesión vence mientras se abre un
 * registro, el login vuelve aquí (currentRoute todavía es la ruta anterior).
 */
let pendingTarget: string | null = null

export function navigationTarget(): string {
  return pendingTarget ?? router.currentRoute.value.fullPath
}

router.beforeEach(async (to) => {
  pendingTarget = to.fullPath
  const userStore = useUserStore()
  if (to.meta.public) return true
  if (!userStore.isLogged) await userStore.restore()
  if (!userStore.isLogged) {
    const expired = userStore.consumeExpiredNotice()
    return { name: 'Login', query: { next: to.fullPath, ...(expired ? { caducada: '1' } : {}) } }
  }
  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(userStore.role ?? '')) return { name: 'Home' }
  return true
})

router.afterEach((to) => {
  pendingTarget = null
  document.title = to.meta.title ? `${to.meta.title} · Registros ISM` : 'Registros ISM'
})

export default router
