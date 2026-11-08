<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, useTemplateRef } from 'vue'
import BaseDatePicker from '@/components/ui/BaseDatePicker.vue'
import BaseTimePicker from '@/components/ui/BaseTimePicker.vue'
import { useDictation, appendSaid } from '@/composables/useDictation'
import { LATER_STEP, systemFields, fromSheetDate, hasValue, itemDone, splitPhrases, toSheetDate, togglePhrase, type FillGuide, type GuideFill, type GuideItem } from '@/utils/fillGuide'
import type { IsmField, IsmForm, IsmSignature } from '@/types'

/**
 * Llenar un formato ISM paso a paso, como una app (7-nov-2026). Cada
 * respuesta se escribe en su campo del PDF: la hoja oficial queda igual.
 */
const props = defineProps<{
  guide: FillGuide
  form: IsmForm
  values: Record<string, string | boolean>
  signatures: IsmSignature[]
  editable: boolean
  canSign: (field: IsmField) => boolean
  images: Map<string, string>
  userName: string
  /**
   * Quien crea el registro, en borrador (ISM 2.0): lo que pone el sistema no se
   * pregunta (se resume arriba) y los pasos de otras personas no se muestran.
   */
  compact?: boolean
  /** Botón para enviar al final de «Revisar» ('' = no se envía desde aquí). */
  submitLabel?: string
}>()

const emit = defineEmits<{
  change: [name: string, value: string | boolean]
  sign: [field: IsmField]
  photo: [field: IsmField]
  sheet: []
  submit: []
}>()

const top = useTemplateRef<HTMLElement>('top')
const step = shallowRef(0)
/** «Corregir»: muestra también lo que puso el sistema. */
const showAll = shallowRef(false)
const sysFields = computed(() => systemFields(props.guide))
const isKnown = (item: GuideItem) =>
  item.kind === 'text' && sysFields.value.has(item.field) && hasValue(props.values[item.field])
/** Firma de otra etapa (Capitán, Persona Designada): se firma en su sistema, no aquí. */
const isOthersSignature = (item: GuideItem) => {
  if (item.kind !== 'signature') return false
  const f = fields.value.get(item.field)
  return !f || (!props.canSign(f) && !signed.value.has(item.field))
}
/** Datos que puso el sistema, para el resumen de arriba. */
const knownItems = computed(() =>
  props.compact
    ? props.guide.steps.flatMap((st) => st.items).filter(isKnown).map((i) => ({ label: (i as { label: string }).label, value: text((i as { field: string }).field) }))
    : [],
)
const steps = computed(() => {
  if (!props.compact || showAll.value) return props.guide.steps
  const mine = props.guide.steps.filter((st) => !(st.hint && LATER_STEP.test(st.hint)))
  return (mine.length ? mine : props.guide.steps)
    .map((st) => ({ ...st, items: st.items.filter((i) => !isKnown(i) && !isOthersSignature(i)) }))
    .filter((st) => st.items.length)
})
const lastStep = computed(() => steps.value.length)
const fields = computed(() => new Map(props.form.fields.map((f) => [f.name, f])))
const signed = computed(() => new Set(props.signatures.filter((s) => s.valid !== false).map((s) => s.field)))
const signatureOf = (name: string) => props.signatures.find((s) => s.field === name)

const counted = (items: GuideItem[]) => items.filter((i) => i.kind !== 'info')
const progress = computed(() =>
  steps.value.map((s) => {
    const items = counted(s.items)
    return { done: items.filter((i) => itemDone(i, props.values, signed.value)).length, total: items.length }
  }),
)
const totals = computed(() => progress.value.reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 }))

function stateOf(i: number) {
  const p = progress.value[i]
  if (!p || !p.total || p.done === p.total) return p?.total ? 'done' : 'todo'
  return p.done ? 'partial' : 'todo'
}

