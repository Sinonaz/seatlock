<script setup lang="ts">
import { t } from '@/i18n';
import type { Booking } from '@/types';
import { formatDateTime } from '@/utils/format';

defineProps<{ booking: Booking }>();

// Decorative pseudo-barcode derived from the ticket code
function bars(code: string) {
  return Array.from(code.replace(/-/g, '') + code.replace(/-/g, '').split('').reverse().join(''), (char) =>
    (char.charCodeAt(0) % 3) + 1,
  );
}
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-pink-500 p-[1px]">
    <div class="flex flex-col rounded-2xl bg-white sm:flex-row dark:bg-[#15121f]">
      <div class="flex-1 space-y-2 p-5">
        <p class="text-[10px] font-bold tracking-[0.2em] text-violet-600 uppercase dark:text-violet-300">{{ t('ticket.eTicket') }}</p>
        <p class="text-lg font-bold">{{ booking.event.title }}</p>
        <p class="text-sm text-slate-500">{{ formatDateTime(booking.event.startsAt) }} · {{ booking.event.venue }}</p>
        <p class="text-sm">{{ t('ticket.seats') }} <strong>{{ booking.quantity }}</strong></p>
      </div>
      <div class="flex flex-col items-center justify-center gap-2 border-t-2 border-dashed border-slate-200 p-5 sm:border-t-0 sm:border-l-2 dark:border-white/10">
        <div class="flex h-14 items-stretch gap-[2px]" aria-hidden="true">
          <span v-for="(width, i) in bars(booking.ticketCode ?? '')" :key="i" class="bg-slate-900 dark:bg-white" :style="{ width: `${width}px` }" />
        </div>
        <span class="font-mono text-sm font-bold tracking-widest">{{ booking.ticketCode }}</span>
      </div>
    </div>
  </div>
</template>
