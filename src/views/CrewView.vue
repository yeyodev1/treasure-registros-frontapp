<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useCatalogStore } from '@/stores/catalog'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import { useCrewStore } from '@/stores/crew'
import { useUserStore } from '@/stores/user'
import { apiCreateCrew, apiCrew, apiTemporaryPin, apiUpdateCrew } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { formatHour } from '@/utils/ism'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { CrewMember } from '@/types'

/**
 * Lista de tripulantes (la mantiene la Persona Designada): nombre, cargo y
 * si está a bordo; la clave temporal de 4 números se da aquí y se muestra
 * una sola vez. El tripulante la cambia en su primera firma.
 */
const catalog = useCatalogStore()
const confirmStore = useConfirmStore()
const toast = useToastStore()
const crewStore = useCrewStore()
const userStore = useUserStore()
/** La clave temporal solo la da la Persona Designada (ni Gerencia). */
const canGivePin = computed(() => userStore.role === 'designada')

const members = shallowRef<CrewMember[]>([])
const loading = shallowRef(true)
const busy = shallowRef('')
const adding = shallowRef(false)
const draft = shallowRef({ name: '', position: '', onboard: true })
const shownPin = shallowRef<{ name: string; pin: string } | null>(null)
const editing = shallowRef<CrewMember | null>(null)
const editDraft = shallowRef({ name: '', position: '' })

const ROLE_TEXT: Record<string, string> = { tripulante: 'Tripulante', capitan: 'Capitán', designada: 'Persona Designada' }

const positions = computed(() => catalog.positions)
const active = computed(() => members.value.filter((m) => m.active && !m.sharedDevice))
const inactive = computed(() => members.value.filter((m) => !m.active && !m.sharedDevice))
/** Cuentas compartidas (tablet del barco): no son personas; se marcan a mano. */
const shared = computed(() => members.value.filter((m) => m.sharedDevice))

