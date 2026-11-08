<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import axios from 'axios'
import { useUserStore } from '@/stores/user'
import { useCatalogStore } from '@/stores/catalog'
import { useSound } from '@/composables/useSound'
import { appendSaid, useDictation } from '@/composables/useDictation'
import { apiCreateRecord, apiCrewSignature, apiRecordAction, apiSaveRecord, apiSign } from '@/services/api'
import { apiErrorMessage, isNetworkError } from '@/services/httpBase'
import { detectIntent, novedadText, parseSupplyList, type Intent, type SupplyLine } from '@/utils/capture'
import { autoFillValues, type FillGuide } from '@/utils/fillGuide'
import { todayGalapagos } from '@/utils/ism'
import InlineSignaturePad from '@/components/sign/InlineSignaturePad.vue'
import BaseTimePicker from '@/components/ui/BaseTimePicker.vue'
import type { IsmForm } from '@/types'

/**
 * «¿Qué necesitas hacer?» (TREASURE ISM 2.0, 8-nov-2026): se escribe o dicta
 * lo que se necesita o lo que se vio, como se diría. El sistema elige el
 * registro, pone los datos conocidos, firma con la firma guardada (si el
 * formato lo pide) y lo envía a quien sigue. Un solo toque para confirmar.
 */
const emit = defineEmits<{ sent: [] }>()

const userStore = useUserStore()
const catalog = useCatalogStore()
const { play } = useSound()
const { canDictate, listening, dictate } = useDictation()
const GUIDES = import.meta.glob<FillGuide>('../../guides/*.json', { import: 'default' })

const NOVEDAD = { code: 'R-09', relato: 'Text Field 68' }
const AREA_LABEL: Record<string, string> = { Cubierta: 'Cubierta', Maquinas: 'Máquinas', Hoteleria: 'Hotelería' }

const pedidoCodes = computed(() =>
  catalog.forms.filter((f) => f.code.startsWith('R-18') && f.canCreate !== false).map((f) => f.code),
)
const canNovedad = computed(() => {
  const f = catalog.byCode.get(NOVEDAD.code)
  return Boolean(f) && f!.canCreate !== false
})
const modes = computed(() => [
  ...(pedidoCodes.value.length ? [{ key: 'pedido' as const, label: 'Pedir algo', icon: 'fa-box-open' }] : []),
  ...(canNovedad.value ? [{ key: 'novedad' as const, label: 'Reportar algo que vi', icon: 'fa-triangle-exclamation' }] : []),
])

// ---- Lo que escribe la persona (se guarda en la tableta hasta enviarse) ----
const DRAFT_KEY = 'treasure-captura'
interface Draft {
  mode: Intent | null
  text: string
  lines: SupplyLine[]
  pedidoCode: string
  place: string
  time: string
  /** Mismo intento = mismo registro aunque se reintente. */
  key: string
  recordId: string
}
function readDraft(): Partial<Draft> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>
  } catch {
    return {}
  }
}
const saved = readDraft()
const mode = shallowRef<Intent | null>(saved.mode ?? null)
const chosenByHand = shallowRef(Boolean(saved.mode))
const text = shallowRef(saved.text ?? '')
const lines = shallowRef<SupplyLine[]>(saved.lines ?? [])
const pedidoCode = shallowRef(saved.pedidoCode ?? '')
const place = shallowRef(saved.place ?? '')
const time = shallowRef(saved.time ?? '')
let key = saved.key ?? ''
let recordId = saved.recordId ?? ''

function persist() {
  try {
    if (!text.value.trim() && !recordId) localStorage.removeItem(DRAFT_KEY)
    else
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ mode: chosenByHand.value ? mode.value : null, text: text.value, lines: lines.value, pedidoCode: pedidoCode.value, place: place.value, time: time.value, key, recordId } satisfies Draft),
      )
  } catch {
    // Sin almacenamiento (modo privado): sigue funcionando sin guardar.
  }
}
watch([text, lines, pedidoCode, place, time, mode], persist)

