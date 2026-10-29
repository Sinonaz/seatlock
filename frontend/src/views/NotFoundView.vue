<script setup lang="ts">
import { t } from '@/i18n';
</script>

<template>
  <div class="py-24 text-center">
    <p class="text-6xl font-extrabold text-violet-600">404</p>
    <p class="mt-3 text-slate-500">{{ t('notFound.text') }}</p>
    <RouterLink to="/" class="btn-secondary mt-6">{{ t('notFound.back') }}</RouterLink>
  </div>
</template>