async function go(i: number) {
  step.value = Math.max(0, Math.min(lastStep.value, i))
  await nextTick()
  top.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ---- Valores ----
function text(name: string): string {
  const v = props.values[name]
  return typeof v === 'string' ? v : ''
}
const on = (name: string) => props.values[name] === true

function set(name: string, value: string | boolean) {
  if (props.editable && props.values[name] !== value) emit('change', name, value)
}

function dateModel(name: string) {
  return { get: () => fromSheetDate(text(name)), set: (key: string) => set(name, key ? toSheetDate(key) : '') }
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}

function fillValue(fill: GuideFill): string {
  if (fill === 'me') return props.userName
  if (fill === 'vessel') return 'Y/P Treasure of Galápagos I'
  if (fill === 'now') return new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Guayaquil' })
  return toSheetDate(todayKey())
}

function fillLabel(fill: GuideFill): string {
  return { me: `Soy yo · ${props.userName}`, today: 'Hoy', now: 'Ahora', vessel: 'Treasure of Galápagos I' }[fill]
}

/** Frases de un toque: las de la guía y "Sin novedad" en observaciones. */
function quickOf(item: Extract<GuideItem, { kind: 'text' }>): string[] {
  const list = [...(item.quick ?? [])]
  if (item.input === 'textarea' && /observ|novedad|coment/i.test(item.label) && !list.includes('Sin novedad')) list.unshift('Sin novedad')
  return list
}
const phraseOn = (name: string, phrase: string) => splitPhrases(text(name)).includes(phrase)

// ---- Dictado por voz ----
const { canDictate, listening, dictate: listen } = useDictation()
const dictate = (name: string) => listen(name, (said) => set(name, appendSaid(text(name), said)))

const suggestionOf = (s: string | { value: string; label: string }) => (typeof s === 'string' ? { value: s, label: s } : s)

/** Una sola casilla marcada: tocar la marcada la desmarca. */
function choose(options: Array<{ field: string }>, field: string) {
  const turnOn = !on(field)
  for (const o of options) set(o.field, o.field === field ? turnOn : false)
}

function yesno(item: { si: string; no: string }, value: 'si' | 'no') {
  const target = value === 'si' ? item.si : item.no
  const turnOn = !on(target)
  set(item.si, value === 'si' && turnOn)
  set(item.no, value === 'no' && turnOn)
}

// ---- Tablas sin filas fijas: se muestran las llenas y una más ----
const extraRows = reactive<Record<string, number>>({})
function tableKey(item: Extract<GuideItem, { kind: 'table' }>) {
  return item.rows[0]?.find(Boolean) ?? item.label
}
function visibleRows(item: Extract<GuideItem, { kind: 'table' }>) {
  if (item.rowLabels) return item.rows.map((cells, i) => ({ cells, i }))
  let used = 0
  item.rows.forEach((cells, i) => {
    if (cells.some((c) => c && (hasValue(props.values[c]) || signed.value.has(c)))) used = i + 1
  })
  const count = Math.min(item.rows.length, Math.max(1, used + (extraRows[tableKey(item)] ?? 0)))
  return item.rows.slice(0, count).map((cells, i) => ({ cells, i }))
}
function addRow(item: Extract<GuideItem, { kind: 'table' }>) {
  const k = tableKey(item)
  extraRows[k] = (extraRows[k] ?? 0) + 1
}

// ---- Cuadrículas largas: una fila a la vez ----
type GridItem = Extract<GuideItem, { kind: 'grid' }>
const gridSel = reactive<Record<string, number>>({})
const gridKey = (item: GridItem) => item.rows[0]?.cells.find(Boolean) ?? item.label
const rowTicked = (cells: Array<string | null>) => cells.some((c) => c && on(c))
function gridRow(item: GridItem) {
  const picked = gridSel[gridKey(item)]
  if (picked !== undefined) return picked
  // Empieza en la primera fila sin marcar.
  const next = item.rows.findIndex((r) => !rowTicked(r.cells))
  return next === -1 ? 0 : next
}
function gridRows(item: GridItem) {
  const rows = item.rows.map((r, ri) => ({ r, ri }))
  return item.rows.length > 6 ? rows.filter((x) => x.ri === gridRow(item)) : rows
}
/** Al marcar, la fila queda elegida (si no, saltaría a la siguiente sin marcar). */
function tick(item: GridItem, ri: number, cell: string) {
  gridSel[gridKey(item)] = ri
  set(cell, !on(cell))
}
function copyRow(item: GridItem, ri: number) {
  gridSel[gridKey(item)] = ri
  const prev = item.rows[ri - 1]!.cells
  item.rows[ri]!.cells.forEach((cell, ci) => {
    const from = prev[ci]
    if (cell) set(cell, Boolean(from && on(from)))
  })
}

defineExpose({ go })

function photoUrl(name: string) {
  return text(name)
}
</script>

<template>
  <div class="gf">
    <div ref="top" class="gf-top">
      <div class="gf-progress" role="progressbar" :aria-valuenow="totals.done" :aria-valuemax="totals.total">
        <span :style="{ width: `${(totals.done / Math.max(1, totals.total)) * 100}%` }" />
      </div>
      <p class="gf-count">{{ totals.done }} de {{ totals.total }} respondidos</p>
      <nav class="gf-steps" aria-label="Pasos">
        <button
          v-for="(s, i) in steps"
          :key="s.title"
          type="button"
          class="gf-step"
          :class="[`st-${stateOf(i)}`, { active: i === step }]"
          :aria-current="i === step ? 'step' : undefined"
          @click="go(i)"
        >
          <span class="gf-dot">
            <i v-if="stateOf(i) === 'done'" class="fa-solid fa-check" aria-hidden="true" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          {{ s.title }}
        </button>
        <button type="button" class="gf-step" :class="{ active: step === lastStep }" @click="go(lastStep)">
          <span class="gf-dot"><i class="fa-solid fa-file-lines" aria-hidden="true" /></span>
          Revisar
        </button>
      </nav>
    </div>

    <Transition name="fade" mode="out-in">
      <section v-if="step < lastStep" :key="step" class="gf-body">
        <header>
          <p v-if="step === 0 && guide.intro" class="gf-intro">{{ guide.intro }}</p>
          <div v-if="step === 0 && knownItems.length && !showAll" class="gf-known">
            <p class="gf-known-title"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Esto ya lo puso el sistema</p>
            <dl>
              <div v-for="k in knownItems" :key="k.label">
                <dt>{{ k.label }}</dt>
                <dd>{{ k.value }}</dd>
              </div>
            </dl>
            <button v-if="editable" type="button" class="gf-known-edit" @click="showAll = true">Corregir algo de esto</button>
          </div>
          <h2 class="gf-title">{{ steps[step]!.title }}</h2>
          <p v-if="steps[step]!.hint" class="gf-hint">{{ steps[step]!.hint }}</p>
        </header>

        <div v-for="(item, ii) in steps[step]!.items" :key="ii" class="gf-item card field" :class="{ 'gf-item--info': item.kind === 'info' }">
          <p v-if="item.kind === 'info'" class="gf-info"><i class="fa-solid fa-circle-info" aria-hidden="true" /> {{ item.text }}</p>

          <template v-else>
            <div class="gf-q">
              <span class="gf-label">{{ item.label }}</span>
              <i v-if="itemDone(item, values, signed)" class="fa-solid fa-circle-check gf-ok" aria-label="Respondido" />
            </div>
            <p v-if="item.hint" class="gf-qhint">{{ item.hint }}</p>

            <!-- Texto, fecha, hora, número -->
            <template v-if="item.kind === 'text'">
              <div v-if="editable && (item.fill || item.suggestions?.length)" class="gf-chips">
                <button v-if="item.fill && !text(item.field)" type="button" class="gf-chip gf-chip--fill" @click="set(item.field, fillValue(item.fill))">
                  <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> {{ fillLabel(item.fill) }}
                </button>
                <button
                  v-for="s in (item.suggestions ?? []).map(suggestionOf)"
                  :key="s.value"
                  type="button"
                  class="gf-chip"
                  :class="{ on: text(item.field) === s.value }"
                  @click="set(item.field, text(item.field) === s.value ? '' : s.value)"
                >
                  {{ s.label }}
                </button>
              </div>
              <div v-if="editable && quickOf(item).length" class="gf-chips">
                <button
                  v-for="q in quickOf(item)"
                  :key="q"
                  type="button"
                  class="gf-chip"
                  :class="{ on: phraseOn(item.field, q) }"
                  :aria-pressed="phraseOn(item.field, q)"
                  @click="set(item.field, togglePhrase(text(item.field), q))"
                >
                  <i class="fa-solid" :class="phraseOn(item.field, q) ? 'fa-check' : 'fa-plus'" aria-hidden="true" /> {{ q }}
                </button>
              </div>
              <template v-if="!(item.suggestions?.length && typeof item.suggestions[0] !== 'string')">
                <BaseDatePicker
                  v-if="item.input === 'date' && editable"
                  :model-value="dateModel(item.field).get()"
                  @update:model-value="dateModel(item.field).set($event)"
                />
                <BaseTimePicker v-else-if="item.input === 'time' && editable" :model-value="text(item.field)" @update:model-value="set(item.field, $event)" />
                <div v-else-if="item.input === 'textarea'" class="gf-long">
                <textarea
                  rows="3"
                  :value="text(item.field)"
                  :readonly="!editable"
                  :placeholder="fields.get(item.field)?.reference ? `Ref.: ${fields.get(item.field)!.reference}` : ''"
                  @input="set(item.field, ($event.target as HTMLTextAreaElement).value)"
                />
                <button
                  v-if="editable && canDictate"
                  type="button"
                  class="btn btn-ghost gf-mic"
                  :class="{ on: listening === item.field }"
                  @click="dictate(item.field)"
                >
                  <i class="fa-solid" :class="listening === item.field ? 'fa-stop' : 'fa-microphone'" aria-hidden="true" />
                  {{ listening === item.field ? 'Escuchando… toca para terminar' : 'Dictar' }}
                </button>
                </div>
                <input
                  v-else
                  :type="'text'"
                  :inputmode="item.input === 'number' ? 'decimal' : undefined"
                  :value="text(item.field)"
                  :readonly="!editable"
                  :maxlength="fields.get(item.field)?.maxLength"
                  :placeholder="fields.get(item.field)?.reference ? `Ref.: ${fields.get(item.field)!.reference}` : ''"
                  @input="set(item.field, ($event.target as HTMLInputElement).value)"
                />
              </template>
            </template>

            <!-- Una opción / varias opciones -->
            <div v-else-if="item.kind === 'choice' || item.kind === 'checks'" class="gf-options">
              <button
                v-for="o in item.options"
                :key="o.field"
                type="button"
                class="gf-opt"
                :class="{ on: on(o.field) }"
                :aria-pressed="on(o.field)"
                :disabled="!editable"
                @click="item.kind === 'choice' ? choose(item.options, o.field) : set(o.field, !on(o.field))"
              >
                <i :class="on(o.field) ? (item.kind === 'choice' ? 'fa-solid fa-circle-dot' : 'fa-solid fa-square-check') : item.kind === 'choice' ? 'fa-regular fa-circle' : 'fa-regular fa-square'" aria-hidden="true" />
                {{ o.label }}
              </button>
            </div>

            <!-- Sí / No -->
            <div v-else-if="item.kind === 'yesno'" class="gf-yesno">
              <button type="button" class="gf-opt gf-opt--si" :class="{ on: on(item.si) }" :aria-pressed="on(item.si)" :disabled="!editable" @click="yesno(item, 'si')">
                <i class="fa-solid fa-check" aria-hidden="true" /> Sí
              </button>
              <button type="button" class="gf-opt gf-opt--no" :class="{ on: on(item.no) }" :aria-pressed="on(item.no)" :disabled="!editable" @click="yesno(item, 'no')">
                <i class="fa-solid fa-xmark" aria-hidden="true" /> No
              </button>
            </div>

            <!-- Tabla -->
            <div v-else-if="item.kind === 'table'" class="gf-rows">
              <div v-for="row in visibleRows(item)" :key="row.i" class="gf-row">
                <p class="gf-row-title">{{ item.rowLabels?.[row.i] ?? `${row.i + 1}.` }}</p>
                <div class="gf-cells">
                  <template v-for="(cell, ci) in row.cells" :key="ci">
                    <div v-if="cell && fields.get(cell)" class="gf-cell field" :class="`gf-cell--${fields.get(cell)!.type}`">
                      <template v-if="fields.get(cell)!.type === 'checkbox'">
                        <button type="button" class="gf-opt gf-opt--sm" :class="{ on: on(cell) }" :aria-pressed="on(cell)" :disabled="!editable" @click="set(cell, !on(cell))">
                          <i :class="on(cell) ? 'fa-solid fa-square-check' : 'fa-regular fa-square'" aria-hidden="true" /> {{ item.columns[ci]!.label }}
                        </button>
                      </template>
                      <template v-else-if="fields.get(cell)!.type === 'signature'">
                        <span class="gf-cell-label">{{ item.columns[ci]!.label }}</span>
                        <button type="button" class="gf-sign gf-sign--sm" :class="{ signed: signed.has(cell) }" :disabled="!canSign(fields.get(cell)!) && !signed.has(cell)" @click="emit('sign', fields.get(cell)!)">
                          <img v-if="images.get(cell)" :src="images.get(cell)" :alt="`Firma de ${signatureOf(cell)?.signerName}`" />
                          <template v-else-if="signed.has(cell)">{{ signatureOf(cell)?.signerName }}</template>
                          <template v-else-if="canSign(fields.get(cell)!)"><i class="fa-solid fa-signature" aria-hidden="true" /> Firmar</template>
                          <template v-else>Firma pendiente</template>
                        </button>
                      </template>
                      <label v-else>
                        <span class="gf-cell-label">{{ item.columns[ci]!.label }}</span>
                        <BaseDatePicker
                          v-if="item.columns[ci]!.input === 'date' && editable"
                          :model-value="dateModel(cell).get()"
                          @update:model-value="dateModel(cell).set($event)"
                        />
                        <BaseTimePicker v-else-if="item.columns[ci]!.input === 'time' && editable" :model-value="text(cell)" @update:model-value="set(cell, $event)" />
                        <input
                          v-else
                          type="text"
                          :inputmode="item.columns[ci]!.input === 'number' ? 'decimal' : undefined"
                          :value="text(cell)"
                          :readonly="!editable"
                          :placeholder="fields.get(cell)!.reference ? `Ref.: ${fields.get(cell)!.reference}` : ''"
                          @input="set(cell, ($event.target as HTMLInputElement).value)"
                        />
                      </label>
                    </div>
                  </template>
                </div>
              </div>
              <button
                v-if="editable && !item.rowLabels && visibleRows(item).length < item.rows.length"
                type="button"
                class="btn btn-ghost gf-add"
                @click="addRow(item)"
              >
                <i class="fa-solid fa-plus" aria-hidden="true" /> Agregar otra
              </button>
            </div>

            <!-- Cuadrícula de casillas: con muchas filas (días) se llena una a la vez -->
            <div v-else-if="item.kind === 'grid'" class="gf-grid">
              <div v-if="item.rows.length > 6" class="gf-chips gf-grid-pick" role="tablist">
                <button
                  v-for="(r, ri) in item.rows"
                  :key="ri"
                  type="button"
                  role="tab"
                  class="gf-chip"
                  :class="{ on: gridRow(item) === ri, 'gf-chip--done': rowTicked(r.cells) }"
                  :aria-selected="gridRow(item) === ri"
                  @click="gridSel[gridKey(item)] = ri"
                >
                  {{ r.label }}
                </button>
              </div>
              <div v-for="{ r, ri } in gridRows(item)" :key="ri" class="gf-grid-row">
                <div class="gf-grid-head">
                  <p class="gf-row-title">{{ r.label }} · {{ r.cells.filter((c) => c && on(c)).length }} marcadas</p>
                  <button v-if="editable && item.rows.length > 6 && ri > 0" type="button" class="btn btn-ghost" @click="copyRow(item, ri)">
                    <i class="fa-regular fa-copy" aria-hidden="true" /> Igual que {{ item.rows[ri - 1]!.label }}
                  </button>
                </div>
                <div class="gf-grid-cells">
                  <template v-for="(cell, ci) in r.cells" :key="ci">
                    <button
                      v-if="cell"
                      type="button"
                      class="gf-tick"
                      :class="{ on: on(cell) }"
                      :aria-pressed="on(cell)"
                      :aria-label="`${r.label} · ${item.columns[ci]}`"
                      :disabled="!editable"
                      @click="tick(item, ri, cell)"
                    >
                      {{ item.columns[ci] }}
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <!-- Firma -->
            <button
              v-else-if="item.kind === 'signature' && fields.get(item.field)"
              type="button"
              class="gf-sign"
              :class="{ signed: signed.has(item.field) }"
              :disabled="!canSign(fields.get(item.field)!) && !signed.has(item.field)"
              @click="emit('sign', fields.get(item.field)!)"
            >
              <img v-if="images.get(item.field)" :src="images.get(item.field)" :alt="`Firma de ${signatureOf(item.field)?.signerName}`" />
              <template v-if="signed.has(item.field)">
                <span>{{ signatureOf(item.field)?.signerName }}</span>
              </template>
              <template v-else-if="canSign(fields.get(item.field)!)"><i class="fa-solid fa-signature" aria-hidden="true" /> Firmar aquí</template>
              <template v-else><i class="fa-regular fa-clock" aria-hidden="true" /> La firma va en su etapa</template>
            </button>

            <!-- Foto -->
            <button
              v-else-if="item.kind === 'photo' && fields.get(item.field)"
              type="button"
              class="gf-photo"
              :disabled="!editable"
              @click="emit('photo', fields.get(item.field)!)"
            >
              <img v-if="photoUrl(item.field)" :src="photoUrl(item.field)" alt="Foto de soporte" />
              <template v-else><i class="fa-solid fa-camera" aria-hidden="true" /> Agregar foto</template>
            </button>
          </template>
        </div>

        <div class="gf-nav">
          <button v-if="step > 0" type="button" class="btn btn-ghost btn-lg" @click="go(step - 1)">
            <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Anterior
          </button>
          <button type="button" class="btn btn-primary btn-lg" @click="go(step + 1)">
            {{ step + 1 < lastStep ? 'Siguiente' : submitLabel ? 'Revisar y enviar' : 'Revisar' }} <i class="fa-solid fa-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section v-else key="review" class="gf-body">
        <header>
          <h2 class="gf-title">Revisar</h2>
          <p class="gf-hint">Todo lo que respondiste ya está en la hoja oficial.{{ submitLabel ? ' Si está bien, envíalo.' : ' Revísala antes de enviar.' }}</p>
        </header>
        <ul class="gf-review card">
          <li v-for="(s, i) in steps" :key="s.title">
            <button type="button" @click="go(i)">
              <span class="gf-dot" :class="`st-${stateOf(i)}`">
                <i v-if="stateOf(i) === 'done'" class="fa-solid fa-check" aria-hidden="true" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="gf-review-title">{{ s.title }}</span>
              <span class="gf-review-count">{{ progress[i]!.done }} de {{ progress[i]!.total }}</span>
              <i class="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="gf-nav">
          <button type="button" class="btn btn-ghost btn-lg" @click="go(lastStep - 1)">
            <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Anterior
          </button>
          <button type="button" class="btn btn-lg" :class="submitLabel ? 'btn-ghost' : 'btn-primary'" @click="emit('sheet')">
            <i class="fa-regular fa-file-lines" aria-hidden="true" /> Ver la hoja oficial
          </button>
          <button v-if="submitLabel" type="button" class="btn btn-primary btn-lg" @click="emit('submit')">
            <i class="fa-solid fa-paper-plane" aria-hidden="true" /> {{ submitLabel }}
          </button>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.gf {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.gf-top {
  position: sticky;
  top: calc(64px + env(safe-area-inset-top));
  z-index: 10;
  background: var(--bg);
  padding: 0.75rem 0 0.6rem;
  margin-top: -0.75rem;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: calc(64px + env(safe-area-inset-top));
}

.gf-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--powder-200);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--navy-700);
    border-radius: inherit;
    transition: width 0.4s var(--ease);
  }
}

