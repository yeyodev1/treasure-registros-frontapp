<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore, ROLE_LABELS } from '@/stores/user'
import { useConfirmStore } from '@/stores/confirm'
import { useSound } from '@/composables/useSound'
import { apiSummary } from '@/services/api'
import BrandSeal from '@/components/ui/BrandSeal.vue'
import NoticeBell from '@/components/ui/NoticeBell.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const confirmStore = useConfirmStore()
const { muted, toggleMute, play } = useSound()

const drawerOpen = shallowRef(false)
const toSign = shallowRef(0)

/** El sistema del bar es para quien trabaja en él (no para Capitán o tripulación). */
const BAR_URL = 'https://teseturis.app'
const showBarLink = computed(() =>
  ['duena', 'admin', 'direccion', 'bartender', 'bodega'].includes(userStore.role ?? ''),
)

const pageTitle = computed(() => (route.meta.title as string) ?? '')

const initials = computed(() =>
  (userStore.user?.name ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase(),
)

async function refreshBadge() {
  try {
    const summary = await apiSummary()
    let n = 0
    if (userStore.isCaptain) n += summary.counts.por_capitan
    if (userStore.isOffice) n += summary.counts.por_oficina
    toSign.value = n
  } catch {
    // El contador es informativo.
  }
}

onMounted(refreshBadge)

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
    refreshBadge()
  },
)

function onToggleMute() {
  toggleMute()
  if (!muted.value) play('tap')
}

