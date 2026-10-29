<script setup lang="ts">
import type { BookingStatus } from '@/types';
import { bookingStatusLabel } from '@/utils/format';

defineProps<{ status: BookingStatus }>();

const styles: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300',
  PAID: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
  CANCELLED: 'bg-slate-500/10 text-slate-600 ring-slate-500/30 dark:text-slate-300',
  EXPIRED: 'bg-slate-500/10 text-slate-500 ring-slate-500/20 dark:text-slate-400',
  REFUNDED: 'bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300',
};
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset" :class="styles[status]">
    <span class="h-1.5 w-1.5 rounded-full bg-current" :class="{ 'animate-pulse': status === 'PENDING' }" />
    {{ bookingStatusLabel(status) }}
  </span>
</template>
