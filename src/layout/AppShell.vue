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

const toSign = shallowRef(0)

/** El sistema del bar es para quien trabaja en él (no para Capitán o tripulación). */
const BAR_URL = 'https://teseturis.app'
const showBarLink = computed(() =>
  ['duena', 'admin', 'direccion', 'bartender', 'bodega'].includes(userStore.role ?? ''),
)

/** Destinos: los mismos en la barra lateral (computadora) y en la fila de pestañas (tablet y teléfono). */
const navItems = computed(() => [
  { to: '/', label: 'Mis tareas', short: 'Mis tareas', icon: 'fa-house', badge: 0 },
  { to: '/nuevo', label: 'Nuevo registro', short: 'Nuevo', icon: 'fa-file-circle-plus', badge: 0 },
  { to: '/por-firmar', label: 'Por firmar', short: 'Por firmar', icon: 'fa-signature', badge: toSign.value },
  { to: '/archivo', label: 'Archivo', short: 'Archivo', icon: 'fa-box-archive', badge: 0 },
  ...(userStore.role === 'designada' || userStore.role === 'duena'
    ? [{ to: '/tripulantes', label: 'Tripulantes', short: 'Tripulantes', icon: 'fa-users', badge: 0 }]
    : []),
])

const roleLabel = computed(() => (userStore.role ? ROLE_LABELS[userStore.role] : ''))

/** "Mis tareas" solo se marca en la raíz; los demás también en sus subrutas. */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/' || route.path.startsWith('/formato') || route.path.startsWith('/zarpe')
  if (to === '/nuevo') return route.path === '/nuevo'
  return route.path.startsWith(to)
}

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
      <RouterLink to="/" class="brand" aria-label="Registros ISM · Mis tareas">
        <BrandSeal :size="40" />
        <span class="brand-text">
          <span class="brand-name">Registros ISM</span>
          <span class="brand-vessel">Treasure of Galápagos</span>
        </span>
      </RouterLink>
      <div class="session">
        <NoticeBell />
        <button
          class="icon-btn"
          type="button"
          :aria-label="muted ? 'Activar sonidos' : 'Silenciar sonidos'"
          :title="muted ? 'Activar sonidos' : 'Silenciar sonidos'"
          @click="onToggleMute"
        >
          <i class="fa-solid" :class="muted ? 'fa-volume-xmark' : 'fa-volume-high'" aria-hidden="true" />
        </button>
        <span class="who">
          <span class="who-name">{{ userStore.user?.name }}</span>
          <span v-if="roleLabel && roleLabel !== userStore.user?.name" class="who-role">{{ roleLabel }}</span>
        </span>
        <button class="session-out" type="button" @click="logout">
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
          <span class="session-out-label">Salir</span>
        </button>
      </div>
    </header>

    <nav class="tabs" aria-label="Secciones">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="tab"
        :class="{ 'is-active': isActive(item.to) }"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <i class="fa-solid" :class="item.icon" aria-hidden="true" />
        <span>{{ item.short }}</span>
        <span v-if="item.badge" class="badge" :aria-label="`${item.badge} por firmar`">{{ item.badge }}</span>
      </RouterLink>
    </nav>

    <div class="body">
      <nav class="sidenav" aria-label="Secciones">
        <div class="sections">
          <div class="section">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="nav-item"
              :class="{ 'is-active': isActive(item.to) }"
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              <i class="fa-solid nav-icon" :class="item.icon" aria-hidden="true" />
              {{ item.label }}
              <span v-if="item.badge" class="badge" :aria-label="`${item.badge} por firmar`">{{ item.badge }}</span>
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

// Portada del menú: azul empolvado con las algas a línea (marca).
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  height: calc(var(--header-h) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 1rem 0;
  background: var(--powder-300);
  color: var(--ink-900);
  position: sticky;
  top: 0;
  z-index: 30;
  isolation: isolate;

  @include tablet {
    padding-left: 1.5rem;
    padding-right: 1.25rem;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/brand/algas.png') center 40% / 320px auto repeat;
    opacity: 0.28;
    // Despeja el sello y el nombre: las algas aparecen hacia la derecha.
    mask-image: linear-gradient(to right, transparent 160px, #000 380px);
    pointer-events: none;
    z-index: -1;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  min-height: 48px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  white-space: nowrap;
}

.brand-vessel {
  display: none;
  font-size: 0.875rem;
  color: var(--navy-700);
  white-space: nowrap;

  @include tablet {
    display: block;
  }
}

.session {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.icon-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--ink-900);
  transition: background 0.15s ease;

  &:hover {
    background: rgba(27, 43, 37, 0.08);
  }
}

// Quién tiene la sesión: se lee de un vistazo antes de llenar o firmar.
.who {
  display: none;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.2;
  margin: 0 0.4rem 0 0.5rem;
  padding: 0.25rem 0.85rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.55);

  @include tablet {
    display: flex;
  }
}

.who-name {
  font-weight: 600;
  font-size: 0.95rem;
  max-width: 18ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who-role {
  font-size: 0.875rem;
  color: var(--navy-700);
}

.session-out {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
  padding: 0.35rem 0.8rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(27, 43, 37, 0.3);
  color: var(--ink-900);
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.5);
    border-color: var(--navy-700);
  }
}

.session-out-label {
  display: none;

  @include tablet {
    display: inline;
  }
}

// Tablet y teléfono: los destinos siempre a la vista, en una fila con texto.
.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.4rem 0.75rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @include tablet {
    padding: 0.5rem 1.25rem;
  }

  @include desktop {
    display: none;
  }
}

.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0 0.75rem;

  @include tablet {
    padding: 0 0.9rem;
  }

  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 1rem;
  color: var(--ink-600);
  transition: background 0.15s ease, color 0.15s ease;

  i {
    display: none;
    color: var(--ink-400);
    transition: color 0.15s ease;

    @include tablet {
      display: inline;
    }
  }

  &:hover:not(.is-active) {
    background: var(--hover);
  }

  &.is-active {
    background: var(--active);
    color: var(--navy-900);

    i {
      color: var(--navy-800);
    }
  }
}

.body {
  display: flex;
  flex: 1;
}

.sidenav {
  display: none;

  @include desktop {
    position: sticky;
    top: var(--header-h);
    height: calc(100dvh - var(--header-h));
    width: 248px;
    flex-shrink: 0;
    padding: 1.25rem 0.75rem 1rem;
    background: var(--surface);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow-y: auto;
  }
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-label {
  margin: 0 0 0.35rem;
  padding: 0 0.85rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink-400);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 48px;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 1rem;
  color: var(--ink-600);
  transition: background 0.15s ease, color 0.15s ease;

  & + & {
    margin-top: 0.15rem;
  }

  &.is-active {
    background: var(--active);
    color: var(--navy-900);
    font-weight: 600;

    .nav-icon {
      color: var(--navy-800);
    }
  }

  &:hover:not(.is-active) {
    background: var(--hover);
  }
}

.nav-icon {
  width: 1.25rem;
  text-align: center;
  color: var(--ink-400);
  transition: color 0.15s ease;
}

// Cuántos registros esperan tu firma: el único número del menú.
.badge {
  margin-left: auto;
  min-width: 26px;
  height: 26px;
  padding: 0 0.45rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--gold-500);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  .tab & {
    margin-left: 0.1rem;
  }
}

.ext {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--ink-400);
}


.content {
  flex: 1;
  min-width: 0;
}
</style>
