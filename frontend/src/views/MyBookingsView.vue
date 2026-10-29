<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onMounted, ref } from 'vue';
import { bookingsApi } from '@/api/bookingsApi';
import type { Booking, BookingStatus } from '@/types';
import { bookingStatusLabel, coverGradient, formatDateTime, formatMoney } from '@/utils/format';
import BookingStatusBadge from '@/components/common/BookingStatusBadge.vue';
import ErrorState from '@/components/common/ErrorState.vue';

const bookings = ref<Booking[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const filter = ref<BookingStatus | 'ALL'>('ALL');

const filters: Array<BookingStatus | 'ALL'> = ['ALL', 'PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
const visible = computed(() =>
  filter.value === 'ALL' ? bookings.value : bookings.value.filter((b) => b.status === filter.value),
);

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    bookings.value = await bookingsApi.getMyBookings();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="page-title">{{ t('myBookings.title') }}</h1>

    <div class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="item in filters"
        :key="item"
        type="button"
        class="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
        :class="filter === item ? 'bg-violet-600 text-white' : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300'"
        @click="filter = item"
      >
        {{ item === 'ALL' ? t('myBookings.all') : bookingStatusLabel(item) }}
      </button>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <div v-else-if="isLoading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card h-24 animate-pulse" />
    </div>
    <div v-else-if="visible.length === 0" class="card px-6 py-16 text-center text-sm text-slate-500">
      {{ t('myBookings.empty') }} <RouterLink to="/" class="font-semibold text-violet-600">{{ t('myBookings.pickEvent') }}</RouterLink>
    </div>

    <ul v-else class="space-y-3">
      <li v-for="booking in visible" :key="booking.id">
        <RouterLink
          :to="`/bookings/${booking.id}`"
          class="card flex items-center gap-4 p-3 pr-5 transition-colors hover:border-violet-400/60"
        >
          <div class="h-16 w-16 shrink-0 rounded-xl bg-gradient-to-br" :class="coverGradient(booking.event.id)" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ booking.event.title }}</p>
            <p class="text-xs text-slate-500">{{ formatDateTime(booking.event.startsAt) }} · {{ t('myBookings.pcs', { count: booking.quantity }) }}</p>
          </div>
          <div class="hidden text-right sm:block">
            <p class="font-semibold">{{ formatMoney(booking.totalCents, booking.currency) }}</p>
            <p class="text-xs text-slate-500">{{ formatDateTime(booking.createdAt) }}</p>
          </div>
          <BookingStatusBadge :status="booking.status" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