.gf-count {
  margin: 0.4rem 0 0.6rem;
  font-size: 1rem;
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.gf-steps {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.gf-step {
  flex-shrink: 0;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.9rem 0 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-900);

  &.active {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }
}

.gf-dot {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--powder-100);
  color: var(--navy-700);
  font-size: 0.9rem;
  font-weight: 700;

  .st-done &,
  &.st-done {
    background: var(--success);
    color: #fff;
  }

  .st-partial &,
  &.st-partial {
    background: var(--gold-100);
    color: #7a5634;
  }

  .active:not(.st-done) & {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
}

.gf-body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.gf-known {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--success-100);

  dl {
    margin: 0.4rem 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.4rem 1rem;
  }

  dt {
    font-size: 0.82rem;
    color: var(--ink-600);
  }

  dd {
    margin: 0;
    font-weight: 600;
    color: var(--ink-900);
  }
}

.gf-known-title {
  margin: 0;
  font-weight: 600;
  color: var(--success);
}

.gf-known-edit {
  margin-top: 0.6rem;
  min-height: 44px;
  padding: 0 0.2rem;
  border: 0;
  background: transparent;
  color: var(--navy-700);
  text-decoration: underline;
  font: inherit;
  cursor: pointer;
}

.gf-intro {
  margin: 0 0 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--powder-100);
  font-size: 1.05rem;
}

