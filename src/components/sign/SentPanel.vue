<script setup lang="ts">
import SignSteps from './SignSteps.vue'
import type { IsmRecord, IsmSchema } from '@/types'

/** Pantalla 3 · Enviado al Capitán: sabe que terminó y ve el avance de las tres firmas. */
defineProps<{ record: IsmRecord; schema: IsmSchema }>()
const emit = defineEmits<{ home: [] }>()
</script>

<template>
  <section class="sent">
    <header class="sent-bar">
      <span><strong>{{ schema.title }}</strong> · {{ record.code }}</span>
      <span>Enviado</span>
    </header>
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
      <code>{{ record.fileName }}</code>
      <p>Queda como borrador hasta que la Persona Designada lo firme y lo archive.</p>
    </div>
    <button type="button" class="btn btn-primary sent-home" @click="emit('home')">Volver a Mis tareas</button>
  </section>
</template>

<style scoped lang="scss">
.sent {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 760px;
}

.sent-bar {
  display: flex;
  justify-content: space-between;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--navy-800);
  color: #fff;
  font-size: 1rem;
}

.sent-ok {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(63, 122, 87, 0.15);
  color: var(--success);
  font-size: 2.2rem;
  animation: pop 0.4s ease;
}

h2 {
  font-size: 1.9rem;
}

.sent-lead {
  margin: 0;
  font-size: 1.08rem;
}

.sent-file {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  code {
    font-size: 1.1rem;
  }

  p {
    margin: 0;
    color: var(--ink-600);
  }
}

.sent-eyebrow {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-400);
}

.sent-home {
  min-height: 56px;
  justify-content: center;
  font-size: 1.05rem;
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