// La lista se vuelve líneas en la misma pantalla; el modo sale de cómo se dice.
watch(text, (t) => {
  if (!chosenByHand.value) {
    const guess = detectIntent(t)
    if (guess && modes.value.some((m) => m.key === guess)) mode.value = guess
  }
  if (mode.value === 'pedido') lines.value = parseSupplyList(t)
})
watch(mode, (m) => {
  if (m === 'pedido') lines.value = parseSupplyList(text.value)
})
watch(
  modes,
  (list) => {
    if (list.length === 1) mode.value = list[0]!.key
    if (pedidoCodes.value.length === 1) pedidoCode.value = pedidoCodes.value[0]!
  },
  { immediate: true },
)

function pick(m: Intent) {
  mode.value = m
  chosenByHand.value = true
}

function setLine(i: number, patch: Partial<SupplyLine>) {
  lines.value = lines.value.map((l, j) => (j === i ? { ...l, ...patch } : l))
}
function removeLine(i: number) {
  lines.value = lines.value.filter((_, j) => j !== i)
}

function onDictate() {
  dictate('captura', (said) => (text.value = appendSaid(text.value, said)))
}

// ---- Formato que corresponde ----
const code = computed(() => (mode.value === 'novedad' ? NOVEDAD.code : mode.value === 'pedido' ? pedidoCode.value : ''))
const def = shallowRef<IsmForm | null>(null)
const guide = shallowRef<FillGuide | null>(null)
watch(
  code,
  async (c) => {
    def.value = null
    guide.value = null
    if (!c) return
    try {
      const [d, g] = await Promise.all([catalog.definition(c), GUIDES[`../../guides/${c}.json`]?.()])
      if (code.value !== c) return
      def.value = d
      guide.value = g ?? null
    } catch {
      // Sin señal: se reintenta al confirmar.
    }
  },
  { immediate: true },
)

const areaOf = (c: string) => AREA_LABEL[c.split('_')[1] ?? ''] ?? c
const table = computed(() => guide.value?.steps.flatMap((s) => s.items).find((i) => i.kind === 'table'))
const maxLines = computed(() => (table.value?.kind === 'table' ? table.value.rows.length : 15))
const orderField = computed(
  () => guide.value?.steps.flatMap((s) => s.items).find((i) => i.kind === 'text' && /número de orden/i.test(i.label)) as
    | { field: string }
    | undefined,
)
/** Firma de quien llena (R-18 Hotelería: la directora); los demás pasan sin firma al Capitán. */
const signField = computed(() =>
  def.value && def.value.stages.tripulacion > 0 ? def.value.fields.find((f) => f.type === 'signature' && f.stage === 'tripulacion') ?? null : null,
)
const nextRole = computed(() => {
  if (!def.value) return ''
  if (def.value.stages.capitan > 0) return 'el Capitán'
  return def.value.officeRole === 'admin' ? 'Administración' : 'la Persona Designada'
})

// ---- Firma guardada ----
const savedSignature = shallowRef('')
const redraw = shallowRef(false)
const hasInk = shallowRef(false)
const pad = useTemplateRef<InstanceType<typeof InlineSignaturePad>>('pad')
watch(
  signField,
  async (f) => {
    if (!f || savedSignature.value || !userStore.user?.id) return
    try {
      savedSignature.value = await apiCrewSignature(userStore.user.id)
    } catch {
      // Sin firma guardada o sin señal: se dibuja.
    }
  },
  { immediate: true },
)
const useSaved = computed(() => Boolean(savedSignature.value) && !redraw.value)

// ---- Qué falta (solo lo que de verdad falta) ----
const problem = computed(() => {
  if (!mode.value) return modes.value.length > 1 ? 'Elige si es un pedido o algo que viste.' : ''
  if (!text.value.trim()) return ''
  if (mode.value === 'pedido') {
    if (!pedidoCode.value) return '¿Para qué área es el pedido?'
    const items = lines.value.filter((l) => l.item.trim())
    if (!items.length) return 'Escribe qué necesitas.'
    const noQty = items.filter((l) => !l.qty.trim())
    if (noQty.length) return `¿Cuántos? Falta la cantidad de: ${noQty.map((l) => l.item).join(', ')}.`
    if (items.length > maxLines.value) return `Caben ${maxLines.value} líneas por pedido: haz otro pedido con el resto.`
  }
  if (signField.value && !useSaved.value && !hasInk.value) return 'Firma en el recuadro para enviarlo.'
  return ''
})
const ready = computed(() => Boolean(mode.value && text.value.trim() && def.value && !problem.value))
const actionLabel = computed(() => {
  const to = nextRole.value ? ` a ${nextRole.value}`.replace(' a el ', ' al ') : ''
  if (mode.value === 'novedad') return `Reportar${to}`
  return signField.value ? `Firmar y enviar${to}` : `Enviar pedido${to}`
})

