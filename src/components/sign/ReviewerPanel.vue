<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { apiReturnRecord } from '@/services/api'
import { apiErrorMessage } from '@/services/httpBase'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import { useSound } from '@/composables/useSound'
import { hasNovedad, schemaItems } from '@/utils/guided'
import { formatActivity, formatStamp } from '@/utils/ism'
import GuidedSummary from '@/components/guided/GuidedSummary.vue'
import ReviewCard from './ReviewCard.vue'
import SignSteps from './SignSteps.vue'
import PdfThumb from '@/components/ui/PdfThumb.vue'
import StepSignForm from './StepSignForm.vue'
import type { IsmAnswer, IsmRecord, IsmSchema } from '@/types'

/**
 * Pantallas 4 y 5 del informe: el Capitán revisa y firma (o devuelve al
 * tripulante) y la Persona Designada recibe y archiva (o devuelve al
 * Capitán). Solo la cuenta del rol ve esta pantalla; firma con su clave.
 * Devolver pide un comentario obligatorio.
 */
const props = defineProps<{
  record: IsmRecord
  schema: IsmSchema
  answers: Record<string, IsmAnswer>
  mode: 'capitan' | 'designada'
  positionLabel: (value: string) => string
}>()

const emit = defineEmits<{ updated: [record: IsmRecord]; pdf: [] }>()

const confirmStore = useConfirmStore()
const toast = useToastStore()
const { play } = useSound()

const decision = shallowRef<'firmar' | 'devolver'>('firmar')
const comment = shallowRef('')
const returning = shallowRef(false)

const crewSig = computed(() => props.record.signatures.find((s) => s.stage === 'tripulacion' && s.valid !== false))
const captainSig = computed(() => props.record.signatures.find((s) => s.stage === 'capitan' && s.valid !== false))
const rows = computed(() => schemaItems(props.schema).map(({ item }) => props.answers[item.id]))
const novedades = computed(() => rows.value.filter((a) => hasNovedad(a)).length)
const noAplica = computed(() => rows.value.filter((a) => a?.value === 'na').length)
const clean = computed(() => rows.value.length - novedades.value - noAplica.value)

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** Carpeta del archivo: el mes sale de la fecha de la actividad (meses en español). */
const folder = computed(() => {
  // La calcula el servidor; la de la tablet queda de respaldo.
  if (props.record.archivePath) {
    const parts = props.record.archivePath.split('/').filter(Boolean)
    return (parts.length > 4 ? [parts[0]!, ...parts.slice(-3)] : parts).join(' › ')
  }
  const [y, m] = (props.record.context?.activityDate ?? '').split('-').map(Number)
  const base = (props.schema.archiveFolder ?? `ISM/${props.record.code}`).split('/').filter(Boolean)
  if (!y || !m) return base.join(' › ')
  const short = base.length > 2 ? [base[0]!, base[base.length - 1]!] : base
  return [...short, String(y), `${String(m).padStart(2, '0')}_${MONTHS[m - 1]}`].join(' › ')
})

const novedadText = computed(() => {
  const first = schemaItems(props.schema).find(({ item }) => hasNovedad(props.answers[item.id]))
  if (!first) return 'Sin novedades'
  const a = props.answers[first.item.id]
  return `${novedades.value} · ${a?.descripcion || first.item.prompt}`
})

const returnTo = computed(() => (props.mode === 'capitan' ? 'al tripulante' : 'al Capitán'))

async function giveBack() {
  const text = comment.value.trim()
  if (!text) return
  const ok = await confirmStore.ask({
    title: `¿Devolver ${returnTo.value}?`,
    message:
      props.mode === 'capitan'
        ? 'Vuelve a quien hizo el chequeo con tu comentario. Su firma se anula y tendrá que firmar de nuevo.'
        : 'Vuelve al Capitán con tu comentario. Su firma se anula y tendrá que firmar de nuevo.',
    confirmLabel: `Devolver ${returnTo.value}`,
    icon: 'fa-rotate-left',
  })
  if (!ok) return
  returning.value = true
  try {
    const rec = await apiReturnRecord(props.record._id, text, '')
    play('success')
    toast.success(`Devuelto ${returnTo.value}`)
    emit('updated', rec)
  } catch (err) {
    play('error')
    toast.error(apiErrorMessage(err))
  } finally {
    returning.value = false
  }
}

function onSigned(rec: IsmRecord) {
  toast.success(props.mode === 'capitan' ? 'Firmado: ya está con la Persona Designada' : 'Firmado y archivado')
  emit('updated', rec)
}
</script>

