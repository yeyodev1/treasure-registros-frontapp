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
    <header class="cs-bar">
      <span><strong>{{ schema.title }}</strong> · {{ record.code }}</span>
      <span>Firma 1 de 3</span>
    </header>
    <SignSteps :record="record" :signers="schema.signers ?? []" me-step="tripulacion" />

    <h2 class="cs-title">Firma tú</h2>
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
.cs {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  max-width: 760px;
}

.cs-bar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--navy-800);
  color: #fff;
  font-size: 1rem;
}

.cs-title {
  font-size: 1.8rem;
}

.cs-who {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  strong {
    display: block;
    font-size: 1.2rem;
  }
}

.cs-eyebrow {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-400);
}

.cs-notme {
  min-height: 44px;
  padding: 0 0.6rem;
  font-weight: 700;
  font-size: 1rem;
  text-decoration: underline;
  color: var(--navy-800);
}

.cs-declare {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.5;
}
</style>
