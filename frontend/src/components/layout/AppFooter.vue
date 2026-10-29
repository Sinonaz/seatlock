<script setup lang="ts">
import { t } from '@/i18n';
import { useAppConfigStore } from '@/stores/appConfig';
import { API_URL } from '@/api/client';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/api/mock/mockData';

const appConfig = useAppConfigStore();
</script>

<template>
  <footer class="mt-auto border-t border-slate-200 py-6 text-xs text-slate-500 dark:border-white/[0.07] dark:text-slate-400">
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold text-slate-700 dark:text-slate-300">SeatLock</span>
        <span>&bull;</span>
        <span>Vue 3 + NestJS + PostgreSQL + Stripe</span>
      </div>
      <div class="flex flex-wrap items-center gap-3 font-mono">
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          :class="appConfig.isMockMode ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'"
        >
          {{ appConfig.isMockMode ? 'MOCK DATA' : 'LIVE API' }}
        </span>
        <span>API: <code>{{ appConfig.isMockMode ? t('footer.inBrowser') : API_URL }}</code></span>
        <button
          v-if="appConfig.isMockMode"
          type="button"
          class="underline decoration-dotted hover:text-violet-600 cursor-pointer"
          :title="t('footer.demoAccounts', { accounts: DEMO_ACCOUNTS.map((a) => a.email).join(', '), password: DEMO_PASSWORD })"
          @click="appConfig.resetMockData"
        >
          {{ t('footer.resetMock') }}
        </button>
      </div>
    </div>
  </footer>
</template>
