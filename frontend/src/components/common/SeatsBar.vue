<script setup lang="ts">
import { t } from '@/i18n';
import { computed } from 'vue';

const props = defineProps<{ available: number; capacity: number }>();

const soldPercent = computed(() =>
  props.capacity > 0 ? Math.round(((props.capacity - props.available) / props.capacity) * 100) : 100,
);
const tone = computed(() => {
  if (props.available === 0) return { bar: 'bg-slate-400', text: 'text-slate-500' };
  if (props.available <= Math.max(5, props.capacity * 0.05)) return { bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' };
  return { bar: 'bg-violet-500', text: 'text-slate-600 dark:text-slate-300' };
});
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-center justify-between text-xs">
      <span class="font-semibold" :class="tone.text">
        <template v-if="available === 0">{{ t('seats.none') }}</template>
        <template v-else>{{ t('seats.left', { available, capacity }) }}</template>
      </span>
      <span class="text-slate-400">{{ t('seats.soldPercent', { percent: soldPercent }) }}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
      <div class="h-full rounded-full transition-all duration-500" :class="tone.bar" :style="{ width: `${soldPercent}%` }" />
    </div>
  </div>
</template>
