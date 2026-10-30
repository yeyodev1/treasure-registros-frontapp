<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { apiSignStep } from '@/services/api'
import { apiErrorCode, apiErrorMessage } from '@/services/httpBase'
import { useSound } from '@/composables/useSound'
import InlineSignaturePad from './InlineSignaturePad.vue'
import PinInput from './PinInput.vue'
import type { IsmRecord } from '@/types'

/**
 * Firma con el dedo + clave de 4 números para el paso actual del registro.
 * La primera vez (clave temporal) pide crear la propia en el mismo paso.
 * Los errores de clave se dicen en el momento y sin cerrar nada.
 */
const props = defineProps<{
  recordId: string
  /** Quien hizo el chequeo (id en la lista); vacío para Capitán y Persona Designada. */
  signer?: string
  submitLabel: string
  padPlaceholder?: string
  pinHint: string
  /** Antes de firmar (p. ej. sincronizar lo pendiente). */
  beforeSign?: () => Promise<void>
}>()

const emit = defineEmits<{ signed: [record: IsmRecord] }>()
const { play } = useSound()

const pad = useTemplateRef<InstanceType<typeof InlineSignaturePad>>('pad')
const hasInk = shallowRef(false)
const pin = shallowRef('')
const newPin = shallowRef('')
const newPin2 = shallowRef('')
const firstTime = shallowRef(false)
const busy = shallowRef(false)
const error = shallowRef('')
const locked = shallowRef(false)

const mismatch = computed(() => firstTime.value && newPin2.value.length === 4 && newPin.value !== newPin2.value)
const ready = computed(
  () =>
    hasInk.value &&
    pin.value.length === 4 &&
    !locked.value &&
    (!firstTime.value || (newPin.value.length === 4 && newPin.value === newPin2.value)),
)

const missingHint = computed(() => {
  if (!hasInk.value) return 'Falta tu firma en el recuadro.'
  if (pin.value.length < 4) return 'Falta tu clave de 4 números.'
  if (firstTime.value && (newPin.value.length < 4 || newPin.value !== newPin2.value)) return 'Crea y repite tu clave nueva.'
  return ''
})

async function sign() {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await props.beforeSign?.()
    const record = await apiSignStep(props.recordId, {
      image: pad.value!.image(),
      pin: pin.value,
      ...(firstTime.value ? { newPin: newPin.value } : {}),
      ...(props.signer ? { signer: props.signer } : {}),
    })
    play('success')
    emit('signed', record)
  } catch (err) {
    play('error')
    const code = apiErrorCode(err)
    if (code === 'clave_temporal') {
      firstTime.value = true
      error.value = ''
      return
    }
    if (code === 'clave_bloqueada') locked.value = true
    if (code === 'clave_incorrecta') pin.value = ''
    error.value = apiErrorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ssf">
    <div class="ssf-block">
      <p class="ssf-label">Tu firma</p>
      <InlineSignaturePad ref="pad" :placeholder="padPlaceholder" @change="hasInk = $event" />
    </div>

    <div class="ssf-block">
      <p class="ssf-label">{{ firstTime ? 'Tu clave temporal' : 'Tu clave de 4 números' }}</p>
      <div class="ssf-pin">
        <PinInput v-model="pin" :invalid="Boolean(error) && !locked" />
        <span class="ssf-hint">{{ pinHint }}</span>
      </div>
    </div>

    <Transition name="reveal">
      <div v-if="firstTime" class="ssf-first">
        <p>
          <i class="fa-solid fa-key" aria-hidden="true" />
          Es tu primera firma. Crea tu clave de 4 números: solo tú la vas a saber.
        </p>
        <div class="ssf-new">
          <div>
            <p class="ssf-label">Clave nueva</p>
            <PinInput v-model="newPin" label="Clave nueva" />
          </div>
          <div>
            <p class="ssf-label">Repítela</p>
            <PinInput v-model="newPin2" label="Repite la clave nueva" :invalid="mismatch" />
          </div>
        </div>
        <p v-if="mismatch" class="ssf-error">Las dos claves no coinciden.</p>
        <p class="ssf-small">Que no sean números seguidos ni repetidos (no 1234 ni 0000).</p>
      </div>
    </Transition>

    <Transition name="fade">
      <p v-if="error" class="ssf-error" role="alert">
        <i class="fa-solid" :class="locked ? 'fa-lock' : 'fa-circle-exclamation'" aria-hidden="true" /> {{ error }}
      </p>
    </Transition>

    <div class="ssf-actions">
      <button type="button" class="btn btn-primary ssf-submit" :disabled="!ready || busy" @click="sign">
        <i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-signature'" aria-hidden="true" />
        {{ busy ? 'Firmando…' : submitLabel }}
      </button>
      <p v-if="missingHint && !busy" class="ssf-small">{{ missingHint }}</p>
      <slot name="secondary" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.ssf {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ssf-label {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-600);
}

.ssf-pin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.ssf-hint,
.ssf-small {
  margin: 0;
  font-size: 1rem;
  color: var(--ink-600);
}

.ssf-first {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--powder-100);

  > p:first-child {
    margin: 0;
    font-weight: 600;
    font-size: 1rem;
    display: flex;
    gap: 0.5rem;

    i {
      margin-top: 0.25rem;
      color: var(--navy-700);
    }
  }
}

.ssf-new {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
}

.ssf-error {
  margin: 0;
  color: var(--danger);
  font-weight: 600;
  font-size: 1rem;
}

.ssf-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  :deep(.btn) {
    min-height: 56px;
    width: 100%;
    justify-content: center;
    font-size: 1.05rem;
  }
}
</style>