<template>
  <section class="rv">
    <div class="rv-head">
      <div>
        <h2 class="rv-title">{{ mode === 'capitan' ? 'Revisa el chequeo y firma' : 'Recibir y archivar' }}</h2>
        <p class="rv-sub-title">{{ record.code }} · {{ schema.officialTitle.replace(/^R-\d+\s*/, '') }}</p>
      </div>
      <span class="rv-count">Firma {{ mode === 'capitan' ? 2 : 3 }} de 3</span>
    </div>

    <p v-if="record.returnInfo" class="rv-returned">
      <i class="fa-solid fa-rotate-left" aria-hidden="true" />
      <span>Devuelto por {{ record.returnInfo.byName }} · {{ formatStamp(record.returnInfo.at) }}: <strong>{{ record.returnInfo.reason }}</strong></span>
    </p>

    <template v-if="mode === 'capitan'">
      <div class="card rv-by">
        <span class="rv-check"><i class="fa-solid fa-check" aria-hidden="true" /></span>
        <div>
          <p>
            Lo hizo y firmó <strong>{{ crewSig?.signerName ?? record.context?.filledBy?.name }}<template v-if="crewSig?.position"> · {{ positionLabel(crewSig.position) }}</template></strong>
          </p>
          <small>{{ formatActivity(record.context?.activityDate, record.context?.activityTime) }} · {{ record.context?.place }}</small>
        </div>
      </div>
      <ReviewCard
        :schema="schema"
        :answers="answers"
        :context="record.context ?? null"
        :position-label="positionLabel"
        action-label="Qué hizo el tripulante"
        hide-summary
      />
      <details class="card rv-all">
        <summary>
          <span>{{ clean }} puntos sin novedad<template v-if="noAplica"> · {{ noAplica }} no aplican</template></span>
          <span class="rv-link">Ver todo <i class="fa-solid fa-chevron-down" aria-hidden="true" /></span>
        </summary>
        <GuidedSummary :schema="schema" :answers="answers" :context="record.context ?? null" :position-label="positionLabel" />
      </details>

      <h3 class="rv-sub">Tu decisión</h3>
      <div class="rv-choices" role="radiogroup" aria-label="Tu decisión">
        <button type="button" role="radio" class="rv-choice" :class="{ on: decision === 'firmar' }" :aria-checked="decision === 'firmar'" @click="decision = 'firmar'">
          <span class="rv-radio" /> <span><strong>Está correcto.</strong> Firmo el registro</span>
        </button>
        <button type="button" role="radio" class="rv-choice" :class="{ on: decision === 'devolver' }" :aria-checked="decision === 'devolver'" @click="decision = 'devolver'">
          <span class="rv-radio" /> <span><strong>Devolver al tripulante</strong> con un comentario para corregir</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="card rv-steps">
        <SignSteps :record="record" :signers="schema.signers ?? []" me-step="oficina" />
      </div>
      <div class="card rv-pdf">
        <PdfThumb :record-id="record._id" class="rv-thumb" @open="emit('pdf')" />
        <dl>
          <div><dt>PDF oficial</dt><dd><code>{{ record.fileName }}</code></dd></div>
          <div><dt>Firmas</dt><dd>{{ record.signatures.filter((s) => s.valid !== false).length + 1 }} con la tuya</dd></div>
          <div><dt>Se guarda en</dt><dd>{{ folder }}</dd></div>
          <div><dt>Novedades</dt><dd>{{ novedadText }}</dd></div>
        </dl>
        <button type="button" class="btn btn-ghost" @click="emit('pdf')">
          <i class="fa-regular fa-file-pdf" aria-hidden="true" /> Abrir el PDF
        </button>
      </div>
      <p class="rv-note">La copia a la carpeta de OneDrive se activa cuando la empresa conecte su cuenta de Microsoft.</p>
      <div class="rv-choices" role="radiogroup" aria-label="Tu decisión">
        <button type="button" role="radio" class="rv-choice" :class="{ on: decision === 'firmar' }" :aria-checked="decision === 'firmar'" @click="decision = 'firmar'">
          <span class="rv-radio" /> <span><strong>Está correcto.</strong> Firmo y archivo</span>
        </button>
        <button type="button" role="radio" class="rv-choice" :class="{ on: decision === 'devolver' }" :aria-checked="decision === 'devolver'" @click="decision = 'devolver'">
          <span class="rv-radio" /> <span><strong>Devolver al Capitán</strong> con un comentario</span>
        </button>
      </div>
      <p v-if="captainSig" class="rv-note">Firmó el Capitán: {{ captainSig.signerName }} · {{ formatStamp(captainSig.signedAt) }}</p>
    </template>

    <Transition name="fade" mode="out-in">
      <div v-if="decision === 'firmar'" key="sign" class="rv-sign">
        <p class="rv-note">
          {{ mode === 'capitan' ? 'Firmar deja constancia de tu revisión. La decisión de zarpar sigue siendo tuya.' : 'Al firmar, el registro se archiva y ya no se puede modificar.' }}
        </p>
        <StepSignForm
          :record-id="record._id"
          :submit-label="mode === 'capitan' ? 'Firmar y enviar a la Persona Designada' : 'Firmar y archivar'"
          :pad-placeholder="mode === 'capitan' ? 'Firma del Capitán' : 'Firma de la Persona Designada'"
          :pin-hint="mode === 'capitan' ? 'Solo la cuenta del Capitán ve esta pantalla' : 'Solo la cuenta de la Persona Designada ve esta pantalla'"
          @signed="onSigned"
        />
      </div>
      <div v-else key="back" class="rv-sign">
        <div class="field">
          <label for="rv-comment">¿Qué hay que corregir? (obligatorio)</label>
          <textarea id="rv-comment" v-model="comment" rows="3" placeholder="Escribe el comentario" />
        </div>
        <button type="button" class="btn btn-return" :disabled="!comment.trim() || returning" @click="giveBack">
          <i class="fa-solid" :class="returning ? 'fa-spinner fa-spin' : 'fa-rotate-left'" aria-hidden="true" />
          Devolver {{ returnTo }}
        </button>
      </div>
    </Transition>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

