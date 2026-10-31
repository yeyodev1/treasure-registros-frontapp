<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { apiErrorMessage } from '@/services/httpBase'
import BrandSeal from '@/components/ui/BrandSeal.vue'
import PasswordInput from '@/components/ui/PasswordInput.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const email = shallowRef('')
const password = shallowRef('')
const error = shallowRef('')
const remember = shallowRef(userStore.rememberedChoice())

const expired = computed(() => route.query.caducada === '1' || userStore.consumeExpiredNotice())

/** Solo rutas internas: nunca se redirige fuera de la app. */
const next = computed(() => {
  const raw = route.query.next
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')
    ? raw
    : '/'
})

async function submit() {
  error.value = ''
  try {
    await userStore.login(email.value, password.value, remember.value)
    router.replace(next.value)
  } catch (err) {
    error.value = apiErrorMessage(err)
  }
}
</script>

<template>
  <main class="login">
    <form class="login-card" @submit.prevent="submit">
      <div class="login-brand">
        <BrandSeal :size="96" />
        <div>
          <h1>Registros ISM</h1>
          <p>Sistema de Gestión de Seguridad a bordo</p>
        </div>
      </div>

      <Transition name="reveal">
        <p v-if="expired" class="login-expired" role="status">
          <i class="fa-solid fa-clock-rotate-left" aria-hidden="true" />
          <span><strong>Tu sesión caducó.</strong> Tus respuestas quedan guardadas en esta tableta. Ingresa de nuevo para seguir donde ibas.</span>
        </p>
      </Transition>

      <div class="field">
        <label for="email">Correo</label>
        <input id="email" v-model="email" type="email" autocomplete="username" inputmode="email" required />
      </div>

      <div class="field">
        <label for="password">Contraseña</label>
        <PasswordInput id="password" v-model="password" />
      </div>

      <button
        type="button"
        class="remember"
        :class="{ on: remember }"
        role="checkbox"
        :aria-checked="remember"
        @click="remember = !remember"
      >
        <span class="remember-box">
          <Transition name="tick">
            <i v-if="remember" class="fa-solid fa-check" aria-hidden="true" />
          </Transition>
        </span>
        <span class="remember-text">
          Mantener sesión en esta tableta
          <Transition name="fade" mode="out-in">
            <small :key="String(remember)">{{ remember ? 'Sigue abierta 30 días mientras se use.' : 'Se cierra tras 12 horas sin uso.' }}</small>
          </Transition>
        </span>
      </button>

      <Transition name="reveal">
        <p v-if="error" class="login-error" role="alert">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{{ error }}</span>
        </p>
      </Transition>

      <button class="btn btn-primary btn-lg login-submit" type="submit" :disabled="userStore.loading">
        <i class="fa-solid" :class="userStore.loading ? 'fa-spinner fa-spin' : 'fa-arrow-right-to-bracket'" aria-hidden="true" />
        {{ userStore.loading ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

// Portada del menú: azul empolvado con algas; la tarjeta blanca encima, sin
// sombra, con el sello y el nombre alineados a la izquierda.
.login {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--powder-300) url('/brand/algas.png') center / 520px auto repeat;
  padding: calc(1rem + env(safe-area-inset-top)) 1rem calc(1rem + env(safe-area-inset-bottom));
}

.login-card {
  width: 100%;
  max-width: 460px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 1.75rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  animation: rise 0.45s var(--ease) both;

  @include tablet {
    padding: 2.5rem 2.25rem;
  }
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  margin-bottom: 0.5rem;
  padding-bottom: 1.4rem;
  border-bottom: 1px solid var(--line);

  > :first-child {
    flex-shrink: 0;
  }

  h1 {
    font-size: 2rem;
    color: var(--navy-900);
  }

  p {
    margin: 0.25rem 0 0;
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.field :deep(input) {
  min-height: 52px;
}

.login-error {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--danger-100);
  color: var(--danger);
  font-size: 1rem;
  font-weight: 600;

  i {
    margin-top: 0.2rem;
  }
}

.login-submit {
  width: 100%;
  margin-top: 0.25rem;
}

.login-expired {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--warning-100);
  border: 1px solid var(--warning-line);
  color: #5f3f10;
  font-size: 1rem;
  line-height: 1.45;

  i {
    margin-top: 0.2rem;
  }
}

.remember {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  transition: background 0.18s ease, border-color 0.18s ease;

  &:hover {
    background: var(--hover);
  }

  &.on {
    background: var(--powder-100);
    border-color: var(--powder-300);
  }
}

.remember-box {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 7px;
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: #fff;
  font-size: 0.85rem;
  transition: background 0.16s ease, border-color 0.16s ease;

  .on & {
    background: var(--navy-800);
    border-color: var(--navy-800);
  }
}

.remember-text {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  font-size: 1rem;

  small {
    font-weight: 400;
    font-size: 1rem;
    color: var(--ink-600);
  }
}

.tick-enter-active,
.tick-leave-active {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.tick-enter-from,
.tick-leave-to {
  transform: scale(0.4);
  opacity: 0;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
</style>
