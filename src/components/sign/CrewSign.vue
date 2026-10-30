<script setup lang="ts">
import { computed } from 'vue'
import { formatActivity } from '@/utils/ism'
import SignSteps from './SignSteps.vue'
import StepSignForm from './StepSignForm.vue'
import type { ContextDraft } from '@/components/guided/GuidedContextForm.vue'
import type { IsmRecord, IsmSchema } from '@/types'

/**
 * Pantalla 2 · El tripulante firma: confirma quién firma ("No soy yo" vuelve
 * a elegir de la lista), qué declara, firma con el dedo y pone su clave.
 * La sesión de la tablet nunca firma: firma la persona elegida.
 */
const props = defineProps<{
  record: IsmRecord
  schema: IsmSchema
  context: ContextDraft
  positionLabel: (value: string) => string
  beforeSign: () => Promise<void>
}>()

const emit = defineEmits<{ back: []; notMe: []; signed: [record: IsmRecord] }>()

const when = computed(() => formatActivity(props.context.activityDate))
</script>

<template>
  <section class="cs">
    <div class="cs-steps card">
      <SignSteps :record="record" :signers="schema.signers ?? []" me-step="tripulacion" />
    </div>

    <div class="cs-head">
      <h2 class="cs-title">Firma tú</h2>
      <span class="cs-count">Firma 1 de 3</span>
    </div>
    <div class="cs-who card">
      <div>
        <span class="cs-eyebrow">Firmas como</span>
        <strong>{{ context.name }}<template v-if="context.position"> · {{ positionLabel(context.position) }}</template></strong>
      </div>
      <button type="button" class="cs-notme" @click="emit('notMe')">No soy yo</button>
    </div>

    <p class="cs-declare">
      Al firmar confirmas que <strong>tú hiciste este chequeo</strong> el {{ when }} a las {{ context.activityTime }} en
      {{ context.place }}, y que las respuestas son ciertas.
    </p>

    <StepSignForm
      :record-id="record._id"
      :signer="context.crewId"
      submit-label="Firmar y enviar al Capitán"
      pin-hint="Prueba que eres tú, aunque la tablet sea de todos"
      :before-sign="beforeSign"
      @signed="emit('signed', $event)"
    >
      <template #secondary>
        <button type="button" class="btn btn-ghost" @click="emit('back')">
          <i class="fa-solid fa-arrow-left" aria-hidden="true" /> Volver a revisar
        </button>
      </template>
    </StepSignForm>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

// Pantalla 2: quién firma, qué declara, la firma y la clave. Nada más.
.cs {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 760px;
}

.cs-steps {
  padding: 1.1rem 0.75rem;
}

.cs-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.cs-title {
  font-size: 2rem;
}

.cs-count {
  color: var(--ink-600);
  font-variant-numeric: tabular-nums;
}

.cs-who {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  strong {
    display: block;
    margin-top: 0.15rem;
    font-size: 1.3rem;
    font-weight: 600;
  }
}

.cs-eyebrow {
  font-size: 1rem;
  color: var(--ink-600);
}

.cs-notme {
  min-height: 48px;
  padding: 0 0.75rem;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--navy-800);
  flex-shrink: 0;
}

.cs-declare {
  margin: 0;
  font-size: 1.12rem;
  line-height: 1.55;
}
</style>
