<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiNotices, apiReadNotices } from '@/services/api'
import { formatStamp } from '@/utils/ism'
import type { IsmNotice } from '@/types'

/**
 * Avisos dentro de la app (informe R-14): R-14 por firmar al Capitán,
 * devoluciones a quien hizo el chequeo, esperas largas y claves bloqueadas
 * a la Persona Designada. Se revisan al navegar y cada minuto.
 */
const router = useRouter()
const route = useRoute()
const notices = shallowRef<IsmNotice[]>([])
const unread = shallowRef(0)
const open = shallowRef(false)
const root = useTemplateRef<HTMLElement>('root')

const ICONS: Record<string, string> = {
  por_firmar_capitan: 'fa-anchor',
  por_firmar_designada: 'fa-box-archive',
  devuelto: 'fa-rotate-left',
  espera_capitan: 'fa-hourglass-half',
  espera_designada: 'fa-hourglass-half',
  clave_bloqueada: 'fa-lock',
}

async function refresh() {
  try {
    const data = await apiNotices()
    notices.value = data.notices
    unread.value = data.unread
  } catch {
    // Los avisos son informativos: sin señal se reintenta después.
  }
}

async function go(n: IsmNotice) {
  open.value = false
  if (!n.readAt) {
    notices.value = notices.value.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x))
    unread.value = Math.max(0, unread.value - 1)
    apiReadNotices([n._id]).catch(() => undefined)
  }
  if (n.link) router.push(n.link)
  else if (n.kind === 'clave_bloqueada') router.push('/tripulantes')
}

async function readAll() {
  notices.value = notices.value.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))
  unread.value = 0
  await apiReadNotices().catch(() => undefined)
}

function onOutside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresh()
  timer = setInterval(refresh, 60_000)
  document.addEventListener('pointerdown', onOutside)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('pointerdown', onOutside)
})
watch(() => route.fullPath, refresh)
</script>

<template>
  <div ref="root" class="bell">
    <button
      type="button"
      class="icon-btn bell-btn"
      :class="{ open }"
      :aria-label="unread ? `Avisos: ${unread} sin leer` : 'Avisos'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <i class="fa-solid fa-bell" aria-hidden="true" />
      <Transition name="badge">
        <span v-if="unread" :key="unread" class="bell-badge num">{{ unread > 9 ? '9+' : unread }}</span>
      </Transition>
    </button>
    <Transition name="pop">
      <div v-if="open" class="bell-panel" role="dialog" aria-label="Avisos">
        <header>
          <h2>Avisos</h2>
          <span v-if="unread" class="pill pill--turn num">{{ unread }} sin leer</span>
        </header>
        <p v-if="!notices.length" class="bell-empty">
          <i class="fa-regular fa-bell-slash" aria-hidden="true" />
          <span><strong>No tienes avisos.</strong> Aquí aparecen los registros por firmar, las devoluciones y las claves bloqueadas.</span>
        </p>
        <ul v-else>
          <li v-for="n in notices" :key="n._id">
            <button type="button" class="bell-item" :class="{ unread: !n.readAt }" @click="go(n)">
              <i class="fa-solid" :class="ICONS[n.kind] ?? 'fa-bell'" aria-hidden="true" />
              <span class="bell-text">
                <strong>{{ n.title }}</strong>
                <span v-if="n.body" class="bell-body">{{ n.body }}</span>
                <span class="bell-when num">{{ formatStamp(n.createdAt) }}</span>
              </span>
              <span v-if="!n.readAt" class="bell-dot" aria-label="Sin leer" />
            </button>
          </li>
        </ul>
        <footer v-if="unread">
          <button type="button" class="link-btn" @click="readAll">
            <i class="fa-solid fa-check-double" aria-hidden="true" /> Marcar todo como leído
          </button>
        </footer>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.bell {
  position: relative;
}

.bell-btn {
  position: relative;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--ink-900);
  font-size: 1.1rem;
  transition: background 0.15s ease;

  &:hover,
  &.open {
    background: var(--active);
  }
}

// Contador: caramelo, el color de «te toca».
.bell-badge {
  position: absolute;
  top: 3px;
  right: 1px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--gold-500);
  border: 2px solid var(--surface);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  display: grid;
  place-items: center;
}

.bell-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(400px, calc(100vw - 24px));
  max-height: 70dvh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 40;
  text-align: left;
  overflow: hidden;
  transform-origin: top right;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 60px;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--line);

    h2 {
      font-size: 1.3rem;
    }
  }

  ul {
    flex: 1;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li + li {
    border-top: 1px solid var(--line);
  }

  footer {
    padding: 0.25rem 0.75rem;
    border-top: 1px solid var(--line);
  }
}

.bell-empty {
  margin: 0;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 1.1rem 1rem;
  color: var(--ink-600);

  i {
    margin-top: 0.2rem;
    color: var(--ink-400);
  }

  strong {
    display: block;
    color: var(--ink-900);
  }
}

.bell-item {
  width: 100%;
  min-height: 64px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 10px;
  gap: 0.8rem;
  align-items: start;
  padding: 0.85rem 1rem;
  text-align: left;
  color: var(--ink-600);
  transition: background 0.15s ease;

  &:hover {
    background: var(--hover);
  }

  > i {
    margin-top: 0.2rem;
    color: var(--ink-400);
  }

  &.unread {
    color: var(--ink-900);

    > i {
      color: var(--navy-700);
    }
  }
}

.bell-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;

  strong {
    font-weight: 600;
  }
}

.bell-body {
  color: var(--ink-600);
}

.bell-when {
  color: var(--ink-400);
}

.bell-dot {
  width: 10px;
  height: 10px;
  margin-top: 0.45rem;
  border-radius: 50%;
  background: var(--gold-500);
}

.pop-enter-active,
.pop-leave-active {
  transition: transform 0.2s var(--ease), opacity 0.18s ease;
}

.pop-enter-from,
.pop-leave-to {
  transform: translateY(-6px) scale(0.98);
  opacity: 0;
}

.badge-enter-active,
.badge-leave-active {
  transition: transform 0.2s var(--ease), opacity 0.2s ease;
}

.badge-enter-from,
.badge-leave-to {
  transform: scale(0.5);
  opacity: 0;
}
</style>
