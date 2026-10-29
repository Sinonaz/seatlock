<script setup lang="ts">
import { t } from '@/i18n';
import { useAppConfigStore } from '@/stores/appConfig';
import { AlertTriangle } from 'lucide-vue-next';

defineProps<{ message: string }>();
const emit = defineEmits<{ (e: 'retry'): void }>();

const appConfig = useAppConfigStore();
</script>

<template>
  <div class="card flex flex-col items-center gap-3 px-6 py-12 text-center">
    <AlertTriangle class="h-8 w-8 text-amber-500" />
    <p class="max-w-md text-sm text-slate-600 dark:text-slate-300">{{ message }}</p>
    <div class="flex flex-wrap justify-center gap-2">
      <button type="button" class="btn-secondary" @click="emit('retry')">{{ t('common.retry') }}</button>
      <button v-if="!appConfig.isMockMode" type="button" class="btn-secondary" @click="appConfig.setMockMode(true)">
        {{ t('common.enableMock') }}
      </button>
    </div>
  </div>
</template>
