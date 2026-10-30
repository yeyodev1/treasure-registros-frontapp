<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import axios from 'axios'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import { usePdfViewerStore } from '@/stores/pdfViewer'
import { useSound } from '@/composables/useSound'
import { useAutosave } from '@/composables/useAutosave'
import { useSignatureImages } from '@/composables/useSignatureImages'
import {
  apiDiscard,
  apiRecord,
  apiSetTest,
  apiRecordAction,
  apiRemoveSignature,
  apiReturnRecord,
  apiSign,
  apiUploadPhoto,
  type SaveResult,
} from '@/services/api'
import { apiErrorMessage, isNetworkError } from '@/services/httpBase'
import {
  GENERIC_RETURN_SECTIONS,
  STAGE_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  canEditRecord,
  canSignSlot,
  formatHour,
  formatStamp,
  recordWhen,
  recordWho,
  statusLabel,
} from '@/utils/ism'
import FormCanvas from '@/components/registros/FormCanvas.vue'
import SignaturePad from '@/components/registros/SignaturePad.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import GuidedWizard from '@/components/guided/GuidedWizard.vue'
import GuidedSummary from '@/components/guided/GuidedSummary.vue'
import type { ContextDraft } from '@/components/guided/GuidedContextForm.vue'
import CrewSign from '@/components/sign/CrewSign.vue'
import SentPanel from '@/components/sign/SentPanel.vue'
import ReviewerPanel from '@/components/sign/ReviewerPanel.vue'
import SignSteps from '@/components/sign/SignSteps.vue'
import type { IsmAnswer, IsmField, IsmForm, IsmMissing, IsmRecord, IsmSchema, IsmSignature, SignatureStage } from '@/types'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const catalogStore = useCatalogStore()
const confirmStore = useConfirmStore()
const toast = useToastStore()
const pdfViewer = usePdfViewerStore()
const { play } = useSound()

const recordId = () => String(route.params.id)

const record = shallowRef<IsmRecord | null>(null)
const form = shallowRef<IsmForm | null>(null)
const schema = shallowRef<IsmSchema | null>(null)
const values = ref<Record<string, string | boolean>>({})
const answers = ref<Record<string, IsmAnswer>>({})
const ctxDraft = ref<ContextDraft>({ activityDate: '', activityTime: '', place: '', name: '', position: '', crewId: '' })
const serverMissing = shallowRef<IsmMissing[]>([])
const loading = shallowRef(true)
const loadError = shallowRef<{ message: string; fatal: boolean } | null>(null)
const busy = shallowRef(false)
const zoom = shallowRef(1)
const signing = shallowRef<IsmField | null>(null)
const photoTarget = shallowRef<IsmField | null>(null)
const photoInput = useTemplateRef<HTMLInputElement>('photoInput')
/** Registros guiados en revisión: resumen o la hoja oficial. */
const view = shallowRef<'resumen' | 'hoja'>('resumen')
/** Recorrido del tripulante: llenar → firmar (pantalla 2) → enviado (pantalla 3). */
const phase = shallowRef<'fill' | 'sign' | 'sent'>('fill')
/** Se vuelve a montar el asistente para abrir el paso de contexto ("No soy yo"). */
const wizardKey = shallowRef(0)

function onSaved(result: SaveResult) {
  if (!record.value) return
  record.value = {
    ...record.value,
    signatures: result.record.signatures,
    flags: result.record.flags ?? record.value.flags,
    fileName: result.record.fileName,
    recordDate: result.record.recordDate,
    context: result.record.context ?? record.value.context,
    updatedAt: result.record.updatedAt,
  }
  if (result.invalidated.length) {
    const labels = result.record.signatures.filter((s) => result.invalidated.includes(s.field)).map((s) => s.label)
    toast.push(`Firma anulada: cambiaste datos después de firmar. Vuelve a firmar: ${labels.join(', ')}.`, 'info')
  }
}

const autosave = useAutosave(recordId, { onSaved })

const signatureList = computed<IsmSignature[]>(() => record.value?.signatures ?? [])
const { images } = useSignatureImages(recordId, signatureList)

