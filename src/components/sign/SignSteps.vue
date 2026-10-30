<script setup lang="ts">
import { computed } from 'vue'
import { formatHour } from '@/utils/ism'
import type { IsmRecord, IsmSigner } from '@/types'

/**
 * Avance de las tres firmas del registro (quien hizo el chequeo → Capitán →
 * Persona Designada), con quién firmó y a qué hora, y a quién le toca.
 */
const props = defineProps<{
  record: IsmRecord
  signers: IsmSigner[]
  /** El paso de quien está mirando la pantalla se llama "Tú". */
  meStep?: string
}>()

const steps = computed(() => {
  const order = ['borrador', 'por_capitan', 'por_oficina', 'archivado']
  const at = order.indexOf(props.record.status)
  return props.signers.map((s, i) => {
    const sig = props.record.signatures.find((x) => x.field === s.field && x.valid !== false)
    const state = sig && at > i ? 'done' : at === i ? 'now' : 'later'
    const title = props.meStep === s.step ? 'Tú' : s.step === 'tripulacion' ? 'Tripulante' : s.label
    const detail =
      state === 'done'
        ? `${props.meStep === s.step ? 'Firmado' : sig!.signerName} · ${formatHour(sig!.signedAt)}`
        : state === 'now'
          ? props.meStep === s.step
            ? 'Te toca'
            : 'Le toca firmar'
          : i === props.signers.length - 1
            ? 'Al final'
            : 'Después'
    return { key: s.step, n: i + 1, state, title, detail }
  })
})
</script>

<template>
  <ol class="ss" aria-label="Firmas">
    <li v-for="(s, i) in steps" :key="s.key" class="ss-step" :class="`ss-step--${s.state}`">
      <span v-if="i" class="ss-line" :class="{ on: s.state !== 'later' }" aria-hidden="true" />
      <span class="ss-dot">
        <i v-if="s.state === 'done'" class="fa-solid fa-check" aria-hidden="true" />
        <template v-else>{{ s.n }}</template>
      </span>
      <strong>{{ s.title }}</strong>
      <small>{{ s.detail }}</small>
    </li>
  </ol>
</template>

<style scoped lang="scss">
.ss {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ss-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.25rem;

  strong {
    margin-top: 0.15rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  small {
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.ss-line {
  position: absolute;
  top: 21px;
  right: calc(50% + 30px);
  width: calc(100% - 60px);
  border-top: 2px solid var(--line-strong);

  &.on {
    border-color: var(--success);
  }
}

.ss-dot {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.05rem;
  border: 2px solid var(--line-strong);
  color: var(--ink-600);
  background: #fff;
  font-variant-numeric: tabular-nums;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  .ss-step--done & {
    background: var(--success);
    border-color: var(--success);
    color: #fff;
  }

  .ss-step--now & {
    background: var(--gold-500);
    border-color: var(--gold-500);
    color: #fff;
  }
}
</style>
