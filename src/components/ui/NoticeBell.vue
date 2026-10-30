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
      :aria-label="unread ? `Avisos: ${unread} sin leer` : 'Avisos'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <i class="fa-solid fa-bell" aria-hidden="true" />
      <Transition name="fade">
        <span v-if="unread" class="bell-badge">{{ unread > 9 ? '9+' : unread }}</span>
      </Transition>
    </button>
    <Transition name="pop">
      <div v-if="open" class="bell-panel" role="dialog" aria-label="Avisos">
        <header>
          <strong>Avisos</strong>
          <button v-if="unread" type="button" class="bell-all" @click="readAll">Marcar todo como leído</button>
        </header>
        <p v-if="!notices.length" class="bell-empty">No tienes avisos.</p>
        <ul v-else>
          <li v-for="n in notices" :key="n._id">
            <button type="button" class="bell-item" :class="{ unread: !n.readAt }" @click="go(n)">
              <i class="fa-solid" :class="ICONS[n.kind] ?? 'fa-bell'" aria-hidden="true" />
              <span>
                <strong>{{ n.title }}</strong>
                <small v-if="n.body">{{ n.body }}</small>
                <small>{{ formatStamp(n.createdAt) }}</small>
              </span>
            </button>
          </li>
        </ul>
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

.bell-badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: grid;
  place-items: center;
}

.bell-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(380px, calc(100vw - 24px));
  max-height: 70dvh;
  overflow: auto;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 40;
  text-align: left;

  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    background: var(--surface);
    border-bottom: 1px solid var(--cream-200);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
  }
}

.bell-all {
  min-height: 44px;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--navy-700);
  text-decoration: underline;
}

.bell-empty {
  margin: 0;
  padding: 1rem;
  color: var(--ink-600);
}

.bell-item {
  width: 100%;
  min-height: 56px;
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.6rem;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--ink-600);

  &:hover {
    background: var(--powder-100);
  }

  &.unread {
    color: var(--ink-900);
    background: rgba(39, 68, 90, 0.06);

    strong::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 0.4rem;
      border-radius: 50%;
      background: var(--danger);
      vertical-align: middle;
    }
  }

  i {
    margin-top: 0.25rem;
    color: var(--navy-700);
  }

  span {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  small {
    color: var(--ink-400);
  }
}
</style>
