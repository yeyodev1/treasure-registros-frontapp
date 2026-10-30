<script setup lang="ts">
import SignSteps from './SignSteps.vue'
import type { IsmRecord, IsmSchema } from '@/types'

/** Pantalla 3 · Enviado al Capitán: sabe que terminó y ve el avance de las tres firmas. */
defineProps<{ record: IsmRecord; schema: IsmSchema }>()
const emit = defineEmits<{ home: [] }>()
</script>

<template>
  <section class="sent">
    <span class="sent-ok"><i class="fa-solid fa-check" aria-hidden="true" /></span>
    <h2>Listo. Ya está con el Capitán.</h2>
    <p class="sent-lead">
      No tienes que hacer nada más. Si te lo devuelve, lo verás en <strong>Mis tareas</strong>.
    </p>
    <div class="card sent-steps">
      <SignSteps :record="record" :signers="schema.signers ?? []" me-step="tripulacion" />
    </div>
    <div class="card sent-file">
      <span class="sent-eyebrow">Archivo</span>
      <strong class="sent-name">{{ record.fileName }}</strong>
      <p>Queda como borrador hasta que la Persona Designada lo firme y lo archive.</p>
    </div>
    <button type="button" class="btn btn-primary btn-lg sent-home" @click="emit('home')">Volver a Mis tareas</button>
  </section>
</template>

<style scoped lang="scss">
// Pantalla 3: terminó. Una sola idea grande y el avance de las firmas.
.sent {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  max-width: 760px;
  padding-top: 0.5rem;
}

.sent-ok {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--success);
  color: #fff;
  font-size: 2rem;
  animation: pop 0.4s var(--ease);
}

h2 {
  font-size: 2.2rem;
}

.sent-lead {
  margin: 0;
  font-size: 1.12rem;
  max-width: 52ch;
}

.sent-steps {
  padding: 1.1rem 0.75rem;
}

.sent-file {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  p {
    margin: 0.2rem 0 0;
    color: var(--ink-600);
  }
}

.sent-name {
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.sent-eyebrow {
  font-size: 1rem;
  color: var(--ink-600);
}

.sent-home {
  margin-top: 0.5rem;
}

@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