async function load() {
  loading.value = true
  try {
    await catalog.load()
    members.value = await apiCrew({ all: '1' })
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(load)

function replace(m: CrewMember) {
  members.value = members.value.map((x) => (x.id === m.id ? m : x))
  crewStore.load(true).catch(() => undefined)
}

async function add() {
  if (draft.value.name.trim().length < 3 || !draft.value.position) {
    toast.error(draft.value.position ? 'Escribe el nombre completo' : 'Elige el cargo')
    return
  }
  busy.value = 'add'
  try {
    const m = await apiCreateCrew(draft.value)
    members.value = [...members.value, m].sort((a, b) => a.name.localeCompare(b.name))
    crewStore.load(true).catch(() => undefined)
    adding.value = false
    draft.value = { name: '', position: '', onboard: true }
    toast.success(canGivePin.value ? `${m.name} quedó en la lista. Ahora dale su clave temporal.` : `${m.name} quedó en la lista. La Persona Designada le da su clave temporal.`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

async function toggleOnboard(m: CrewMember) {
  busy.value = m.id
  try {
    replace(await apiUpdateCrew(m.id, { onboard: !m.onboard }))
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

async function givePin(m: CrewMember) {
  const ok = await confirmStore.ask({
    title: `¿Dar clave temporal a ${m.name}?`,
    message: m.hasPin
      ? 'Su clave actual deja de valer. La nueva sirve una sola vez: al firmar, la cambia por una que solo sabe esa persona.'
      : 'Sirve una sola vez: al firmar por primera vez, la cambia por una que solo sabe esa persona.',
    confirmLabel: 'Dar clave temporal',
    icon: 'fa-key',
  })
  if (!ok) return
  busy.value = m.id
  try {
    const res = await apiTemporaryPin(m.id)
    shownPin.value = { name: res.name, pin: res.pin }
    replace({ ...m, hasPin: true, pinTemporary: true, lockedUntil: null })
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

function openEdit(m: CrewMember) {
  editing.value = m
  editDraft.value = { name: m.name, position: m.position }
}

async function saveEdit() {
  const m = editing.value
  if (!m) return
  busy.value = 'edit'
  try {
    replace(await apiUpdateCrew(m.id, editDraft.value))
    editing.value = null
    toast.success('Ficha actualizada')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

async function setActive(m: CrewMember, value: boolean) {
  const ok = await confirmStore.ask({
    title: value ? `¿Volver a agregar a ${m.name}?` : `¿Sacar a ${m.name} de la lista?`,
    message: value
      ? 'Vuelve a aparecer para elegir quién hace el chequeo.'
      : 'Ya no aparece para hacer chequeos. Sus registros y firmas se conservan.',
    confirmLabel: value ? 'Agregar' : 'Sacar de la lista',
    danger: !value,
    icon: value ? 'fa-user-plus' : 'fa-user-minus',
  })
  if (!ok) return
  busy.value = m.id
  try {
    replace(await apiUpdateCrew(m.id, { active: value }))
    editing.value = null
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

async function setShared(m: CrewMember, value: boolean) {
  const ok = await confirmStore.ask({
    title: value ? `¿«${m.name}» es una tablet compartida?` : `¿«${m.name}» es una persona?`,
    message: value
      ? 'Deja de aparecer en «¿Quién hace el chequeo?»: la tablet no es una persona y no firma. Se puede seguir usando para iniciar sesión.'
      : 'Vuelve a aparecer en la lista para hacer chequeos y firmar.',
    confirmLabel: value ? 'Sí, es una tablet compartida' : 'Sí, es una persona',
    icon: value ? 'fa-tablet-screen-button' : 'fa-user',
  })
  if (!ok) return
  busy.value = m.id
  try {
    replace(await apiUpdateCrew(m.id, { sharedDevice: value }))
    editing.value = null
    toast.success(value ? `${m.name} quedó como tablet compartida` : `${m.name} vuelve a la lista de tripulantes`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

function pinState(m: CrewMember): { text: string; tone: string } {
  if (m.lockedUntil) return { text: `Bloqueada hasta las ${formatHour(m.lockedUntil)}`, tone: 'bad' }
  if (!m.hasPin) return { text: 'Sin clave', tone: 'warn' }
  if (m.pinTemporary) return { text: 'Clave temporal, sin estrenar', tone: 'warn' }
  return { text: 'Clave propia', tone: 'ok' }
}
</script>

<template>
  <div class="page crew-page">
    <div class="head">
      <div>
        <h1 class="page-title">Tripulantes</h1>
        <p class="lead">Quienes hacen chequeos y firman. El cargo sale de aquí; la clave de 4 números la cambia cada persona.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="adding = true">
        <i class="fa-solid fa-user-plus" aria-hidden="true" /> Agregar tripulante
      </button>
    </div>

    <SkeletonList v-if="loading" variant="row" :rows="6" />
    <TransitionGroup v-else tag="ul" name="list" appear class="list">
      <li v-for="m in active" :key="m.id" class="card member">
        <div class="member-main">
          <strong>{{ m.name }}</strong>
          <span>
            {{ m.positionLabel || 'Sin cargo' }}<template v-if="m.role !== 'tripulante' && ROLE_TEXT[m.role] !== m.positionLabel"> · {{ ROLE_TEXT[m.role] }}</template><template v-if="!m.hasAccount"> · firma solo en la tablet</template>
          </span>
          <span class="pin" :class="`pin--${pinState(m).tone}`">
            <i class="fa-solid" :class="m.lockedUntil ? 'fa-lock' : 'fa-key'" aria-hidden="true" /> {{ pinState(m).text }}
          </span>
        </div>
        <div class="member-actions">
          <button type="button" class="chip" :class="{ on: m.onboard }" :disabled="busy === m.id" :aria-pressed="m.onboard" @click="toggleOnboard(m)">
            <i class="fa-solid" :class="m.onboard ? 'fa-ship' : 'fa-house'" aria-hidden="true" /> {{ m.onboard ? 'A bordo' : 'En tierra' }}
          </button>
          <button v-if="canGivePin" type="button" class="btn btn-ghost" :disabled="busy === m.id" @click="givePin(m)">
            <i class="fa-solid fa-key" aria-hidden="true" /> Clave temporal
          </button>
          <button type="button" class="btn btn-ghost" @click="openEdit(m)">
            <i class="fa-solid fa-pen" aria-hidden="true" /> Editar
          </button>
        </div>
      </li>
    </TransitionGroup>

    <section v-if="shared.length" class="card gone shared">
      <h2><i class="fa-solid fa-tablet-screen-button" aria-hidden="true" /> Cuentas compartidas ({{ shared.length }})</h2>
      <p class="hint">No son personas: no salen en «¿Quién hace el chequeo?» ni firman.</p>
      <ul>
        <li v-for="m in shared" :key="m.id">
          <span>{{ m.name }}</span>
          <button type="button" class="btn btn-ghost" :disabled="busy === m.id" @click="setShared(m, false)">
            <i class="fa-solid fa-user" aria-hidden="true" /> Es una persona
          </button>
        </li>
      </ul>
    </section>

    <details v-if="inactive.length" class="card gone">
      <summary>Fuera de la lista ({{ inactive.length }})</summary>
      <ul>
        <li v-for="m in inactive" :key="m.id">
          <span>{{ m.name }} · {{ m.positionLabel }}</span>
          <button type="button" class="btn btn-ghost" @click="setActive(m, true)">Volver a agregar</button>
        </li>
      </ul>
    </details>

    <BaseModal v-if="adding" title="Agregar tripulante" @close="adding = false">
      <div class="form">
        <div class="field">
          <label for="crew-name">Nombre completo</label>
          <input id="crew-name" v-model="draft.name" autocomplete="off" placeholder="Nombre y apellido" />
        </div>
        <div class="field">
          <label>Cargo</label>
          <BaseSelect v-model="draft.position" :options="positions" placeholder="Elige el cargo" />
        </div>
        <button type="button" class="chip" :class="{ on: draft.onboard }" @click="draft = { ...draft, onboard: !draft.onboard }">
          <i class="fa-solid" :class="draft.onboard ? 'fa-ship' : 'fa-house'" aria-hidden="true" /> {{ draft.onboard ? 'A bordo' : 'En tierra' }}
        </button>
        <p class="hint">No necesita correo: firma en la tablet del barco eligiéndose de la lista y con su clave.</p>
        <button type="button" class="btn btn-primary" :disabled="busy === 'add'" @click="add">
          <i class="fa-solid" :class="busy === 'add' ? 'fa-spinner fa-spin' : 'fa-user-plus'" aria-hidden="true" /> Agregar a la lista
        </button>
      </div>
    </BaseModal>

    <BaseModal v-if="editing" :title="`Editar · ${editing.name}`" @close="editing = null">
      <div class="form">
        <div class="field">
          <label for="crew-edit-name">Nombre completo</label>
          <input id="crew-edit-name" v-model="editDraft.name" autocomplete="off" />
        </div>
        <div class="field">
          <label>Cargo</label>
          <BaseSelect v-model="editDraft.position" :options="positions" placeholder="Elige el cargo" />
        </div>
        <button type="button" class="btn btn-primary" :disabled="busy === 'edit'" @click="saveEdit">
          <i class="fa-solid fa-check" aria-hidden="true" /> Guardar
        </button>
        <button v-if="!editing.hasAccount" type="button" class="btn btn-ghost danger" @click="setActive(editing, false)">
          <i class="fa-solid fa-user-minus" aria-hidden="true" /> Sacar de la lista
        </button>
        <template v-else>
          <button v-if="editing.role === 'tripulante'" type="button" class="btn btn-ghost" @click="setShared(editing, true)">
            <i class="fa-solid fa-tablet-screen-button" aria-hidden="true" /> Es una tablet compartida, no una persona
          </button>
          <p class="hint">Tiene cuenta propia: su rol y su acceso los maneja Gerencia.</p>
        </template>
      </div>
    </BaseModal>

    <BaseModal v-if="shownPin" title="Clave temporal" @close="shownPin = null">
      <div class="form">
        <p>Clave de un solo uso para <strong>{{ shownPin.name }}</strong>:</p>
        <p class="big-pin" aria-live="polite">{{ shownPin.pin.split('').join(' ') }}</p>
        <p class="hint">Dásela en persona. No se vuelve a mostrar. En su primera firma la cambia por una que solo sabe esa persona.</p>
        <button type="button" class="btn btn-primary" @click="shownPin = null">Ya se la di</button>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.head {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-bottom: 1rem;

  @include tablet {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }

  > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  .btn {
    min-height: 48px;
    white-space: nowrap;
    flex-shrink: 0;
    align-self: flex-start;

    @include tablet {
      align-self: flex-end;
    }
  }
}

.shared h2 {
  margin: 0 0 0.2rem;
  font-size: 1.05rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lead {
  margin: 0.3rem 0 0;
  color: var(--ink-600);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.member {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;

  @include tablet {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.member-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;

  strong {
    font-size: 1.05rem;
  }

  span {
    color: var(--ink-600);
  }
}

.pin {
  font-weight: 600;
  font-size: 1rem;

  &--ok {
    color: var(--success) !important;
  }

  &--warn {
    color: #8a5d1d !important;
  }

  &--bad {
    color: var(--danger) !important;
  }
}

.member-actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: 0.4rem;

  .btn {
    min-height: 44px;
  }
}

.chip {
  min-height: 44px;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1.5px solid var(--cream-200);
  background: #fff;
  font-weight: 600;
  color: var(--ink-600);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: flex-start;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.gone {
  margin-top: 1rem;

  summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 0;
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;

  .btn {
    min-height: 48px;
    justify-content: center;
  }

  p {
    margin: 0;
  }
}

.hint {
  color: var(--ink-600);
  font-size: 1rem;
}

.big-pin {
  font-size: 2.6rem !important;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: var(--navy-800);
  font-variant-numeric: tabular-nums;
}

.danger {
  color: var(--danger);
  border-color: rgba(180, 72, 59, 0.4);
}
</style>
