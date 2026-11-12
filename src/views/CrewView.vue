<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { useCatalogStore } from '@/stores/catalog'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import { useCrewStore } from '@/stores/crew'
import { useUserStore } from '@/stores/user'
import { apiCreateCrew, apiCrew, apiSetCrewSignature, apiTemporaryPin, apiUpdateCrew } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { formatHour } from '@/utils/ism'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import InlineSignaturePad from '@/components/sign/InlineSignaturePad.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { CrewMember } from '@/types'

/**
 * Lista de tripulantes (la mantiene la Persona Designada): nombre, cargo y
 * si está a bordo; la clave temporal de 4 números se da aquí y se muestra
 * una sola vez. El tripulante la cambia en su primera firma. Aquí también se
 * recoge la firma de cada uno (5-nov-2026): queda asignada a su usuario y,
 * desde su cuenta, «Firmar» la pone con un toque.
 */
const catalog = useCatalogStore()
const confirmStore = useConfirmStore()
const toast = useToastStore()
const crewStore = useCrewStore()
const userStore = useUserStore()
/** La clave temporal la dan la Persona Designada y Gerencia (igual que el servidor). */
const canGivePin = computed(() => userStore.role === 'designada' || userStore.role === 'duena')
/** Recoger firmas: Persona Designada y Gerencia (igual que el servidor). */
const canCollectSignature = computed(() => userStore.role === 'designada' || userStore.role === 'duena')
const signing = shallowRef<CrewMember | null>(null)
const sigInk = shallowRef(false)
const sigPad = useTemplateRef<InstanceType<typeof InlineSignaturePad>>('sigPad')

const members = shallowRef<CrewMember[]>([])
const loading = shallowRef(true)
const busy = shallowRef('')
const adding = shallowRef(false)
// ref (no shallowRef): v-model escribe campo por campo y el selector debe ver el cargo elegido.
const blankDraft = () => ({ firstName: '', lastName: '', email: '', position: '', onboard: true, pin: '' })
const draft = ref(blankDraft())
const shownPin = shallowRef<{ name: string; pin: string } | null>(null)
const editing = shallowRef<CrewMember | null>(null)
const editDraft = ref({ name: '', email: '', position: '', pin: '' })

const ROLE_TEXT: Record<string, string> = { tripulante: 'Tripulante', capitan: 'Capitán', designada: 'Persona Designada' }

