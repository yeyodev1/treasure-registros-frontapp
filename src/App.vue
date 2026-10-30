<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import AppShell from '@/layout/AppShell.vue'
import ToastList from '@/components/ui/ToastList.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PdfViewer from '@/components/ui/PdfViewer.vue'

const route = useRoute()
const userStore = useUserStore()

const showShell = computed(() => !route.meta.public && userStore.isLogged)
</script>

<template>
  <AppShell v-if="showShell">
    <RouterView v-slot="{ Component }">
      <Transition name="view" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppShell>
  <RouterView v-else />
  <ToastList />
  <ConfirmDialog />
  <PdfViewer />
</template>
