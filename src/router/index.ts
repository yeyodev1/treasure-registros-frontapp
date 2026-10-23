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
    meta: { title: 'Inicio' },
  },
  {
    path: '/nuevo',
    name: 'New',
    component: () => import('@/views/NewRecordView.vue'),
    meta: { title: 'Nuevo registro' },
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
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  if (to.meta.public) return true
  if (!userStore.isLogged) await userStore.restore()
  if (!userStore.isLogged) return { name: 'Login', query: { next: to.fullPath } }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Registros ISM` : 'Registros ISM'
})

export default router
