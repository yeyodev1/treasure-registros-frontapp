<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import type { IsmField, IsmForm, IsmSignature } from '@/types'

/**
 * Muestra el formulario oficial (la misma hoja del PDF) y superpone cada
 * campo en su posición exacta: texto, casillas, firmas y fotos.
 */
const props = defineProps<{
  form: IsmForm
  values: Record<string, string | boolean>
  signatures: IsmSignature[]
  editable: boolean
  zoom: number
  canSign: (field: IsmField) => boolean
  /** Imágenes de las firmas (URL local), cargadas aparte del registro. */
  images: Map<string, string>
}>()

const emit = defineEmits<{
  change: [name: string, value: string | boolean]
  sign: [field: IsmField]
  photo: [field: IsmField]
}>()

const wrap = useTemplateRef<HTMLElement>('wrap')
/** Ancho en px de la hoja renderizada, para escalar el tamaño de letra. */
const pagePx = shallowRef(800)
let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver(() => {
    const page = wrap.value?.querySelector('.sheet') as HTMLElement | null
    if (page) pagePx.value = page.clientWidth
  })
  if (wrap.value) observer.observe(wrap.value)
})
onBeforeUnmount(() => observer?.disconnect())

const signatureMap = computed(() => new Map(props.signatures.map((s) => [s.field, s])))

function fieldsOf(page: number) {
  return props.form.fields.filter((f) => f.page === page)
}

function box(f: IsmField) {
  return {
    left: `${f.x * 100}%`,
    top: `${f.y * 100}%`,
    width: `${f.w * 100}%`,
    height: `${f.h * 100}%`,
  }
}

/** Tamaño de letra en px: el del PDF (o automático según la altura) escalado a la pantalla. */
function fontPx(f: IsmField, pageIndex: number) {
  const pageW = props.form.pages[pageIndex]!.width
  const pageH = props.form.pages[pageIndex]!.height
  const scale = pagePx.value / pageW
  const heightPt = f.h * pageH
  const base = f.fontSize && f.fontSize > 0 ? f.fontSize : f.multiline ? 9 : Math.min(heightPt * 0.62, 11)
  return `${Math.max(7, base * scale)}px`
}

function textValue(f: IsmField): string {
  const v = props.values[f.name]
  return typeof v === 'string' ? v : ''
}

function onInput(f: IsmField, e: Event) {
  emit('change', f.name, (e.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function toggle(f: IsmField) {
  if (!props.editable) return
  emit('change', f.name, props.values[f.name] !== true)
}

/** Dato conocido (caducidad del R-28): se ve como referencia, no se escribe como respuesta. */
function placeholderOf(f: IsmField): string | undefined {
  return f.reference ? `Ref.: ${f.reference}` : undefined
}

function photoUrl(f: IsmField): string {
  const v = props.values[f.name]
  return typeof v === 'string' ? v : ''
}
</script>

<template>
  <div ref="wrap" class="canvas" :style="{ '--zoom': zoom }">
    <div class="sheets">
      <div
        v-for="(page, pi) in form.pages"
        :key="pi"
        class="sheet"
        :style="{ aspectRatio: `${page.width} / ${page.height}` }"
      >
        <img
          class="sheet-bg"
          :src="`/forms/${form.code}-${pi + 1}.jpg`"
          :alt="`${form.code} página ${pi + 1}`"
          draggable="false"
        />

        <template v-for="f in fieldsOf(pi)" :key="f.name">
          <!-- Texto -->
          <textarea
            v-if="f.type === 'text' && f.multiline"
            class="fld fld-text fld-area"
            :class="{ ro: !editable }"
            :style="{ ...box(f), fontSize: fontPx(f, pi) }"
            :value="textValue(f)"
            :readonly="!editable"
            :maxlength="f.maxLength"
            :placeholder="placeholderOf(f)"
            :title="f.reference ? `Dato conocido: ${f.reference}. Confírmalo con la revisión física.` : undefined"
            :aria-label="f.name"
            @input="onInput(f, $event)"
          />
          <input
            v-else-if="f.type === 'text'"
            class="fld fld-text"
            :class="{ ro: !editable }"
            :style="{ ...box(f), fontSize: fontPx(f, pi) }"
            :value="textValue(f)"
            :readonly="!editable"
            :maxlength="f.maxLength"
            :placeholder="placeholderOf(f)"
            :title="f.reference ? `Dato conocido: ${f.reference}. Confírmalo con la revisión física.` : undefined"
            :aria-label="f.name"
            @input="onInput(f, $event)"
          />

          <!-- Casillas -->
          <button
            v-else-if="f.type === 'checkbox' || f.type === 'radio'"
            type="button"
            class="fld fld-check"
            :class="{ on: values[f.name] === true, ro: !editable }"
            :style="{ ...box(f), fontSize: fontPx(f, pi) }"
            :aria-pressed="values[f.name] === true"
            :aria-label="f.name"
            @click="toggle(f)"
          >
            <i v-if="values[f.name] === true" class="fa-solid fa-xmark" aria-hidden="true" />
          </button>

          <!-- Firmas -->
          <button
            v-else-if="f.type === 'signature'"
            type="button"
            class="fld fld-sign"
            :class="{
              signed: signatureMap.has(f.name) && signatureMap.get(f.name)!.valid !== false,
              invalid: signatureMap.get(f.name)?.valid === false,
              open: (!signatureMap.has(f.name) || signatureMap.get(f.name)!.valid === false) && canSign(f),
            }"
            :style="box(f)"
            :disabled="!canSign(f) && !signatureMap.has(f.name)"
            :title="f.label"
            @click="emit('sign', f)"
          >
            <span v-if="signatureMap.get(f.name)?.valid === false" class="sign-cta sign-invalid">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Firma invalidada: volver a firmar
            </span>
            <Transition v-else-if="signatureMap.has(f.name)" name="fade" mode="out-in">
              <img
                v-if="images.get(f.name)"
                :key="images.get(f.name)"
                :src="images.get(f.name)"
                :alt="`Firma de ${signatureMap.get(f.name)!.signerName}`"
              />
              <span v-else class="sign-cta sign-name">{{ signatureMap.get(f.name)!.signerName }}</span>
            </Transition>
            <span v-else-if="canSign(f)" class="sign-cta">
              <i class="fa-solid fa-signature" aria-hidden="true" /> {{ f.label }}
            </span>
          </button>

          <!-- Fotos (anexo R-18) -->
          <button
            v-else-if="f.type === 'photo'"
            type="button"
            class="fld fld-photo"
            :style="box(f)"
            :disabled="!editable"
            @click="emit('photo', f)"
          >
            <img v-if="photoUrl(f)" :src="photoUrl(f)" alt="Foto de soporte" />
            <span v-else-if="editable" class="sign-cta"><i class="fa-solid fa-camera" aria-hidden="true" /> Agregar foto</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--radius-sm);
}