const guided = computed(() => Boolean(record.value?.schemaVersion && schema.value))

const editable = computed(
  () => Boolean(record.value && form.value && canEditRecord(record.value, userStore.role, form.value, userStore.user?.id)),
)

const slots = computed(() => (form.value?.fields ?? []).filter((f) => f.type === 'signature'))
const signedMap = computed(() => new Map((record.value?.signatures ?? []).map((s) => [s.field, s])))

const slotsByStage = computed(() => {
  const groups: Record<SignatureStage, IsmField[]> = { tripulacion: [], capitan: [], oficina: [] }
  for (const s of slots.value) groups[s.stage ?? 'tripulacion'].push(s)
  return groups
})

const canSubmit = computed(() => record.value?.status === 'borrador' && editable.value)
/** Registros guiados con firmas por pasos (R-14): se firman en sus pantallas. */
const stepSigned = computed(() => Boolean(guided.value && schema.value?.signers?.length))
const canApprove = computed(
  () =>
    !stepSigned.value &&
    // Firma y devolución solo desde la cuenta del rol (no Gerencia por otro).
    ((record.value?.status === 'por_capitan' && userStore.role === 'capitan') ||
      (record.value?.status === 'por_oficina' && userStore.role === 'designada')),
)

/** Pantalla 4 (Capitán) o 5 (Persona Designada): solo la cuenta de ese rol la ve. */
const reviewMode = computed<'capitan' | 'designada' | null>(() => {
  if (!stepSigned.value || !record.value) return null
  if (record.value.status === 'por_capitan' && userStore.role === 'capitan') return 'capitan'
  if (record.value.status === 'por_oficina' && userStore.role === 'designada') return 'designada'
  return null
})

/** Pantallas de un solo paso: el panel lateral de firmas no hace falta. */
const focused = computed(() => Boolean(guided.value && (editable.value || reviewMode.value || phase.value === 'sent')))

async function flushBeforeSign() {
  await autosave.flush()
}

