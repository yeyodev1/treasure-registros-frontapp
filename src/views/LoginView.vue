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
        <BrandSeal :size="110" />
        <h1>Registros ISM</h1>
        <p>Sistema de Gestión de Seguridad a bordo</p>
      </div>

      <Transition name="fade">
        <p v-if="expired" class="login-expired" role="status">
          <i class="fa-solid fa-clock-rotate-left" aria-hidden="true" />
          <span>Tu sesión caducó; tus respuestas quedan guardadas en esta tableta. Ingresa de nuevo para seguir donde ibas.</span>
        </p>
      </Transition>

      <div class="field">
        <label for="email">Correo</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required />
      </div>

      <div class="field">
        <label for="password">Contraseña</label>
        <PasswordInput id="password" v-model="password" />
      </div>

      <button
        type="button"
        class="remember"
        role="checkbox"
        :aria-checked="remember"
        @click="remember = !remember"
      >
        <span class="remember-box" :class="{ on: remember }">
          <Transition name="tick">
            <i v-if="remember" class="fa-solid fa-check" aria-hidden="true" />
          </Transition>
        </span>
        <span class="remember-text">
          Mantener sesión en esta tableta
          <small>{{ remember ? 'Sigue abierta 30 días mientras se use.' : 'Se cierra tras 12 horas sin uso.' }}</small>
        </span>
      </button>

      <p v-if="error" class="login-error">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true" /> {{ error }}
      </p>

      <button class="btn btn-primary login-submit" type="submit" :disabled="userStore.loading">
        <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true" />
        {{ userStore.loading ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>
  </main>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.login {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--powder-300) url('/brand/algas.png') center / 520px auto repeat;
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: var(--radius);
  box-shadow: 0 18px 50px rgba(27, 43, 37, 0.25);
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-top: 5px solid var(--gold-500);
  animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);

  @include tablet {
    padding: 2.4rem 2rem;
  }
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 0.4rem;
  text-align: center;

  h1 {
    margin: 0.8rem 0 0;
    font-family: var(--font-serif);
    font-size: 1.6rem;
  }

  p {
    margin: 0.2rem 0 0;
    font-size: 0.9rem;
    color: var(--ink-600);
  }
}

.login-error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
  font-weight: 600;
}

.login-submit {
  width: 100%;
}

.login-expired {
  margin: 0;
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.75rem 0.85rem;
  border-radius: var(--radius-sm);
  background: rgba(185, 128, 47, 0.12);
  border: 1px solid rgba(185, 128, 47, 0.35);
  color: #6f4a17;
  font-size: 0.88rem;
  line-height: 1.4;

  i {
    margin-top: 0.15rem;
  }
}

.remember {
  @include touch-target;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  padding: 0.35rem 0.2rem;
  border-radius: var(--radius-sm);
}

.remember-box {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 7px;
  border: 2px solid var(--cream-200);
  background: #fff;
  color: #fff;
  font-size: 0.8rem;
  transition: background 0.16s ease, border-color 0.16s ease;

  &.on {
    background: var(--navy-800);
    border-color: var(--navy-800);
  }
}

.remember-text {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  font-size: 0.92rem;

  small {
    font-weight: 400;
    font-size: 0.78rem;
    color: var(--ink-400);
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