const positions = computed(() => catalog.positions)
/** Mismo formato que arma el servidor: nombre.apellido sin tildes. */
const previewUsername = computed(() =>
  [draft.value.firstName, draft.value.lastName]
    .map((t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
    .join('.'),
)
const active = computed(() => members.value.filter((m) => m.active && !m.sharedDevice))
const inactive = computed(() => members.value.filter((m) => !m.active && !m.sharedDevice))
/** Cuentas compartidas (tablet del barco): no son personas; se marcan a mano. */
const shared = computed(() => members.value.filter((m) => m.sharedDevice))
const onboardCount = computed(() => active.value.filter((m) => m.onboard).length)

/** Iniciales para la marca de cada fila. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase()
}

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
  const d = draft.value
  const missing = d.firstName.trim().length < 2 ? 'Escribe el nombre' : d.lastName.trim().length < 2 ? 'Escribe el apellido' : !d.position ? 'Elige el cargo' : d.pin && !/^\d{4}$/.test(d.pin) ? 'La clave son 4 números' : ''
  if (missing) {
    toast.error(missing)
    return
  }
  busy.value = 'add'
  try {
    const { pin, ...rest } = draft.value
    const m = await apiCreateCrew(pin ? { ...rest, pin } : rest)
    members.value = [...members.value, m].sort((a, b) => a.name.localeCompare(b.name))
    crewStore.load(true).catch(() => undefined)
    adding.value = false
    draft.value = blankDraft()
    toast.success(
      `${m.name} quedó en la lista con el usuario ${m.username}. ${pin ? 'Ya puede entrar con su clave.' : canGivePin.value ? 'Ahora dale su clave.' : 'La Persona Designada o Gerencia le da su clave.'}`,
    )
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

function openSignature(m: CrewMember) {
  sigInk.value = false
  signing.value = m
}

async function saveSignature() {
  const m = signing.value
  if (!m || !sigPad.value || !sigInk.value) return
  busy.value = 'sig'
  try {
    await apiSetCrewSignature(m.id, sigPad.value.image())
    replace({ ...m, hasSignature: true })
    signing.value = null
    toast.success(`Firma de ${m.name} registrada`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = ''
  }
}

function openEdit(m: CrewMember) {
  editing.value = m
  editDraft.value = { name: m.name, email: m.email, position: m.position, pin: '' }
}

async function saveEdit() {
  const m = editing.value
  if (!m) return
  busy.value = 'edit'
  try {
    const { email, pin, ...rest } = editDraft.value
    if (pin && !/^\d{4}$/.test(pin)) {
      toast.error('La clave son 4 números')
      return
    }
    const withPin = pin ? { ...rest, pin } : rest
    // El correo de una cuenta propia lo maneja Gerencia.
    replace(await apiUpdateCrew(m.id, m.hasAccount ? withPin : { ...withPin, email }))
    editing.value = null
    toast.success(pin ? 'Ficha y clave actualizadas' : 'Ficha actualizada')
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
    <header class="page-head">
      <div>
        <h1 class="page-title">Tripulantes</h1>
        <p class="page-lead">Quienes hacen chequeos y firman. El cargo sale de aquí; la clave de 4 números la cambia cada persona.</p>
      </div>
      <button type="button" class="btn btn-primary add-btn" @click="adding = true">
        <i class="fa-solid fa-user-plus" aria-hidden="true" /> Agregar tripulante
      </button>
    </header>

    <SkeletonList v-if="loading" variant="row" :rows="6" />
    <template v-else>
      <section class="block">
        <div class="panel-head">
          <h2>En la lista</h2>
          <span class="tally num">
            <span class="pill"><i class="fa-solid fa-ship" aria-hidden="true" /> {{ onboardCount }} a bordo</span>
            <span class="pill pill--plain"><i class="fa-solid fa-house" aria-hidden="true" /> {{ active.length - onboardCount }} en tierra</span>
          </span>
        </div>

        <p v-if="!active.length" class="empty-state">
          <i class="fa-solid fa-users" aria-hidden="true" />
          <span><strong>Aún no hay tripulantes.</strong> Agrega a quienes hacen chequeos para que se puedan elegir en la tablet.</span>
        </p>
        <TransitionGroup v-else tag="ul" name="list" appear class="list card">
          <li v-for="m in active" :key="m.id" class="member" :class="{ ashore: !m.onboard }">
            <span class="mark" aria-hidden="true">{{ initials(m.name) }}</span>
            <div class="member-main">
              <strong>{{ m.name }}</strong>
              <span class="meta">
              <span class="member-sub">
                {{ m.positionLabel || 'Sin cargo' }}<template v-if="m.role !== 'tripulante' && ROLE_TEXT[m.role] !== m.positionLabel"> · {{ ROLE_TEXT[m.role] }}</template>
              </span>
              <span v-if="m.username" class="member-sub">Usuario: <strong class="username">{{ m.username }}</strong><template v-if="!m.email"> · sin correo, avisos solo en la app</template></span>
              <span class="pill pin" :class="`pin--${pinState(m).tone}`">
                <i class="fa-solid" :class="m.lockedUntil ? 'fa-lock' : 'fa-key'" aria-hidden="true" /> {{ pinState(m).text }}
              </span>
              <span class="pill" :class="m.hasSignature ? 'pin--ok' : 'pin--muted'">
                <i class="fa-solid fa-signature" aria-hidden="true" /> {{ m.hasSignature ? 'Firma registrada' : 'Sin firma registrada' }}
              </span>
              </span>
            </div>
            <div class="member-actions">
              <button
                type="button"
                class="where"
                :class="{ on: m.onboard }"
                :disabled="busy === m.id"
                :aria-pressed="m.onboard"
                :aria-label="m.onboard ? 'A bordo. Toca para marcar en tierra' : 'En tierra. Toca para marcar a bordo'"
                @click="toggleOnboard(m)"
              >
                <i class="fa-solid" :class="busy === m.id ? 'fa-spinner fa-spin' : m.onboard ? 'fa-ship' : 'fa-house'" aria-hidden="true" />
                {{ m.onboard ? 'A bordo' : 'En tierra' }}
              </button>
              <button v-if="canGivePin" type="button" class="btn btn-ghost" :disabled="busy === m.id" @click="givePin(m)">
                <i class="fa-solid fa-key" aria-hidden="true" /> Clave temporal
              </button>
              <button v-if="canCollectSignature" type="button" class="btn btn-ghost" @click="openSignature(m)">
                <i class="fa-solid fa-signature" aria-hidden="true" /> {{ m.hasSignature ? 'Cambiar firma' : 'Registrar firma' }}
              </button>
              <button type="button" class="btn btn-ghost" @click="openEdit(m)">
                <i class="fa-solid fa-pen" aria-hidden="true" /> Editar
              </button>
            </div>
          </li>
        </TransitionGroup>
      </section>

      <section v-if="shared.length" class="block">
        <div class="panel-head">
          <h2>Cuentas compartidas</h2>
          <span class="pill pill--plain num">{{ shared.length }}</span>
        </div>
        <p class="hint">No son personas: no salen en «¿Quién hace el chequeo?» ni firman. Sirven para iniciar sesión en la tablet del barco.</p>
        <ul class="list card">
          <li v-for="m in shared" :key="m.id" class="row">
            <span class="row-name"><i class="fa-solid fa-tablet-screen-button" aria-hidden="true" /> {{ m.name }}</span>
            <button type="button" class="btn btn-ghost" :disabled="busy === m.id" @click="setShared(m, false)">
              <i class="fa-solid fa-user" aria-hidden="true" /> Es una persona
            </button>
          </li>
        </ul>
      </section>

      <details v-if="inactive.length" class="block gone">
        <summary>
          <i class="fa-solid fa-chevron-right chev" aria-hidden="true" />
          Fuera de la lista
          <span class="pill pill--plain num">{{ inactive.length }}</span>
        </summary>
        <ul class="list card">
          <li v-for="m in inactive" :key="m.id" class="row">
            <span class="row-name">{{ m.name }}<small v-if="m.positionLabel"> · {{ m.positionLabel }}</small></span>
            <button type="button" class="btn btn-ghost" :disabled="busy === m.id" @click="setActive(m, true)">
              <i class="fa-solid fa-user-plus" aria-hidden="true" /> Volver a agregar
            </button>
          </li>
        </ul>
      </details>
    </template>

    <BaseModal v-if="adding" title="Agregar tripulante" @close="adding = false">
      <div class="form">
        <div class="name-row">
          <div class="field">
            <label for="crew-first">Nombre</label>
            <input id="crew-first" v-model="draft.firstName" autocomplete="off" autocapitalize="words" placeholder="Juan" />
          </div>
          <div class="field">
            <label for="crew-last">Apellido</label>
            <input id="crew-last" v-model="draft.lastName" autocomplete="off" autocapitalize="words" placeholder="Pérez" />
          </div>
        </div>
        <p v-if="draft.firstName.trim() && draft.lastName.trim()" class="hint">
          Usuario para entrar: <strong>{{ previewUsername }}</strong> (si ya existe, se le agrega un número).
        </p>
        <div class="field">
          <label for="crew-email">Correo <small>(opcional)</small></label>
          <input id="crew-email" v-model="draft.email" type="email" inputmode="email" autocomplete="off" placeholder="nombre@correo.com" />
          <small class="hint">Sin correo no le llegan alertas por correo: sus avisos quedan solo dentro de la app.</small>
        </div>
        <div class="field">
          <label>Cargo</label>
          <BaseSelect v-model="draft.position" :options="positions" placeholder="Elige el cargo" />
        </div>
        <div class="field">
          <span class="field-label">Dónde está ahora</span>
          <div class="seg" role="radiogroup" aria-label="Dónde está ahora">
            <button type="button" role="radio" :aria-checked="draft.onboard" :class="{ on: draft.onboard }" @click="draft = { ...draft, onboard: true }">
              <i class="fa-solid fa-ship" aria-hidden="true" /> A bordo
            </button>
            <button type="button" role="radio" :aria-checked="!draft.onboard" :class="{ on: !draft.onboard }" @click="draft = { ...draft, onboard: false }">
              <i class="fa-solid fa-house" aria-hidden="true" /> En tierra
            </button>
          </div>
        </div>
        <div v-if="canGivePin" class="field">
          <label for="crew-pin">Clave de 4 números <small>(opcional)</small></label>
          <input id="crew-pin" v-model="draft.pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Ej. 2580" />
          <small class="hint">Con esta clave entra y firma. Si la dejas vacía, dale una clave temporal después.</small>
        </div>
        <p class="hint">Entra con su usuario y su clave de 4 números, y firma con esa misma clave.</p>
        <button type="button" class="btn btn-primary btn-lg" :disabled="busy === 'add'" @click="add">
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
        <div v-if="!editing.hasAccount" class="field">
          <label for="crew-edit-email">Correo <small>(opcional)</small></label>
          <input id="crew-edit-email" v-model="editDraft.email" type="email" inputmode="email" autocomplete="off" placeholder="nombre@correo.com" />
          <small class="hint">Sin correo no le llegan alertas por correo: sus avisos quedan solo dentro de la app.</small>
        </div>
        <div class="field">
          <label>Cargo</label>
          <BaseSelect v-model="editDraft.position" :options="positions" placeholder="Elige el cargo" />
        </div>
        <div v-if="canGivePin" class="field">
          <label for="crew-edit-pin">Clave de 4 números <small>(opcional)</small></label>
          <input id="crew-edit-pin" v-model="editDraft.pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Ej. 2580" />
          <small class="hint">{{ editing.hasPin ? 'Ya tiene clave: escribe una nueva solo si quieres cambiarla.' : 'Aún no tiene clave: ponle una para que pueda entrar y firmar.' }}</small>
        </div>
        <button type="button" class="btn btn-primary btn-lg" :disabled="busy === 'edit'" @click="saveEdit">
          <i class="fa-solid" :class="busy === 'edit' ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true" /> Guardar
        </button>
        <div class="form-more">
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
      </div>
    </BaseModal>

    <BaseModal v-if="signing" :title="`Firma · ${signing.name}`" @close="signing = null">
      <div class="form">
        <p>Que <strong>{{ signing.name }}</strong> firme con el dedo. Queda asignada a su usuario: al firmar un registro desde su cuenta, solo toca «Firmar».</p>
        <InlineSignaturePad ref="sigPad" :placeholder="`Firma de ${signing.name}`" @change="sigInk = $event" />
        <p v-if="signing.hasSignature" class="hint">Reemplaza la firma que tenía. Los registros ya firmados no cambian.</p>
        <button type="button" class="btn btn-primary btn-lg" :disabled="!sigInk || busy === 'sig'" @click="saveSignature">
          <i class="fa-solid" :class="busy === 'sig' ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true" /> Guardar firma
        </button>
      </div>
    </BaseModal>

    <BaseModal v-if="shownPin" title="Clave temporal" @close="shownPin = null">
      <div class="form">
        <p>Clave de un solo uso para <strong>{{ shownPin.name }}</strong>:</p>
        <p class="big-pin num" aria-live="polite" :aria-label="`Clave ${shownPin.pin.split('').join(' ')}`">
          <span v-for="(d, i) in shownPin.pin.split('')" :key="i" class="digit">{{ d }}</span>
        </p>
        <p class="pin-note">
          <i class="fa-solid fa-eye-slash" aria-hidden="true" />
          <span>Dásela en persona. <strong>No se vuelve a mostrar.</strong> En su primera firma la cambia por una que solo sabe esa persona.</span>
        </p>
        <button type="button" class="btn btn-primary btn-lg" @click="shownPin = null">
          <i class="fa-solid fa-check" aria-hidden="true" /> Ya se la di
        </button>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.add-btn {
  white-space: nowrap;
  flex-shrink: 0;
  align-self: flex-start;

  @include tablet {
    align-self: flex-end;
  }
}

.block + .block {
  margin-top: 2rem;
}

.tally {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;

  > li + li {
    border-top: 1px solid var(--line);
  }
}

// Fila de tripulante: marca con iniciales, nombre y cargo, estado de la
// clave y, a la derecha, dónde está y las acciones.
.member {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 0.75rem 0.9rem;
  align-items: start;
  padding: 1rem;
  transition: background 0.18s ease;

  @include tablet {
    padding: 1rem 1.25rem;
  }

  @include desktop {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
  }

  &.ashore .mark {
    background: var(--cream-200);
    color: var(--ink-600);
  }
}

.mark {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-200);
  color: var(--navy-800);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  transition: background 0.2s ease, color 0.2s ease;
}

.member-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  min-width: 0;

  strong {
    font-size: 1.1rem;
    font-weight: 600;
  }
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.75rem;
}

.member-sub {
  color: var(--ink-600);
}

.pin {

  &--ok {
    background: var(--success-100);
    color: var(--success);
  }

  &--warn {
    background: var(--warning-100);
    color: #7a4f12;
  }

  &--bad {
    background: var(--danger-100);
    color: var(--danger);
  }

  &--muted {
    background: var(--powder-100);
    color: var(--ink-600);
  }
}

.username {
  color: var(--navy-900);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.name-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;

  @include tablet {
    grid-template-columns: 1fr 1fr;
  }
}

.member-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  @include tablet {
    grid-column: 2 / -1;
  }

  @include desktop {
    grid-column: auto;
    justify-content: flex-end;
  }
}

// Dónde está: un interruptor con texto; a bordo en azul, en tierra en blanco.
.where {
  min-height: 48px;
  min-width: 132px;
  padding: 0 1.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-600);
  font-weight: 600;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;

  &:hover:not(:disabled) {
    border-color: var(--navy-600);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &.on {
    background: var(--active);
    border-color: var(--navy-800);
    box-shadow: inset 0 0 0 1px var(--navy-800);
    color: var(--navy-900);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.75rem 1rem;

  @include tablet {
    padding: 0.75rem 1.25rem;
  }
}

.row-name {
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;

  i {
    color: var(--ink-400);
  }

  small {
    font-size: 1rem;
    font-weight: 400;
    color: var(--ink-600);
  }
}

.hint {
  margin: 0 0 0.75rem;
  color: var(--ink-600);
  font-size: 1rem;
  max-width: 62ch;
}

.gone {
  summary {
    list-style: none;
    cursor: pointer;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--font-serif);
    font-size: 1.3rem;
    margin-bottom: 0.5rem;

    &::-webkit-details-marker {
      display: none;
    }

    .pill {
      font-family: var(--font-sans);
    }
  }

  .chev {
    font-size: 0.9rem;
    color: var(--ink-400);
    transition: transform 0.2s ease;
  }

  &[open] .chev {
    transform: rotate(90deg);
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  .btn {
    justify-content: center;
  }

  p {
    margin: 0;
  }

  .hint {
    margin: 0;
  }
}

.field-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-900);
}

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;

  button {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink-600);
    font-weight: 600;
    transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;

    &.on {
      background: var(--active);
      border-color: var(--navy-800);
      box-shadow: inset 0 0 0 1px var(--navy-800);
      color: var(--navy-900);
    }
  }
}

.form-more {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

// Clave temporal: cuatro casillas grandes, una por número.
.big-pin {
  display: flex;
  gap: 0.6rem;

  .digit {
    width: 64px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--powder-100);
    border: 1px solid var(--powder-300);
    color: var(--navy-900);
    font-size: 2.4rem;
    font-weight: 700;
    animation: digit-in 0.3s var(--ease) both;

    @for $i from 1 through 6 {
      &:nth-child(#{$i}) {
        animation-delay: #{($i - 1) * 60}ms;
      }
    }
  }
}

.pin-note {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--warning-100);
  border: 1px solid var(--warning-line);
  color: #5f3f10;

  i {
    margin-top: 0.2rem;
  }
}

.danger {
  color: var(--danger);
  border-color: rgba(168, 64, 47, 0.4);
}

@keyframes digit-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