// Pantallas 4 y 5: quién lo hizo, la novedad arriba, la decisión y la firma.
.rv {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  max-width: 820px;
}

.rv-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.rv-title {
  font-size: 2rem;
}

.rv-sub-title {
  margin: 0.3rem 0 0;
  color: var(--ink-600);
}

.rv-count {
  flex-shrink: 0;
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.rv-sub {
  margin: 0.75rem 0 0;
  font-size: 1.4rem;
}

.rv-returned {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--danger-100);
  box-shadow: inset 4px 0 0 var(--danger);
  font-size: 1rem;

  i {
    margin-top: 0.25rem;
    color: var(--danger);
  }
}

.rv-by {
  display: flex;
  align-items: center;
  gap: 0.9rem;

  p {
    margin: 0;
    font-size: 1.08rem;
  }

  strong {
    font-weight: 600;
  }

  small {
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.rv-check {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--success);
  color: #fff;
}

.rv-all summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
  font-size: 1.05rem;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }
}

.rv-all[open] summary {
  margin-bottom: 0.75rem;

  .rv-link i {
    transform: rotate(180deg);
  }
}

.rv-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: var(--navy-800);
  text-decoration: underline;
  text-underline-offset: 3px;

  i {
    font-size: 0.8rem;
    transition: transform 0.2s ease;
  }
}

.rv-choices {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.rv-choice {
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: #fff;
  font-size: 1.05rem;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;

  &:hover:not(.on) {
    border-color: var(--navy-600);
  }

  &.on {
    border-color: var(--navy-800);
    box-shadow: inset 0 0 0 1px var(--navy-800);
    background: var(--active);
  }

  strong {
    font-weight: 600;
  }
}

.rv-radio {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  background: #fff;
  position: relative;

  .on & {
    border-color: var(--navy-800);

    &::after {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      background: var(--navy-800);
    }
  }
}

.rv-note {
  margin: 0;
  font-size: 1rem;
  color: var(--ink-600);
}

.rv-sign {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.25rem;

  textarea {
    font-size: 1rem;
  }

  > .btn {
    min-height: 56px;
    justify-content: center;
    font-size: 1.08rem;
  }
}

.btn-return {
  background: var(--danger);
  color: #fff;

  &:hover:not(:disabled) {
    background: #8f3527;
  }
}

.rv-steps {
  padding: 1.1rem 0.75rem;
}

// Pantalla 5: la hoja real en pequeño, el nombre del archivo y la carpeta.
.rv-pdf {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem 1.5rem;

  @include tablet {
    grid-template-columns: 162px minmax(0, 1fr);
    align-items: start;

    > .btn {
      grid-column: 2;
      justify-self: start;
    }
  }

  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  dt {
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink-600);
  }

  dd {
    margin: 0.1rem 0 0;
    font-size: 1.05rem;
    font-weight: 500;

    code {
      font-family: var(--font-sans);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  }

  > .btn {
    min-height: 48px;
    min-width: 220px;
  }
}

.rv-thumb {
  display: none;

  @include tablet {
    display: block;
    grid-row: span 2;
  }
}
</style>