async function goSign() {
  try {
    await autosave.flush()
  } catch {
    // Si no hay señal, la firma lo vuelve a intentar.
  }
  phase.value = 'sign'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** "No soy yo": vuelve al contexto para elegir quién hizo el chequeo. */
function notMe() {
  phase.value = 'fill'
  wizardKey.value++
  if (record.value?.context) record.value = { ...record.value, context: { ...record.value.context, confirmedAt: null } }
  ctxDraft.value = { ...ctxDraft.value, crewId: '', name: '' }
  autosave.queueContext({ crewId: '' })
}

function onCrewSigned(rec: IsmRecord) {
  record.value = rec
  phase.value = 'sent'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function onReviewed(rec: IsmRecord) {
  record.value = rec
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const canDiscard = computed(
  () =>
    record.value?.status === 'borrador' &&
    (userStore.isAdmin ||
      (typeof record.value.createdBy === 'object' && record.value.createdBy._id === userStore.user?.id)),
)

const saveLabel = computed(() => {
  const s = autosave.state.value
  if (s === 'saving') return 'Guardando…'
  if (s === 'pending') return 'Pendiente de sincronizar'
  if (s === 'offline') return 'Sin conexión: guardado en la tableta, se enviará solo'
  if (s === 'error') return `Guardado en la tableta, no se pudo sincronizar: ${autosave.lastError.value}`
  if (s === 'saved' && autosave.savedAt.value) {
    return `Guardado ${formatHour(autosave.savedAt.value.toISOString())}`
  }
  return ''
})

const saveIcon = computed(() => {
  const s = autosave.state.value
  if (s === 'offline') return 'fa-wifi'
  if (s === 'saving') return 'fa-rotate fa-spin'
  if (s === 'pending') return 'fa-cloud-arrow-up'
  if (s === 'error') return 'fa-triangle-exclamation'
  return 'fa-check'
})

function canSign(f: IsmField): boolean {
  if (!record.value || !form.value || !f.stage) return false
  return canSignSlot(record.value, userStore.role, f.stage, form.value)
}

function positionLabel(value: string) {
  return catalogStore.positionLabel.get(value) ?? value
}

function contextDraftOf(rec: IsmRecord): ContextDraft {
  const c = rec.context
  return {
    activityDate: c?.activityDate ?? '',
    activityTime: c?.activityTime ?? '',
    place: c?.place ?? '',
    name: c?.filledBy?.fromList ? c.filledBy.name : '',
    position: c?.filledBy?.position ?? '',
    crewId: c?.filledBy?.fromList ? c.filledBy.user : '',
  }
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const rec = await apiRecord(recordId())
    const [def] = await Promise.all([catalogStore.definition(rec.code), catalogStore.load()])
    form.value = def
    schema.value = rec.schemaVersion ? await catalogStore.schema(rec.code, rec.schemaVersion) : null
    // Lo que quedó en la tableta sin sincronizar gana sobre lo del servidor.
    const local = autosave.adoptLocal()
    values.value = { ...(rec.data ?? {}), ...local.data }
    answers.value = { ...(rec.answers ?? {}), ...local.answers }
    const draft = contextDraftOf(rec)
    ctxDraft.value = {
      ...draft,
      ...Object.fromEntries(Object.entries(local.context).filter(([k]) => k in draft)),
    } as ContextDraft
    record.value = rec
    view.value = 'resumen'
    if (autosave.hasPending()) autosave.flush().catch(() => undefined)
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    loadError.value = {
      message: isNetworkError(err)
        ? 'Sin conexión con el servidor. Lo que llenaste sigue guardado en esta tableta.'
        : apiErrorMessage(err),
      fatal: status === 403 || status === 404,
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function onChange(name: string, value: string | boolean) {
  values.value = { ...values.value, [name]: value }
  autosave.queue(name, value)
}

function onAnswer(id: string, answer: IsmAnswer) {
  answers.value = { ...answers.value, [id]: answer }
  serverMissing.value = []
  // Hora de la tablet al responder (se guarda junto a la del servidor).
  autosave.queueAnswer(id, { ...answer, deviceAt: new Date().toISOString() })
}

function onContext(next: ContextDraft) {
  const changed = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => ctxDraft.value[k as keyof ContextDraft] !== v),
  )
  ctxDraft.value = next
  if (Object.keys(changed).length) autosave.queueContext(changed)
}

/** Hora de una sección: se ve al instante y se guarda con lo demás. */
function onSectionTime(sectionId: string, time: string) {
  if (!record.value?.context) return
  record.value = {
    ...record.value,
    context: { ...record.value.context, sectionTimes: { ...(record.value.context.sectionTimes ?? {}), [sectionId]: time } },
  }
  autosave.queueContext({ sectionTimes: { [sectionId]: time } })
}

function openSign(f: IsmField) {
  const existing = signedMap.value.get(f.name)
  if (existing && existing.valid !== false) {
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
    // Se firma sobre lo guardado: primero se sincroniza lo pendiente.
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
    if (axios.isAxiosError(err) && err.response?.status === 422) {
      const data = err.response.data as { message?: string; missing?: IsmMissing[] }
      serverMissing.value = data.missing ?? []
    }
    toast.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}

async function submit() {
  const novedades = record.value?.flags?.novedades ?? 0
  const ok = await confirmStore.ask({
    title: `¿Enviar ${record.value?.code}?`,
    message: guided.value
      ? `Pasa al Capitán para su revisión y firma${novedades ? ` con ${novedades} ${novedades === 1 ? 'novedad' : 'novedades'} destacadas` : ''}. Enviar no autoriza el zarpe: lo decide el Capitán. Ya no podrás editarlo salvo que te lo devuelvan.`
      : form.value?.stages.capitan
        ? 'Pasa al Capitán para su revisión y firma. Ya no podrás editarlo salvo que te lo devuelvan.'
        : 'Pasa a la oficina para que la Persona Designada lo reciba y archive.',
    confirmLabel: guided.value ? 'Enviar al Capitán' : 'Listo para enviar',
    icon: 'fa-paper-plane',
  })
  if (!ok) return
  await run(async () => {
    record.value = await apiRecordAction(record.value!._id, 'submit')
    serverMissing.value = []
    view.value = 'resumen'
    toast.success(STATUS_LABELS[record.value.status])
  })
}

async function approve() {
  const toOffice = record.value?.status === 'por_capitan'
  const novedades = record.value?.flags?.novedades ?? 0
  const ok = await confirmStore.ask({
    title: toOffice ? '¿Firmar y enviar a la Persona Designada?' : '¿Firmar y archivar el registro?',
    message: toOffice
      ? `Firmar deja constancia de tu revisión${guided.value && novedades ? ` (${novedades} ${novedades === 1 ? 'novedad' : 'novedades'})` : ''}. La decisión de zarpar sigue siendo tuya.`
      : 'Al firmar, el registro se archiva y ya no se puede modificar.',
    confirmLabel: toOffice ? 'Firmar y enviar a la Persona Designada' : 'Firmar y archivar',
    icon: toOffice ? 'fa-anchor' : 'fa-box-archive',
  })
  if (!ok) return
  await run(async () => {
    record.value = await apiRecordAction(record.value!._id, 'approve')
    toast.success(toOffice ? 'Firmado: ya está con la Persona Designada' : 'Firmado y archivado')
  })
}

const returnSections = computed(() =>
  schema.value ? ['Contexto', ...schema.value.sections.map((s) => s.title), 'Firmas'] : GENERIC_RETURN_SECTIONS,
)

async function giveBack() {
  const result = await confirmStore.askReasonChoice({
    title: `¿Devolver ${record.value?.code}?`,
    message: 'Vuelve a borrador para que lo corrijan. Las firmas de revisión se retiran.',
    confirmLabel: 'Devolver',
    icon: 'fa-rotate-left',
    choice: { label: 'Sección afectada (obligatoria)', options: returnSections.value },
    reason: {
      label: 'Motivo (obligatorio)',
      suggestions: ['Falta información', 'Dato incorrecto', 'Falta una firma', 'Novedad sin acción clara'],
    },
  })
  if (!result) return
  await run(async () => {
    record.value = await apiReturnRecord(record.value!._id, result.reason, result.choice)
    toast.success('Devuelto con motivo y sección')
  })
}

/** Solo la Persona Designada (o Gerencia) separa los registros de prueba. */
const canMarkTest = computed(() => userStore.role === 'designada' || userStore.role === 'duena')

async function toggleTest() {
  const rec = record.value
  if (!rec) return
  const next = !rec.test
  const reason = await confirmStore.askReason({
    title: next ? '¿Marcar como registro de prueba?' : '¿Quitar la marca de prueba?',
    message: next
      ? 'Sale de los indicadores y no genera avisos. No cambia su contenido ni sus firmas.'
      : 'Vuelve a contar en indicadores y avisos.',
    confirmLabel: next ? 'Marcar como prueba' : 'Quitar la marca',
    icon: 'fa-flask',
    reason: { label: 'Motivo', suggestions: ['Prueba de la app', 'Capacitación', 'Registro real'] },
  })
  if (!reason) return
  await run(async () => {
    const res = await apiSetTest(rec._id, next, reason)
    record.value = { ...record.value!, test: res.test }
    toast.success(res.test ? 'Marcado como prueba' : 'Ya no es de prueba')
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

/** El PDF se abre dentro de la app, con su nombre y el botón Descargar. */
async function openPdf() {
  await autosave.flush().catch(() => undefined)
  pdfViewer.open(record.value!._id, record.value!.fileName)
}

/** Color del estado: devuelto en rojo, por firmar en caramelo, archivado en verde. */
const statusPill = computed(() => {
  const r = record.value
  if (!r) return ''
  if (r.returnInfo && r.status !== 'archivado') return 'pill--ret'
  if (r.status === 'archivado') return 'pill--ok'
  if (r.status === 'borrador') return ''
  return 'pill--turn'
})

const lastEvent = computed(() => record.value?.history?.[record.value.history.length - 1])
</script>

<template>
  <div class="page rec">
    <SkeletonList v-if="loading" variant="row" :rows="8" />

    <div v-else-if="loadError" class="card state-error" role="alert">
      <i class="fa-solid" :class="loadError.fatal ? 'fa-lock' : 'fa-cloud-arrow-down'" aria-hidden="true" />
      <div>
        <h2>{{ loadError.fatal ? 'No se puede abrir este registro' : 'No se pudo cargar el registro' }}</h2>
        <p>{{ loadError.message }}</p>
        <div class="state-actions">
          <button v-if="!loadError.fatal" type="button" class="btn btn-primary" @click="load">
            <i class="fa-solid fa-rotate-right" aria-hidden="true" /> Reintentar
          </button>
          <button type="button" class="btn btn-ghost" @click="router.push('/')">
            <i class="fa-solid fa-house" aria-hidden="true" /> Volver a Mis tareas
          </button>
        </div>
      </div>
    </div>

    <template v-else-if="record && form">
      <header class="rec-head" :class="{ 'rec-head--compact': focused }">
        <button type="button" class="back" aria-label="Volver" title="Volver" @click="router.back()">
          <i class="fa-solid fa-arrow-left" aria-hidden="true" />
        </button>
        <div class="rec-title">
          <h1>
            {{ guided ? schema!.title : record.title }}
            <span class="rec-code">{{ record.code.replace('_', ' · ') }}</span>
          </h1>
          <p class="rec-meta">
            <span>{{ recordWhen(record) }}</span>
            <span v-if="record.context?.place">{{ record.context.place }}</span>
            <span v-if="record.equipment">{{ record.equipment.name }}</span>
            <span v-if="record.position">{{ positionLabel(record.position) }}</span>
            <span v-if="recordWho(record)">{{ recordWho(record) }}</span>
            <span v-if="!focused" class="file">{{ record.fileName }}</span>
          </p>
        </div>
        <span class="pill rec-status" :class="statusPill">
          <i class="fa-solid" :class="record.returnInfo && record.status !== 'archivado' ? 'fa-rotate-left' : STATUS_ICONS[record.status]" aria-hidden="true" />
          {{ statusLabel(record) }}
        </span>
      </header>

      <p v-if="!guided && record.status === 'borrador' && lastEvent?.action === 'devuelto'" class="returned">
        <i class="fa-solid fa-rotate-left" aria-hidden="true" />
        Devuelto por {{ lastEvent.byName }}<template v-if="lastEvent.section"> · sección <strong>{{ lastEvent.section }}</strong></template>:
        <strong>{{ lastEvent.reason }}</strong>
      </p>

      <div v-if="!focused" class="toolbar">
        <div v-if="!guided || view === 'hoja'" class="zoom">
          <button type="button" aria-label="Alejar" :disabled="zoom <= 1" @click="zoom = Math.max(1, zoom - 0.5)">
            <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
          </button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button type="button" aria-label="Acercar" :disabled="zoom >= 2.5" @click="zoom = Math.min(2.5, zoom + 0.5)">
            <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
          </button>
        </div>
        <div v-if="guided" class="views" role="tablist">
          <button type="button" role="tab" :aria-selected="view === 'resumen'" :class="{ on: view === 'resumen' }" @click="view = 'resumen'">
            <i class="fa-solid fa-list-check" aria-hidden="true" /> Resumen
          </button>
          <button type="button" role="tab" :aria-selected="view === 'hoja'" :class="{ on: view === 'hoja' }" @click="view = 'hoja'">
            <i class="fa-regular fa-file-lines" aria-hidden="true" /> Hoja oficial
          </button>
        </div>
        <Transition name="fade" mode="out-in">
          <span v-if="saveLabel" :key="autosave.state.value" class="save" :class="`save--${autosave.state.value}`">
            <i class="fa-solid" :class="saveIcon" aria-hidden="true" />
            {{ saveLabel }}
          </span>
          <span v-else-if="!editable && record.status !== 'archivado'" class="save">
            <i class="fa-solid fa-lock" aria-hidden="true" />
            {{ guided && record.status === 'borrador' ? 'Solo lectura: lo corrige quien hizo el registro' : 'Solo lectura en esta etapa' }}
          </span>
        </Transition>
      </div>

      <div class="layout" :class="{ 'layout--guided': focused && !reviewMode, 'layout--review': reviewMode }">
        <section class="sheet-col">
          <Transition name="fade" mode="out-in">
          <SentPanel v-if="guided && phase === 'sent'" key="sent" :record="record" :schema="schema!" @home="router.push('/')" />
          <CrewSign
            v-else-if="guided && editable && phase === 'sign'"
            key="sign"
            :record="record"
            :schema="schema!"
            :context="ctxDraft"
            :position-label="positionLabel"
            :before-sign="flushBeforeSign"
            @back="phase = 'fill'"
            @not-me="notMe"
            @signed="onCrewSigned"
          />
          <ReviewerPanel
            v-else-if="reviewMode"
            key="review"
            :record="record"
            :schema="schema!"
            :answers="answers"
            :mode="reviewMode"
            :position-label="positionLabel"
            @updated="onReviewed"
            @pdf="openPdf"
          />
          <GuidedWizard
            v-else-if="guided && editable"
            :key="`wiz-${wizardKey}`"
            :schema="schema!"
            :answers="answers"
            :context="ctxDraft"
            :full-context="record.context ?? null"
            :account-name="record.context?.filledBy?.accountName ?? userStore.user?.name ?? ''"
            :positions="catalogStore.positions"
            :editable="editable"
            :submitting="busy"
            :return-info="record.returnInfo"
            :server-missing="serverMissing"
            :sync-label="saveLabel"
            @answer="onAnswer"
            @context="onContext"
            @section-time="onSectionTime"
            @sign="goSign"
            @pdf="openPdf"
          />
          <div v-else key="read">
          <Transition name="fade" mode="out-in">
            <div v-if="guided && view === 'resumen'" key="sum" class="review">
              <p class="review-notice">
                <i class="fa-solid fa-anchor" aria-hidden="true" /> {{ schema!.notice }}
              </p>
              <GuidedSummary
                :schema="schema!"
                :answers="answers"
                :context="record.context ?? null"
                :position-label="positionLabel"
              />
            </div>
            <FormCanvas
              v-else
              key="sheet"
              :form="form"
              :values="values"
              :signatures="record.signatures"
              :editable="editable && !guided"
              :zoom="zoom"
              :can-sign="canSign"
              :images="images"
              @change="onChange"
              @sign="openSign"
              @photo="openPhoto"
            />
          </Transition>
          </div>
          </Transition>
        </section>

        <aside class="side">
          <div class="card actions">
            <button v-if="canSubmit && !guided" type="button" class="btn btn-primary" :disabled="busy" @click="submit">
              <i class="fa-solid fa-paper-plane" aria-hidden="true" /> Listo para enviar
            </button>
            <button v-if="canApprove" type="button" class="btn btn-primary" :disabled="busy" @click="approve">
              <i class="fa-solid" :class="record.status === 'por_capitan' ? 'fa-anchor' : 'fa-box-archive'" aria-hidden="true" />
              {{ record.status === 'por_capitan' ? 'Firmar y enviar a la Persona Designada' : 'Firmar y archivar' }}
            </button>
            <button v-if="canApprove" type="button" class="btn btn-return" :disabled="busy" @click="giveBack">
              <i class="fa-solid fa-rotate-left" aria-hidden="true" />
              {{ record.status === 'por_capitan' ? 'Devolver al tripulante' : 'Devolver' }}
            </button>
            <button v-if="!(guided && editable)" type="button" class="btn btn-ghost" :disabled="busy" @click="openPdf">
              <i class="fa-regular fa-file-pdf" aria-hidden="true" /> Ver cómo queda el PDF
            </button>
            <button v-if="canMarkTest" type="button" class="btn btn-ghost" :disabled="busy" @click="toggleTest">
              <i class="fa-solid fa-flask" aria-hidden="true" />
              {{ record.test ? 'Ya no es de prueba' : 'Marcar como prueba' }}
            </button>
            <p v-if="record.test" class="test-note">
              <i class="fa-solid fa-flask" aria-hidden="true" /> Registro de prueba: no cuenta en indicadores ni avisos.
            </p>
            <button v-if="canDiscard" type="button" class="btn btn-ghost danger" :disabled="busy" @click="discard">
              <i class="fa-solid fa-trash" aria-hidden="true" /> Descartar borrador
            </button>
            <p v-if="record.status === 'archivado'" class="archived">
              <i class="fa-solid fa-shield-halved" aria-hidden="true" />
              Archivado {{ record.archivedAt ? formatStamp(record.archivedAt) : '' }} · Inalterable
            </p>
            <p v-if="record.archivedPdf?.sha256" class="archived archived--hash" :title="record.archivedPdf.sha256">
              <i class="fa-solid fa-fingerprint" aria-hidden="true" />
              PDF congelado · sha256 {{ record.archivedPdf.sha256.slice(0, 12) }}…
            </p>
          </div>

          <div v-if="stepSigned && !focused" class="card sigs">
            <h3><i class="fa-solid fa-signature" aria-hidden="true" /> Firmas</h3>
            <SignSteps :record="record" :signers="schema!.signers!" />
            <ul class="sig-legend">
              <li><strong>Capitán</strong> — solo el Capitán, desde su cuenta.</li>
              <li><strong>Persona Designada</strong> — firma en oficina. A bordo no hay que hacer nada.</li>
            </ul>
            <details v-if="record.annulledSignatures?.length" class="sig-annulled">
              <summary>Firmas anuladas ({{ record.annulledSignatures.length }})</summary>
              <ul>
                <li v-for="(a, i) in record.annulledSignatures" :key="i">
                  {{ a.label }}: {{ a.signerName }} · {{ formatStamp(a.signedAt) }}<br />
                  <small>Anulada {{ formatStamp(a.annulledAt) }} · {{ a.annulReason }}</small>
                </li>
              </ul>
            </details>
          </div>
          <div v-else-if="!stepSigned" class="card sigs">
            <h3><i class="fa-solid fa-signature" aria-hidden="true" /> Firmas</h3>
            <template v-for="stage in (['tripulacion', 'capitan', 'oficina'] as SignatureStage[])" :key="stage">
              <div v-if="slotsByStage[stage].length" class="sig-group">
                <p class="sig-stage">{{ STAGE_LABELS[stage] }}</p>
                <button
                  v-for="s in slotsByStage[stage]"
                  :key="s.name"
                  type="button"
                  class="sig"
                  :class="{
                    done: signedMap.has(s.name) && signedMap.get(s.name)!.valid !== false,
                    invalid: signedMap.get(s.name)?.valid === false,
                    can: canSign(s),
                  }"
                  :disabled="!canSign(s) && !signedMap.has(s.name)"
                  @click="openSign(s)"
                >
                  <i
                    class="fa-solid"
                    :class="
                      signedMap.get(s.name)?.valid === false
                        ? 'fa-triangle-exclamation'
                        : signedMap.has(s.name)
                          ? 'fa-circle-check'
                          : canSign(s)
                            ? 'fa-pen'
                            : 'fa-circle'
                    "
                    aria-hidden="true"
                  />
                  <span class="sig-label">{{ s.label }}</span>
                  <span v-if="signedMap.get(s.name)?.valid === false" class="sig-who sig-who--invalid">
                    Firma anulada: cambiaste datos después de firmar. Vuelve a firmar.
                  </span>
                  <span v-else-if="signedMap.has(s.name)" class="sig-who">
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
                <em v-if="h.section">Sección: {{ h.section }}</em>
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

// Encabezado del registro: volver, nombre y código, cuándo y quién, y el estado.
.rec-head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.6rem 0.9rem;
  margin-bottom: 1.5rem;

  &--compact {
    margin-bottom: 1rem;
  }
}

.back {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--navy-800);
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: var(--hover);
    border-color: var(--navy-600);
  }
}

.rec-title {
  flex: 1;
  min-width: 0;

  h1 {
    font-size: 1.6rem;

    @include tablet {
      font-size: 1.85rem;
    }
  }
}

.rec-code {
  margin-left: 0.25rem;
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink-400);
  white-space: nowrap;
}

.rec-meta {
  margin: 0.3rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem 0;
  font-size: 1rem;
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;

  span + span::before {
    content: '·';
    margin: 0 0.45rem;
    color: var(--ink-400);
  }
}

.file {
  color: var(--ink-600);
}

.rec-status {
  flex-shrink: 0;
  min-height: 36px;
  margin-top: 0.4rem;
}

.returned {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--danger-100);
  box-shadow: inset 4px 0 0 var(--danger);
  font-size: 1rem;

  i {
    color: var(--danger);
    margin-right: 0.3rem;
  }
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
  border: 1px solid var(--line-strong);

  button {
    width: 44px;
    height: 44px;
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
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.save {
  font-size: 1rem;
  color: var(--ink-600);

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
  background: var(--surface);
  border: 1px solid var(--line-strong);
  color: var(--danger);
}

.danger {
  color: var(--danger);
  border-color: #e3bdb6;
}

// Pantallas de un solo paso (asistente, firma, revisión): lo demás va abajo,
// en una fila tranquila, a todo el ancho. En computadora, quien revisa lo
// tiene a la derecha.
@mixin below-row {
  grid-template-columns: minmax(0, 1fr) !important;

  .side {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    grid-template-columns: minmax(0, 1fr);
    position: static;
  }

  .actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 0;
    background: transparent;
    border: none;

    .btn {
      width: auto;
    }
  }

  .history {
    grid-column: auto;
  }
}

.layout--guided {
  @include below-row;
}

.layout--review {
  @media (max-width: 1279px) {
    @include below-row;
  }
}

.test-note {
  margin: 0;
  font-size: 1rem;
  color: var(--navy-700);
  font-weight: 600;
}

.archived {
  margin: 0.2rem 0 0;
  font-size: 1rem;
  color: var(--success);
  font-weight: 600;
}

.archived--hash {
  color: var(--ink-600);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.sigs h3 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  i {
    font-size: 1rem;
    color: var(--ink-400);
  }
}

.sig-group + .sig-group {
  margin-top: 0.7rem;
}

.sig-stage {
  margin: 0 0 0.3rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink-600);
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
  font-size: 1rem;
  color: var(--ink-400);
  transition: background 0.15s ease;

  & + & {
    margin-top: 0.15rem;
  }

  &.can {
    color: var(--gold-500);
    font-weight: 600;
    background: var(--gold-100);
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
  font-size: 1rem;
  color: var(--ink-400);
  font-weight: 400;
}

.muted {
  margin: 0;
  color: var(--ink-400);
  font-size: 1rem;
}

.history {
  // "Historial": área de toque de 44 px.
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 0.45rem;
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
    padding-left: 0.8rem;
    border-left: 2px solid var(--line-strong);
    font-size: 1rem;

    span {
      color: var(--ink-600);
      font-size: 1rem;
    }

    em {
      font-style: normal;
      color: var(--ink-600);
    }
  }
}

.state-error {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  max-width: 640px;

  > i {
    font-size: 1.5rem;
    color: var(--warning);
    margin-top: 0.25rem;
  }

  h2 {
    font-size: 1.25rem;
    margin-bottom: 0.3rem;
  }

  p {
    margin: 0 0 0.9rem;
    color: var(--ink-600);
  }
}

.state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.views {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line-strong);

  button {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 1rem;
    color: var(--ink-600);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: background 0.18s ease, color 0.18s ease;

    &.on {
      background: var(--navy-800);
      color: #fff;
    }
  }
}

.review {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.review-notice {
  margin: 0;
  display: flex;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--powder-100);
  color: var(--navy-900);
  font-weight: 500;

  i {
    margin-top: 0.25rem;
    color: var(--navy-700);
  }
}

.save--pending {
  color: var(--warning);
  font-weight: 600;
}

.sig.invalid {
  color: var(--danger);
  background: var(--danger-100);
}

.sig-who--invalid {
  color: var(--danger);
  font-weight: 600;
}

.sig-legend {
  margin: 0.8rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 1rem;
  color: var(--ink-600);
}

.sig-annulled {
  margin-top: 0.7rem;
  font-size: 1rem;

  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--danger);
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  ul {
    margin: 0.4rem 0 0;
    padding-left: 1rem;
  }

  small {
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.sig-note {
  margin-top: 0.7rem;
  font-size: 1rem;
}
</style>