.sheets {
  width: calc(100% * var(--zoom));
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: width 0.2s ease;
}

.sheet {
  position: relative;
  width: 100%;
  background: #fff;
  box-shadow: var(--shadow);
  border-radius: 4px;
  overflow: hidden;
}

.sheet-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}

.fld {
  position: absolute;
  box-sizing: border-box;
  margin: 0;
  border: none;
  padding: 0 0.2em;
  background: rgba(200, 215, 231, 0.32);
  color: #10223a;
  font-family: Helvetica, Arial, sans-serif;
  line-height: 1.15;
  transition: background 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    background: rgba(159, 107, 60, 0.12);
    box-shadow: inset 0 0 0 1.5px var(--gold-500);
  }

  &.ro {
    background: transparent;
  }
}

.fld-area {
  resize: none;
  padding-top: 0.15em;
  overflow: hidden;
}

.fld-check {
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;

  i {
    font-size: 100%;
    width: 80%;
    height: 80%;
    display: grid;
    place-items: center;
  }

  &.on {
    background: rgba(27, 43, 37, 0.08);
    color: #10223a;
    font-size: inherit;
  }

  &.ro {
    cursor: default;
  }
}

.fld-sign,
.fld-photo {
  display: grid;
  place-items: center;
  padding: 2px;
  background: transparent;
  cursor: default;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.fld-sign.open,
.fld-photo:not(:disabled) {
  cursor: pointer;
  background: rgba(159, 107, 60, 0.1);
  box-shadow: inset 0 0 0 1.5px rgba(159, 107, 60, 0.6);
  animation: invite 2.4s ease-in-out infinite;
}

.fld-sign.signed {
  background: transparent;
}

.fld-sign.invalid {
  background: rgba(180, 72, 59, 0.1);
  box-shadow: inset 0 0 0 1.5px rgba(180, 72, 59, 0.55);
}

.sign-invalid {
  color: var(--danger);
}

.sign-name {
  color: var(--ink-600);
  font-style: italic;
}

.fld-text::placeholder {
  color: rgba(159, 107, 60, 0.75);
  font-style: italic;
}

.sign-cta {
  font-family: var(--font-sans);
  font-size: clamp(8px, 1.1vw, 12px);
  font-weight: 600;
  color: var(--gold-500);
  text-align: center;
  line-height: 1.1;
  padding: 0 4px;
}

@keyframes invite {
  0%,
  100% {
    box-shadow: inset 0 0 0 1.5px rgba(159, 107, 60, 0.6);
  }

  50% {
    box-shadow: inset 0 0 0 2.5px rgba(159, 107, 60, 0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fld-sign.open {
    animation: none;
  }
}
</style>