// ---- Enviar: crear, llenar, firmar y enviar; un reintento retoma donde quedó ----
const busy = shallowRef(false)
const error = shallowRef('')
const offline = shallowRef(false)
const receipt = shallowRef<{ id: string; code: string; number: string; to: string } | null>(null)

function sheetData(): Record<string, string> {
  const g = guide.value!
  const known = autoFillValues(g, { me: userStore.user?.name ?? '', today: todayGalapagos(), vessel: catalog.vessel })
  if (mode.value === 'novedad') return { ...known, [NOVEDAD.relato]: novedadText(text.value, place.value, time.value) }
  const rows = table.value?.kind === 'table' ? table.value.rows : []
  const data: Record<string, string> = { ...known }
  lines.value
    .filter((l) => l.item.trim())
    .forEach((l, i) => {
      const [qtyField, itemField] = rows[i] ?? []
      if (qtyField && itemField) {
        data[qtyField] = l.qty.trim()
        data[itemField] = l.item.trim()
      }
    })
  return data
}

async function send() {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  offline.value = false
  const c = code.value
  try {
    if (!key) key = `cap${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    let number = ''
    if (!recordId) {
      const rec = await apiCreateRecord({ code: c, recordDate: todayGalapagos(), idempotencyKey: key })
      recordId = rec._id
      persist()
      number = orderField.value ? String(rec.data?.[orderField.value.field] ?? '') : ''
    }
    const res = await apiSaveRecord(recordId, { data: sheetData() })
    if (orderField.value) number = String(res.record.data?.[orderField.value.field] ?? number)
    if (signField.value) {
      const image = useSaved.value ? savedSignature.value : pad.value!.image()
      await apiSign(recordId, signField.value.name, image, userStore.user?.name ?? '')
    }
    try {
      await apiRecordAction(recordId, 'submit')
    } catch (err) {
      // Ya se había enviado y se perdió la respuesta: no es un error.
      if (!(axios.isAxiosError(err) && err.response?.status === 409)) throw err
    }
    play('success')
    receipt.value = { id: recordId, code: c, number, to: nextRole.value }
    reset()
    emit('sent')
  } catch (err) {
    play('error')
    if (isNetworkError(err)) {
      offline.value = true
      error.value = 'Sin señal: todavía no se envió. Queda guardado en esta tableta y se envía solo cuando vuelva la señal.'
    } else {
      error.value = apiErrorMessage(err)
    }
  } finally {
    busy.value = false
  }
}

function reset() {
  text.value = ''
  lines.value = []
  place.value = ''
  time.value = ''
  key = ''
  recordId = ''
  redraw.value = false
  hasInk.value = false
  if (modes.value.length > 1) {
    mode.value = null
    chosenByHand.value = false
  }
  persist()
}

// Vuelve la señal: se reintenta solo, sin botón de sincronizar.
const onOnline = () => {
  if (offline.value && ready.value) send()
}
onMounted(() => window.addEventListener('online', onOnline))
onBeforeUnmount(() => window.removeEventListener('online', onOnline))

const placeholder = computed(() =>
  mode.value === 'novedad'
    ? 'Ej.: Observé líquido en el pasillo. No sé de dónde viene. No vi personas lesionadas.'
    : mode.value === 'pedido'
      ? 'Ej.: Necesito 2 almohadas, 1 cobija y 3 escobas'
      : modes.value.length > 1
        ? 'Ej.: «Necesito 2 almohadas y 3 escobas» u «Observé líquido en el pasillo»'
        : '',
)
const knownLine = computed(() => {
  const who = userStore.user?.name ?? ''
  const parts = [who, mode.value === 'pedido' && pedidoCode.value ? areaOf(pedidoCode.value) : '', catalog.vessel, 'hoy'].filter(Boolean)
  return parts.join(' · ')
})
</script>

<template>
  <section v-if="modes.length" class="qc card" aria-labelledby="h-qc">
    <div class="qc-head">
      <h2 id="h-qc">¿Qué necesitas hacer?</h2>
      <p>Escríbelo o díctalo como lo dirías. El sistema llena el formato oficial y avisa a quien sigue.</p>
    </div>

    <div v-if="receipt" class="qc-receipt" role="status">
      <i class="fa-solid fa-circle-check" aria-hidden="true" />
      <div>
        <strong>
          Enviado · {{ receipt.code === NOVEDAD.code ? receipt.code : `R-18 · ${areaOf(receipt.code)}` }}<template v-if="receipt.number"> · N.º {{ receipt.number }}</template>
        </strong>
        <span>{{ receipt.to ? `${receipt.to.charAt(0).toUpperCase()}${receipt.to.slice(1)} ya lo tiene en sus pendientes.` : 'Ya está en camino.' }}</span>
      </div>
      <RouterLink :to="`/registro/${receipt.id}`" class="btn btn-ghost">Ver</RouterLink>
      <button type="button" class="btn btn-ghost" @click="receipt = null">Hacer otro</button>
    </div>

    <template v-else>
      <div v-if="modes.length > 1" class="qc-modes" role="radiogroup" aria-label="Qué vas a hacer">
        <button
          v-for="m in modes"
          :key="m.key"
          type="button"
          role="radio"
          :aria-checked="mode === m.key"
          class="qc-chip"
          :class="{ on: mode === m.key }"
          @click="pick(m.key)"
        >
          <i class="fa-solid" :class="m.icon" aria-hidden="true" /> {{ m.label }}
        </button>
      </div>

      <p v-if="mode === 'novedad'" class="qc-alert">
        <i class="fa-solid fa-bullhorn" aria-hidden="true" />
        Si hay peligro inmediato, primero atiende y avisa por radio según el procedimiento. Este reporte no reemplaza la alarma.
      </p>

      <div class="qc-input">
        <textarea
          v-model="text"
          class="qc-text"
          rows="3"
          :placeholder="placeholder"
          :aria-label="mode === 'novedad' ? '¿Qué observaste?' : mode === 'pedido' ? '¿Qué necesitas?' : '¿Qué necesitas hacer?'"
        />
        <button
          v-if="canDictate"
          type="button"
          class="btn btn-ghost qc-mic"
          :class="{ on: listening === 'captura' }"
          @click="onDictate"
        >
          <i class="fa-solid" :class="listening === 'captura' ? 'fa-stop' : 'fa-microphone'" aria-hidden="true" />
          {{ listening === 'captura' ? 'Escuchando… toca para terminar' : 'Dictar' }}
        </button>
      </div>

      <!-- Pedido: la lista se vuelve líneas aquí mismo -->
      <template v-if="mode === 'pedido' && text.trim()">
        <div v-if="pedidoCodes.length > 1" class="qc-ask">
          <span>¿Para qué área es?</span>
          <div class="qc-modes">
            <button
              v-for="c in pedidoCodes"
              :key="c"
              type="button"
              class="qc-chip"
              :class="{ on: pedidoCode === c }"
              @click="pedidoCode = c"
            >
              {{ areaOf(c) }}
            </button>
          </div>
        </div>

        <table v-if="lines.length" class="qc-lines">
          <thead>
            <tr>
              <th scope="col">Cantidad</th>
              <th scope="col">Artículo</th>
              <th scope="col"><span class="sr-only">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in lines" :key="i" :class="{ missing: !l.qty.trim() }">
              <td>
                <input
                  :value="l.qty"
                  inputmode="decimal"
                  :placeholder="'¿Cuántos?'"
                  :aria-label="`Cantidad de ${l.item}`"
                  @input="setLine(i, { qty: ($event.target as HTMLInputElement).value })"
                />
              </td>
              <td>
                <input :value="l.item" :aria-label="`Artículo ${i + 1}`" @input="setLine(i, { item: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <button type="button" class="qc-x" :aria-label="`Quitar ${l.item}`" @click="removeLine(i)">
                  <i class="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Novedad: lugar y hora solo si se saben -->
      <div v-if="mode === 'novedad' && text.trim()" class="qc-row">
        <label class="field">
          <span>Lugar <small>(si lo sabes)</small></span>
          <input v-model="place" placeholder="Ej.: pasillo de cabinas" />
        </label>
        <label class="field">
          <span>Hora del hecho <small>(si la sabes)</small></span>
          <BaseTimePicker v-model="time" placeholder="No sé" />
        </label>
      </div>

      <template v-if="mode && text.trim()">
        <p class="qc-known">
          <i class="fa-solid fa-user-check" aria-hidden="true" />
          <span>
            {{ knownLine }} · <em>lo pone el sistema</em><template v-if="mode === 'pedido'">, también el número de orden</template><template v-if="mode === 'novedad'">. El Capitán clasifica e investiga después; tú solo cuentas lo que viste</template>.
          </span>
        </p>

        <div v-if="signField" class="qc-sign">
          <span class="qc-sign-label">Tu firma</span>
          <div v-if="useSaved" class="qc-saved">
            <img :src="savedSignature" alt="Tu firma guardada" />
            <button type="button" class="btn btn-ghost" @click="redraw = true">
              <i class="fa-solid fa-pen" aria-hidden="true" /> Volver a dibujar
            </button>
          </div>
          <InlineSignaturePad v-else ref="pad" placeholder="Firma aquí con el dedo" @change="hasInk = $event" />
        </div>

        <p v-if="problem" class="qc-problem">{{ problem }}</p>
        <p v-if="error" class="qc-error" role="alert">
          <i class="fa-solid" :class="offline ? 'fa-cloud-arrow-up' : 'fa-circle-exclamation'" aria-hidden="true" />
          {{ error }}
        </p>

        <div class="qc-actions">
          <button type="button" class="btn btn-primary qc-send" :disabled="!ready || busy" @click="send">
            <i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'" aria-hidden="true" />
            {{ busy ? 'Enviando…' : actionLabel }}
          </button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped lang="scss">
.qc {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.qc-head {
  h2 {
    margin: 0 0 0.2rem;
  }

  p {
    margin: 0;
    color: var(--ink-600);
  }
}

.qc-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.qc-chip {
  min-height: 44px;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-900);
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.qc-alert {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--gold-100);
  color: var(--ink-900);
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}

.qc-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.qc-text {
  width: 100%;
  min-height: 96px;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-900);
  font: inherit;
  font-size: 1.08rem;
  resize: vertical;
}

.qc-mic {
  align-self: flex-start;

  &.on {
    background: var(--danger-100);
    border-color: var(--danger);
    color: var(--danger);
  }
}

.qc-ask {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-weight: 600;
}

.qc-lines {
  width: 100%;
  border-collapse: collapse;

  th {
    text-align: left;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-600);
    padding: 0 0.4rem 0.3rem;
  }

  th:first-child,
  td:first-child {
    width: 7.5rem;
  }

  th:last-child,
  td:last-child {
    width: 48px;
  }

  td {
    padding: 0.2rem 0.3rem;
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink-900);
    font: inherit;
  }

  tr.missing td:first-child input {
    border-color: var(--danger);
    background: var(--danger-100);
  }
}

.qc-x {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--ink-600);

  &:hover {
    background: var(--hover);
  }
}

.qc-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.8rem;

  input {
    min-height: 44px;
  }
}

.qc-known {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  color: var(--ink-600);
  font-size: 0.95rem;

  em {
    font-style: normal;
    color: var(--success);
    font-weight: 600;
  }
}

.qc-sign {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.qc-sign-label {
  font-weight: 600;
}

.qc-saved {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;

  img {
    height: 72px;
    max-width: 240px;
    object-fit: contain;
    border-bottom: 1px solid var(--line-strong);
    background: #fff;
    border-radius: var(--radius-sm);
  }
}

.qc-problem {
  margin: 0;
  color: var(--ink-900);
  font-weight: 600;
}

.qc-error {
  margin: 0;
  color: var(--danger);
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.qc-actions {
  display: flex;
  justify-content: flex-end;
}

.qc-send {
  min-height: 52px;
  font-size: 1.05rem;
}

.qc-receipt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--success-100);

  > i {
    color: var(--success);
    font-size: 1.5rem;
  }

  div {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .qc-actions .qc-send {
    width: 100%;
  }
}
</style>
