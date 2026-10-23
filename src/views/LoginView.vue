<script setup lang="ts">
import { shallowRef } from 'vue'
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

async function submit() {
  error.value = ''
  try {
    await userStore.login(email.value, password.value)
    router.replace((route.query.next as string | undefined) ?? '/')
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

      <div class="field">
        <label for="email">Correo</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required />
      </div>

      <div class="field">
        <label for="password">Contraseña</label>
        <PasswordInput id="password" v-model="password" />
      </div>

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
  background: var(--powder-300) url('/brand/pattern.jpg') center / cover no-repeat;
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

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
</style>
