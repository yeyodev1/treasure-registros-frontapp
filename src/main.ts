import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { navigationTarget } from './router'
import { useUserStore } from './stores/user'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '@/styles/global.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const userStore = useUserStore(pinia)

// 401 real: la sesión venció. Las respuestas pendientes quedan en la tableta y
// tras ingresar se vuelve a la misma pantalla.
window.addEventListener('auth:token-expired', () => {
  const next = navigationTarget()
  const onLogin = router.currentRoute.value.name === 'Login'
  userStore.expire()
  if (!onLogin) {
    router.replace({ name: 'Login', query: { next, caducada: '1' } })
  }
})

// Sesión deslizante: se renueva al volver al primer plano y cada 10 minutos de uso.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') userStore.refreshIfNeeded()
})
window.addEventListener('online', () => {
  if (userStore.isLogged) userStore.refreshIfNeeded()
})
setInterval(() => userStore.refreshIfNeeded(), 10 * 60 * 1000)

router.isReady().then(() => userStore.refreshIfNeeded())

app.mount('#app')
