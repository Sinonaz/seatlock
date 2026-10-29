<script setup lang="ts">
import { computed } from 'vue';
import { coverGradient, formatDay } from '@/utils/format';

const props = defineProps<{
  id: string;
  title: string;
  startsAt: string;
  coverImageUrl: string | null;
  large?: boolean;
}>();

const day = computed(() => formatDay(props.startsAt));
</script>

<template>
  <div
    class="relative overflow-hidden bg-gradient-to-br"
    :class="[coverGradient(id), large ? 'h-56 sm:h-72' : 'h-36']"
  >
    <img
      v-if="coverImageUrl"
      :src="coverImageUrl"
      :alt="title"
      class="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
    />
    <div v-else class="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_60%,white_0,transparent_35%)]" />
    <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
    <div class="absolute top-3 left-3 flex flex-col items-center rounded-xl bg-white/90 px-2.5 py-1.5 text-slate-900 shadow-sm backdrop-blur">
      <span class="text-[10px] font-bold tracking-wider text-violet-600 uppercase">{{ day.month }}</span>
      <span class="text-xl leading-none font-extrabold">{{ day.day }}</span>
      <span class="text-[10px] text-slate-500">{{ day.weekday }}</span>
    </div>
    <slot />
  </div>
</template>