.gf-title {
  font-size: 1.6rem;

  @include tablet {
    font-size: 1.85rem;
  }
}

.gf-hint {
  margin: 0.35rem 0 0;
  font-size: 1.05rem;
  color: var(--ink-600);
}

.gf-item {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;

  &--info {
    background: var(--powder-100);
    border-color: transparent;
  }
}

.gf-info {
  margin: 0;
  font-size: 1.02rem;

  i {
    color: var(--navy-700);
    margin-right: 0.3rem;
  }
}

.gf-q {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.gf-label {
  font-size: 1.12rem;
  font-weight: 600;
  line-height: 1.35;
}

.gf-ok {
  color: var(--success);
  font-size: 1.2rem;
  margin-top: 0.15rem;
}

.gf-qhint {
  margin: -0.3rem 0 0;
  color: var(--ink-600);
}

textarea {
  min-height: 96px;
  resize: vertical;
}

.gf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.gf-chip {
  min-height: 44px;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: 0.98rem;
  color: var(--ink-900);
  text-align: left;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;
  }

  &--fill {
    border-style: dashed;
    color: var(--navy-700);
    font-weight: 600;
  }
}

.gf-long {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.gf-mic {
  align-self: flex-start;

  &.on {
    background: var(--danger-100);
    border-color: var(--danger);
    color: var(--danger);
  }
}

.gf-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
}

