<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { useAutosave } from '@/composables/useAutosave'
import {
  apiDiscard,
  apiPdfUrl,
  apiRecord,
  apiRecordAction,
  apiRemoveSignature,
  apiSign,
  apiUploadPhoto,
} from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import {
  STAGE_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  authorName,
  canEditRecord,
  canSignSlot,
  formatRecordDate,
  formatStamp,
} from '@/utils/ism'
import FormCanvas from '@/components/registros/FormCanvas.vue'
import SignaturePad from '@/components/registros/SignaturePad.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import type { IsmField, IsmForm, IsmRecord, SignatureStage } from '@/types'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const catalogStore = useCatalogStore()
const confirmStore = useConfirmStore()
const toast = useToastStore()
const { play } = useSound()

const record = shallowRef<IsmRecord | null>(null)
const form = shallowRef<IsmForm | null>(null)
const values = ref<Record<string, string | boolean>>({})
const loading = shallowRef(true)
const busy = shallowRef(false)
const zoom = shallowRef(1)
const signing = shallowRef<IsmField | null>(null)
const photoTarget = shallowRef<IsmField | null>(null)
const photoInput = useTemplateRef<HTMLInputElement>('photoInput')

const autosave = useAutosave(() => String(route.params.id))

const editable = computed(
  () => Boolean(record.value && form.value && canEditRecord(record.value, userStore.role, form.value)),
)

const slots = computed(() => (form.value?.fields ?? []).filter((f) => f.type === 'signature'))
const signedMap = computed(() => new Map((record.value?.signatures ?? []).map((s) => [s.field, s])))

const slotsByStage = computed(() => {
  const groups: Record<SignatureStage, IsmField[]> = { tripulacion: [], capitan: [], oficina: [] }
  for (const s of slots.value) groups[s.stage ?? 'tripulacion'].push(s)
  return groups
})

const canSubmit = computed(() => record.value?.status === 'borrador' && editable.value)
const canApprove = computed(
  () =>
    (record.value?.status === 'por_capitan' && userStore.isCaptain) ||
    (record.value?.status === 'por_oficina' && userStore.isOffice),
)
const canDiscard = computed(
  () =>
    record.value?.status === 'borrador' &&
    (userStore.isAdmin ||
      (typeof record.value.createdBy === 'object' && record.value.createdBy._id === userStore.user?.id)),
)

const saveLabel = computed(() => {
  const s = autosave.state.value
  if (s === 'saving') return 'Guardando…'
  if (s === 'offline') return 'Sin conexión: guardado en la tablet'
  if (s === 'error') return 'No se pudo guardar'
  if (s === 'saved' && autosave.savedAt.value) {
    return `Guardado ${autosave.savedAt.value.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`
  }
  return ''
})

function canSign(f: IsmField): boolean {
  if (!record.value || !form.value || !f.stage) return false
  return canSignSlot(record.value, userStore.role, f.stage, form.value)
}