async function logout() {
  const ok = await confirmStore.ask({
    title: '¿Cerrar sesión?',
    message: 'Se cierra tu sesión en esta tablet. Los borradores ya guardados se conservan.',
    confirmLabel: 'Salir',
    icon: 'fa-arrow-right-from-bracket',
  })
  if (!ok) return
  userStore.clear()
  router.replace({ name: 'Login' })
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="topbar-left">
        <button
          class="menu-btn"
          type="button"
          :aria-label="drawerOpen ? 'Cerrar menú' : 'Abrir menú'"
          @click="drawerOpen = !drawerOpen"
        >
          <i class="fa-solid" :class="drawerOpen ? 'fa-xmark' : 'fa-bars'" aria-hidden="true" />
        </button>
        <div class="brand">
          <BrandSeal :size="44" />
          <span class="brand-text">
            <span class="brand-eyebrow">Registros ISM · Treasure</span>
            <span class="brand-page">{{ pageTitle }}</span>
          </span>
        </div>
      </div>
      <div class="session">
        <NoticeBell />
        <button
          class="icon-btn"
          type="button"
          :aria-label="muted ? 'Activar sonidos' : 'Silenciar sonidos'"
          @click="onToggleMute"
        >
          <i class="fa-solid" :class="muted ? 'fa-volume-xmark' : 'fa-volume-high'" aria-hidden="true" />
        </button>
        <button class="session-out" type="button" @click="logout">
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
          <span class="session-out-label">Salir</span>
        </button>
      </div>
    </header>

    <div class="body">
      <Transition name="fade">
        <div v-if="drawerOpen" class="scrim" @click="drawerOpen = false" />
      </Transition>

      <nav class="sidenav" :class="{ 'sidenav--open': drawerOpen }">
        <div class="sections">
          <div class="section">
            <p class="section-label">Registros</p>
            <RouterLink to="/" class="nav-item">
              <span class="nav-indicator" aria-hidden="true" />
              <i class="fa-solid fa-house nav-icon" aria-hidden="true" /> Mis tareas
            </RouterLink>
            <RouterLink to="/nuevo" class="nav-item">
              <span class="nav-indicator" aria-hidden="true" />
              <i class="fa-solid fa-file-circle-plus nav-icon" aria-hidden="true" /> Nuevo registro
            </RouterLink>
            <RouterLink to="/por-firmar" class="nav-item">
              <span class="nav-indicator" aria-hidden="true" />
              <i class="fa-solid fa-signature nav-icon" aria-hidden="true" /> Por firmar
              <span v-if="toSign" class="badge">{{ toSign }}</span>
            </RouterLink>
            <RouterLink to="/archivo" class="nav-item">
              <span class="nav-indicator" aria-hidden="true" />
              <i class="fa-solid fa-box-archive nav-icon" aria-hidden="true" /> Archivo
            </RouterLink>
            <RouterLink v-if="userStore.role === 'designada' || userStore.role === 'duena'" to="/tripulantes" class="nav-item">
              <span class="nav-indicator" aria-hidden="true" />
              <i class="fa-solid fa-users nav-icon" aria-hidden="true" /> Tripulantes
            </RouterLink>
          </div>
          <div v-if="showBarLink" class="section">
            <p class="section-label">Otras apps</p>
            <a :href="BAR_URL" class="nav-item" target="_blank" rel="noopener">
              <i class="fa-solid fa-martini-glass-citrus nav-icon" aria-hidden="true" /> Sistema del bar
              <i class="fa-solid fa-arrow-up-right-from-square ext" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div class="user">
          <span class="user-avatar">{{ initials }}</span>
          <span class="user-info">
            <span class="user-name">{{ userStore.user?.name }}</span>
            <span class="user-role">{{ userStore.role ? ROLE_LABELS[userStore.role] : '' }}</span>
          </span>
        </div>
      </nav>

      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.shell {
  --header-h: 64px;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  box-sizing: border-box;
  height: calc(var(--header-h) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 0.75rem 0;
  // Portada del menú: azul empolvado con las algas a línea.
  background: var(--powder-300);
  border-bottom: 1px solid rgba(27, 43, 37, 0.22);
  color: var(--ink-900);
  position: sticky;
  top: 0;
  z-index: 30;
  isolation: isolate;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/brand/algas.png') center 40% / 320px auto repeat;
    opacity: 0.3;
    // Despeja el sello y el título: las algas aparecen hacia la derecha.
    mask-image: linear-gradient(to right, transparent 120px, #000 340px);
    pointer-events: none;
    z-index: -1;
  }
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.menu-btn {
  @include touch-target;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  font-size: 1.1rem;
  color: var(--ink-900);

  @include desktop {
    display: none;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.brand-eyebrow {
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--navy-700);
  white-space: nowrap;
}

.brand-page {
  font-family: var(--font-serif);
  font-size: 1.15rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.icon-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--ink-900);

  &:hover {
    background: rgba(27, 43, 37, 0.08);
  }
}

.session-out {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(27, 43, 37, 0.35);
  color: var(--ink-900);
  font-weight: 600;
  font-size: 1rem;

  &:hover {
    border-color: var(--navy-700);
  }
}

.session-out-label {
  display: none;

  @include tablet {
    display: inline;
  }
}

.body {
  display: flex;
  flex: 1;
}

.scrim {
  position: fixed;
  inset: 0;
  background: rgba(18, 30, 25, 0.5);
  z-index: 24;

  @include desktop {
    display: none;
  }
}

.sidenav {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 250px;
  padding: calc(var(--header-h) + 12px + env(safe-area-inset-top)) 0.8rem 1rem;
  background: var(--surface);
  border-right: 1px solid var(--cream-200);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 25;
  transform: translateX(-100%);
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0.25, 1);
  overflow-y: auto;

  &--open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  @include desktop {
    position: sticky;
    top: var(--header-h);
    height: calc(100dvh - var(--header-h));
    transform: none;
    box-shadow: none;
    padding-top: 1.1rem;
  }
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.section-label {
  margin: 0 0 0.3rem;
  padding: 0 0.8rem;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-400);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 48px;
  padding: 0.62rem 0.8rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 1rem;
  color: var(--ink-600);
  transition: background 0.15s ease, color 0.15s ease;

  & + & {
    margin-top: 0.15rem;
  }

  .nav-indicator {
    position: absolute;
    left: 0;
    top: 22%;
    bottom: 22%;
    width: 3px;
    border-radius: 3px;
    background: var(--gold-500);
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  &.router-link-exact-active {
    background: var(--navy-800);
    color: #fff;

    .nav-icon {
      color: var(--gold-400);
    }

    .nav-indicator {
      opacity: 1;
    }
  }

  &:hover:not(.router-link-exact-active) {
    background: var(--cream-100);
  }
}

.nav-icon {
  width: 1.25rem;
  text-align: center;
  color: var(--ink-400);
}

.badge {
  margin-left: auto;
  min-width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--gold-500);
  color: #fff;
  font-size: 0.75rem;
}

.ext {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--ink-400);
}

.user {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.6rem;
  border-top: 1px solid var(--cream-200);
}

.user-avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--navy-800);
  color: var(--gold-400);
  font-family: var(--font-serif);
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.user-name {
  font-weight: 600;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-role {
  font-size: 1rem;
  color: var(--ink-600);
}

.content {
  flex: 1;
  min-width: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