.gf-yesno {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  max-width: 420px;
}

.gf-opt {
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: 1.02rem;
  font-weight: 600;
  color: var(--ink-900);
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease;

  i {
    color: var(--ink-400);
  }

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
    color: #fff;

    i {
      color: #fff;
    }
  }

  &--si.on {
    background: var(--success);
    border-color: var(--success);
  }

  &--no.on {
    background: var(--danger);
    border-color: var(--danger);
  }

  &--sm {
    min-height: 44px;
    font-size: 0.95rem;
    font-weight: 500;
  }

  &:disabled {
    cursor: default;
  }
}

.gf-rows {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.gf-row {
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--cream-100);
}

.gf-row-title {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--navy-800);
}

.gf-cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.6rem;
  align-items: end;

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
}

.gf-cell-label {
  font-weight: 500;
  font-size: 0.92rem;
  color: var(--ink-600);
}

.gf-add {
  align-self: flex-start;
}

.gf-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.gf-grid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.gf-grid-pick .gf-chip {
  min-width: 52px;
  justify-content: center;
}

.gf-chip--done:not(.on) {
  background: var(--success-100);
  border-color: var(--success);
}

.gf-grid-cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 0.3rem;
}

.gf-tick {
  min-height: 44px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-600);

  &.on {
    background: var(--navy-700);
    border-color: var(--navy-700);
    color: #fff;
  }
}

.gf-sign,
.gf-photo {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--line-strong);
  background: var(--surface);
  font-size: 1.02rem;
  font-weight: 600;
  color: var(--navy-700);

  img {
    max-height: 64px;
    max-width: 60%;
    object-fit: contain;
  }

  &.signed {
    border-style: solid;
    border-color: var(--success);
    color: var(--ink-900);
  }

  &:disabled:not(.signed) {
    color: var(--ink-400);
    cursor: default;
  }

  &--sm {
    min-height: 48px;
    font-size: 0.95rem;
  }
}

.gf-photo img {
  max-height: 160px;
}

.gf-nav {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;

  .btn-primary {
    margin-left: auto;
  }
}

.gf-review {
  list-style: none;
  margin: 0;
  padding: 0;

  li + li {
    border-top: 1px solid var(--line);
  }

  button {
    width: 100%;
    min-height: 60px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: none;
    border: 0;
    text-align: left;
    color: var(--ink-900);
  }
}

.gf-review-title {
  flex: 1;
  font-weight: 600;
  font-size: 1.05rem;
}

.gf-review-count {
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}
</style>
