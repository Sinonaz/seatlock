<script setup lang="ts">
import type { BookingStatus } from '@/types';
import { bookingStatusLabel } from '@/utils/format';

// Visualizes the booking state machine and the current position in it
const props = defineProps<{ status: BookingStatus }>();

const finals: BookingStatus[] = ['CANCELLED', 'EXPIRED'];

function stepClass(step: BookingStatus) {
  if (step === props.status) return 'bg-violet-600 text-white ring-violet-600';
  return 'bg-transparent text-slate-400 ring-slate-300 dark:ring-white/15';
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
    <span class="rounded-full px-2.5 py-1 ring-1" :class="stepClass('PENDING')">{{ bookingStatusLabel('PENDING') }}</span>
    <span class="text-slate-400">→</span>
    <span class="rounded-full px-2.5 py-1 ring-1" :class="stepClass('PAID')">{{ bookingStatusLabel('PAID') }}</span>
    <span class="text-slate-400">→</span>
    <span class="rounded-full px-2.5 py-1 ring-1" :class="stepClass('REFUNDED')">{{ bookingStatusLabel('REFUNDED') }}</span>
    <span class="mx-1 h-4 w-px bg-slate-300 dark:bg-white/15" />
    <span v-for="final in finals" :key="final" class="rounded-full px-2.5 py-1 ring-1" :class="stepClass(final)">
      {{ bookingStatusLabel(final) }}
    </span>
  </div>
</template>