async function load() {
  try {
    const rec = await apiRecord(String(route.params.id))
    form.value = await catalogStore.definition(rec.code)
    record.value = rec
    values.value = { ...(rec.data ?? {}), ...autosave.localPending() }
  } catch (err) {
    toast.error(apiErrorMessage(err))
    router.replace('/')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function onChange(name: string, value: string | boolean) {
  values.value = { ...values.value, [name]: value }
  autosave.queue(name, value)
}

function openSign(f: IsmField) {
  const existing = signedMap.value.get(f.name)
  if (existing) {
    if (!canSign(f)) return
    confirmStore
      .ask({
        title: `¿Quitar la firma de ${existing.signerName}?`,
        message: `${f.label}. Podrás volver a firmar.`,
        confirmLabel: 'Quitar firma',
        danger: true,
        icon: 'fa-eraser',
      })
      .then(async (ok) => {
        if (!ok) return
        try {
          record.value = await apiRemoveSignature(record.value!._id, f.name)
          toast.success('Firma retirada')
        } catch (err) {
          toast.error(apiErrorMessage(err))
        }
      })
    return
  }
  if (canSign(f)) signing.value = f
}

/** La firma de quien llena puede ser de otra persona (asistentes, tripulantes). */
const askName = computed(() => signing.value?.stage === 'tripulacion')

async function onSigned(image: string, signerName: string) {
  const f = signing.value
  if (!f || !record.value) return
  signing.value = null
  busy.value = true
  try {
    await autosave.flush()
    record.value = await apiSign(record.value._id, f.name, image, signerName)
    play('success')
    toast.success(`Firmado: ${f.label}`)
  } catch (err) {
    play('error')
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}

function openPhoto(f: IsmField) {
  photoTarget.value = f
  photoInput.value?.click()
}

async function onPhotoSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  const f = photoTarget.value
  ;(e.target as HTMLInputElement).value = ''
  if (!file || !f) return
  busy.value = true
  try {
    const url = await apiUploadPhoto(file)
    onChange(f.name, url)
    toast.success('Foto agregada')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}

async function run(action: () => Promise<void>) {
  busy.value = true
  try {
    await autosave.flush()
    await action()
    play('success')
  } catch (err) {
    play('error')
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}

async function submit() {
  const ok = await confirmStore.ask({
    title: `¿Enviar ${record.value?.code}?`,
    message:
      form.value?.stages.capitan
        ? 'Pasa al Capitán para su revisión y firma. Ya no podrás editarlo salvo que te lo devuelvan.'
        : 'Pasa a la oficina para que la Persona Designada lo reciba y archive.',
    confirmLabel: 'Listo para enviar',
    icon: 'fa-paper-plane',
  })
  if (!ok) return
  await run(async () => {
    record.value = await apiRecordAction(record.value!._id, 'submit')
    toast.success(STATUS_LABELS[record.value.status])
  })
}

async function approve() {
  const toOffice = record.value?.status === 'por_capitan'
  const ok = await confirmStore.ask({
    title: toOffice ? '¿Aprobar y enviar a oficina?' : '¿Recibir y archivar el registro?',
    message: toOffice
      ? 'Queda tu aprobación con tu usuario y la hora.'
      : 'Queda archivado con todas sus firmas y ya no se puede modificar.',
    confirmLabel: toOffice ? 'Aprobar' : 'Archivar',
    icon: toOffice ? 'fa-anchor' : 'fa-box-archive',
  })
  if (!ok) return
  await run(async () => {
    record.value = await apiRecordAction(record.value!._id, 'approve')
    toast.success(toOffice ? 'Aprobado: enviado a oficina' : 'Archivado')
  })
}

async function giveBack() {
  const reason = await confirmStore.askReason({
    title: `¿Devolver ${record.value?.code}?`,
    message: 'Vuelve a borrador para que lo corrijan. Las firmas de revisión se retiran.',
    confirmLabel: 'Devolver',
    icon: 'fa-rotate-left',
    reason: {
      label: 'Motivo (obligatorio)',
      suggestions: ['Falta información', 'Dato incorrecto', 'Falta una firma'],
    },
  })
  if (!reason) return
  await run(async () => {
    record.value = await apiRecordAction(record.value!._id, 'return', reason)
    toast.success('Devuelto con motivo')
  })
}

async function discard() {
  const ok = await confirmStore.ask({
    title: '¿Descartar este borrador?',
    message: 'Se elimina el borrador. Los registros enviados o archivados nunca se eliminan.',
    confirmLabel: 'Descartar',
    danger: true,
    icon: 'fa-trash',
  })
  if (!ok) return
  await run(async () => {
    await apiDiscard(record.value!._id)
    toast.success('Borrador descartado')
    router.replace('/')
  })
}

async function openPdf() {
  busy.value = true
  try {
    await autosave.flush()
    const url = await apiPdfUrl(record.value!._id)
    window.open(url, '_blank')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page rec">
    <SkeletonList v-if="loading" variant="row" :rows="8" />

    <template v-else-if="record && form">
      <header class="rec-head">
        <button type="button" class="back" aria-label="Volver" @click="router.back()">
          <i class="fa-solid fa-arrow-left" aria-hidden="true" />
        </button>
        <div class="rec-title">
          <p class="rec-code">{{ record.code.replace('_', ' · ') }} · {{ form.group }}</p>
          <h1>{{ record.title }}</h1>
          <p class="rec-meta">
            <span><i class="fa-regular fa-calendar" aria-hidden="true" /> {{ formatRecordDate(record.recordDate) }}</span>
            <span v-if="record.equipment"><i class="fa-solid fa-gears" aria-hidden="true" /> {{ record.equipment.name }}</span>
            <span v-if="record.position"><i class="fa-solid fa-id-badge" aria-hidden="true" /> {{ catalogStore.positionLabel.get(record.position) ?? record.position }}</span>
            <span><i class="fa-regular fa-user" aria-hidden="true" /> {{ authorName(record) }}</span>
            <span class="file"><i class="fa-regular fa-file-pdf" aria-hidden="true" /> {{ record.fileName }}</span>
          </p>
        </div>
        <span class="status" :class="`status--${record.status}`">
          <i class="fa-solid" :class="STATUS_ICONS[record.status]" aria-hidden="true" />
          {{ STATUS_LABELS[record.status] }}
        </span>
      </header>

      <p v-if="record.history?.length && record.history[record.history.length - 1]!.action === 'devuelto'" class="returned">
        <i class="fa-solid fa-rotate-left" aria-hidden="true" />
        Devuelto por {{ record.history[record.history.length - 1]!.byName }}:
        <strong>{{ record.history[record.history.length - 1]!.reason }}</strong>
      </p>

      <div class="toolbar">
        <div class="zoom">
          <button type="button" aria-label="Alejar" :disabled="zoom <= 1" @click="zoom = Math.max(1, zoom - 0.5)">
            <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
          </button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button type="button" aria-label="Acercar" :disabled="zoom >= 2.5" @click="zoom = Math.min(2.5, zoom + 0.5)">
            <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
          </button>
        </div>
        <span v-if="saveLabel" class="save" :class="`save--${autosave.state.value}`">
          <i class="fa-solid" :class="autosave.state.value === 'offline' ? 'fa-wifi' : autosave.state.value === 'saving' ? 'fa-rotate' : 'fa-check'" aria-hidden="true" />
          {{ saveLabel }}
        </span>
        <span v-else-if="!editable && record.status !== 'archivado'" class="save">
          <i class="fa-solid fa-lock" aria-hidden="true" /> Solo lectura en esta etapa
        </span>
      </div>

      <div class="layout">
        <section class="sheet-col">
          <FormCanvas
            :form="form"
            :values="values"
            :signatures="record.signatures"
            :editable="editable"
            :zoom="zoom"
            :can-sign="canSign"
            @change="onChange"
            @sign="openSign"
            @photo="openPhoto"
          />
        </section>

        <aside class="side">
          <div class="card actions">
            <button v-if="canSubmit" type="button" class="btn btn-primary" :disabled="busy" @click="submit">
              <i class="fa-solid fa-paper-plane" aria-hidden="true" /> Listo para enviar
            </button>
            <button v-if="canApprove" type="button" class="btn btn-primary" :disabled="busy" @click="approve">
              <i class="fa-solid" :class="record.status === 'por_capitan' ? 'fa-anchor' : 'fa-box-archive'" aria-hidden="true" />
              {{ record.status === 'por_capitan' ? 'Aprobar y enviar a oficina' : 'Recibir y archivar' }}
            </button>
            <button v-if="canApprove" type="button" class="btn btn-return" :disabled="busy" @click="giveBack">
              <i class="fa-solid fa-rotate-left" aria-hidden="true" /> Devolver con motivo
            </button>
            <button type="button" class="btn btn-ghost" :disabled="busy" @click="openPdf">
              <i class="fa-regular fa-file-pdf" aria-hidden="true" /> Ver PDF oficial
            </button>
            <button v-if="canDiscard" type="button" class="btn btn-ghost danger" :disabled="busy" @click="discard">
              <i class="fa-solid fa-trash" aria-hidden="true" /> Descartar borrador
            </button>
            <p v-if="record.status === 'archivado'" class="archived">
              <i class="fa-solid fa-shield-halved" aria-hidden="true" />
              Archivado {{ record.archivedAt ? formatStamp(record.archivedAt) : '' }} · Inalterable
            </p>
          </div>

          <div class="card sigs">
            <h3><i class="fa-solid fa-signature" aria-hidden="true" /> Firmas</h3>
            <template v-for="stage in (['tripulacion', 'capitan', 'oficina'] as SignatureStage[])" :key="stage">
              <div v-if="slotsByStage[stage].length" class="sig-group">
                <p class="sig-stage">{{ STAGE_LABELS[stage] }}</p>
                <button
                  v-for="s in slotsByStage[stage]"
                  :key="s.name"
                  type="button"
                  class="sig"
                  :class="{ done: signedMap.has(s.name), can: canSign(s) }"
                  :disabled="!canSign(s) && !signedMap.has(s.name)"
                  @click="openSign(s)"
                >
                  <i class="fa-solid" :class="signedMap.has(s.name) ? 'fa-circle-check' : canSign(s) ? 'fa-pen' : 'fa-circle'" aria-hidden="true" />
                  <span class="sig-label">{{ s.label }}</span>
                  <span v-if="signedMap.has(s.name)" class="sig-who">
                    {{ signedMap.get(s.name)!.signerName }} · {{ formatStamp(signedMap.get(s.name)!.signedAt) }}
                  </span>
                </button>
              </div>
            </template>
            <p v-if="!slots.length" class="muted">Este formato no lleva firmas.</p>
          </div>

          <details v-if="record.history?.length" class="card history">
            <summary><i class="fa-solid fa-clock-rotate-left" aria-hidden="true" /> Historial</summary>
            <ol>
              <li v-for="(h, i) in [...record.history].reverse()" :key="i">
                <strong>{{ h.action }}</strong>
                <span>{{ h.byName }} · {{ formatStamp(h.at) }}</span>
                <em v-if="h.reason">{{ h.reason }}</em>
              </li>
            </ol>
          </details>
        </aside>
      </div>

      <input ref="photoInput" type="file" accept="image/*" capture="environment" hidden @change="onPhotoSelected" />

      <SignaturePad
        v-if="signing"
        :label="signing.label ?? 'Firma'"
        :ask-name="askName"
        :default-name="!askName || slotsByStage.tripulacion.length === 1 ? userStore.user?.name ?? '' : ''"
        @close="signing = null"
        @signed="onSigned"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.rec-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.8rem;
}

.back {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--cream-200);
  background: var(--surface);
  color: var(--ink-600);
}

.rec-title {
  flex: 1;
  min-width: 0;

  h1 {
    font-size: 1.3rem;
    text-wrap: balance;

    @include tablet {
      font-size: 1.5rem;
    }
  }
}

.rec-code {
  margin: 0 0 0.1rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold-500);
}

.rec-meta {
  margin: 0.35rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  font-size: 0.8rem;
  color: var(--ink-600);

  i {
    color: var(--ink-400);
    margin-right: 0.15rem;
  }
}

.file {
  font-variant-numeric: tabular-nums;
  color: var(--ink-400);
}

.status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--powder-100);
  color: var(--navy-700);
  white-space: nowrap;

  &--por_capitan,
  &--por_oficina {
    background: rgba(185, 128, 47, 0.15);
    color: #8a5d1d;
  }

  &--archivado {
    background: rgba(63, 122, 87, 0.14);
    color: var(--success);
  }
}

.returned {
  margin: 0 0 0.8rem;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-sm);
  background: rgba(180, 72, 59, 0.08);
  border: 1px solid rgba(180, 72, 59, 0.3);
  font-size: 0.88rem;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.zoom {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--cream-200);

  button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--ink-600);

    &:disabled {
      opacity: 0.35;
    }
  }

  span {
    min-width: 3rem;
    text-align: center;
    font-size: 0.82rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.save {
  font-size: 0.8rem;
  color: var(--ink-400);

  &--offline {
    color: var(--warning);
    font-weight: 600;
  }

  &--error {
    color: var(--danger);
    font-weight: 600;
  }
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;

  @media (min-width: 1280px) {
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }
}

.sheet-col {
  min-width: 0;
}

.side {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
  align-items: start;

  @include tablet {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .history {
      grid-column: 1 / -1;
    }
  }

  @media (min-width: 1280px) {
    grid-template-columns: minmax(0, 1fr);
    position: sticky;
    top: calc(64px + 16px);
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  .btn {
    width: 100%;
    justify-content: flex-start;
  }
}

.btn-return {
  background: #8c5a1d;
  color: #fff;
}

.danger {
  color: var(--danger);
  border-color: rgba(180, 72, 59, 0.4);
}

.archived {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--success);
  font-weight: 600;
}

.sigs h3 {
  margin: 0 0 0.6rem;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;

  i {
    color: var(--gold-500);
  }
}

.sig-group + .sig-group {
  margin-top: 0.7rem;
}

.sig-stage {
  margin: 0 0 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-400);
}

.sig {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 0.1rem 0.5rem;
  align-items: center;
  text-align: left;
  padding: 0.45rem 0.55rem;
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  color: var(--ink-400);
  transition: background 0.15s ease;

  & + & {
    margin-top: 0.15rem;
  }

  &.can {
    color: var(--gold-500);
    font-weight: 600;
    background: rgba(159, 107, 60, 0.08);
  }

  &.done {
    color: var(--success);
  }
}

.sig-label {
  color: var(--ink-900);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sig-who {
  grid-column: 2;
  font-size: 0.74rem;
  color: var(--ink-400);
  font-weight: 400;
}

.muted {
  margin: 0;
  color: var(--ink-400);
  font-size: 0.85rem;
}

.history {
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }

  ol {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    display: flex;
    flex-direction: column;
    padding-left: 0.7rem;
    border-left: 2px solid var(--cream-200);
    font-size: 0.82rem;

    span {
      color: var(--ink-400);
      font-size: 0.75rem;
    }

    em {
      font-style: normal;
      color: var(--ink-600);
    }
  }
}
</style>
