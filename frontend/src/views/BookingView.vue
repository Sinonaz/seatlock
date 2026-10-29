<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bookingsApi } from '@/api/bookingsApi';
import { useToastStore } from '@/stores/toastStore';
import { useCountdown } from '@/utils/useCountdown';
import { formatDateTime, formatMoney } from '@/utils/format';
import type { Booking } from '@/types';
import { ArrowLeft, CreditCard, Loader2, Timer, XCircle } from 'lucide-vue-next';
import BookingStatusBadge from '@/components/common/BookingStatusBadge.vue';
import ErrorState from '@/components/common/ErrorState.vue';
import StatusFlow from '@/components/bookings/StatusFlow.vue';
import TicketStub from '@/components/bookings/TicketStub.vue';

const props = defineProps<{ id: string }>();

const route = useRoute();
const router = useRouter();
const toasts = useToastStore();

const booking = ref<Booking | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isPaying = ref(false);
const isCancelling = ref(false);
const isAwaitingWebhook = ref(false);

const deadline = computed(() => (booking.value?.status === 'PENDING' ? booking.value.expiresAt : null));
const countdown = useCountdown(deadline);

const REFUND_WINDOW_HOURS = 24;
const canRefund = computed(
  () =>
    booking.value?.status === 'PAID' &&
    new Date(booking.value.event.startsAt).getTime() - Date.now() > REFUND_WINDOW_HOURS * 3_600_000,
);

async function load(silent = false) {
  if (!silent) isLoading.value = true;
  error.value = null;
  try {
    booking.value = await bookingsApi.getBooking(props.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

// After Stripe redirects back, the webhook may arrive a few seconds later: poll until PAID
let pollTimer: ReturnType<typeof setInterval> | undefined;
function startPolling() {
  isAwaitingWebhook.value = true;
  let attempts = 0;
  pollTimer = setInterval(async () => {
    attempts++;
    await load(true);
    if (booking.value?.status !== 'PENDING' || attempts >= 15) {
      stopPolling();
      if (booking.value?.status === 'PAID') toasts.success(t('booking.paidToast'));
    }
  }, 2000);
}
function stopPolling() {
  clearInterval(pollTimer);
  isAwaitingWebhook.value = false;
}
onBeforeUnmount(stopPolling);

// Stripe returns with ?payment=...; a free booking is redirected here by the backend the same way
async function handlePaymentReturn() {
  const payment = route.query.payment;
  if (!payment) return;
  router.replace({ query: {} });
  if (payment === 'cancelled') {
    toasts.info(t('booking.paymentCancelled'));
    return;
  }
  await load(true);
  if (booking.value?.status === 'PENDING') startPolling();
  else if (booking.value?.status === 'PAID') toasts.success(t('booking.ticketsYours'));
}

onMounted(async () => {
  await load();
  await handlePaymentReturn();
});

// Same route, new query (e.g. instant confirmation of a free booking) does not remount the view
watch(() => route.query.payment, handlePaymentReturn);

// When the timer hits zero the backend job will expire the booking; refresh to show it
watch(() => countdown.isOver.value, (over) => {
  if (over) setTimeout(() => load(true), 1500);
});

async function pay() {
  if (!booking.value) return;
  isPaying.value = true;
  try {
    const { checkoutUrl } = await bookingsApi.payBooking(booking.value.id);
    if (checkoutUrl.startsWith('/')) {
      await router.push(checkoutUrl);
      isPaying.value = false;
    } else {
      window.location.href = checkoutUrl;
    }
  } catch (e) {
    toasts.error((e as Error).message, t('booking.paymentUnavailable'));
    await load(true);
    isPaying.value = false;
  }
}

async function cancel() {
  if (!booking.value) return;
  const isRefund = booking.value.status === 'PAID';
  const question = isRefund
    ? t('booking.confirmRefund')
    : t('booking.confirmCancel');
  if (!window.confirm(question)) return;

  isCancelling.value = true;
  try {
    booking.value = await bookingsApi.cancelBooking(booking.value.id);
    toasts.success(isRefund ? t('booking.refunded') : t('booking.cancelled'));
  } catch (e) {
    toasts.error((e as Error).message);
    await load(true);
  } finally {
    isCancelling.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <RouterLink to="/bookings" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-600">
      <ArrowLeft class="h-4 w-4" /> {{ t('booking.back') }}
    </RouterLink>

    <ErrorState v-if="error" :message="error" @retry="load()" />
    <div v-else-if="isLoading || !booking" class="card h-80 animate-pulse" />

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-mono text-slate-400">{{ t('booking.id', { id: booking.id }) }}</p>
          <h1 class="page-title mt-1">
            <RouterLink :to="`/events/${booking.event.id}`" class="hover:text-violet-600">{{ booking.event.title }}</RouterLink>
          </h1>
          <p class="mt-1 text-sm text-slate-500">{{ formatDateTime(booking.event.startsAt) }} · {{ booking.event.venue }}, {{ booking.event.city }}</p>
        </div>
        <BookingStatusBadge :status="booking.status" />
      </div>

      <StatusFlow :status="booking.status" />

      <!-- Awaiting webhook after returning from Stripe -->
      <div v-if="isAwaitingWebhook" class="card flex items-center gap-3 border-violet-300 p-4 text-sm dark:border-violet-500/30">
        <Loader2 class="h-5 w-5 animate-spin text-violet-500" />
        {{ t('booking.awaitingWebhook') }}
      </div>

      <!-- PENDING: timer + pay -->
      <div v-if="booking.status === 'PENDING'" class="card overflow-hidden">
        <div class="flex flex-col items-center gap-2 bg-amber-500/10 px-6 py-6 text-center">
          <span class="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Timer class="h-4 w-4" /> {{ t('booking.holdingFor') }}
          </span>
          <span class="font-mono text-5xl font-extrabold tabular-nums" :class="countdown.msLeft.value < 60_000 ? 'text-rose-500' : ''">
            {{ countdown.label.value }}
          </span>
          <span v-if="countdown.isOver.value" class="text-xs text-slate-500">{{ t('booking.timeUp') }}</span>
        </div>
        <div class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-sm">
            {{ booking.quantity }} × {{ formatMoney(booking.unitPriceCents, booking.currency) }} =
            <strong class="text-lg">{{ formatMoney(booking.totalCents, booking.currency) }}</strong>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-danger" :disabled="isCancelling" @click="cancel">
              <XCircle class="h-4 w-4" /> {{ t('booking.cancel') }}
            </button>
            <button type="button" class="btn-primary" :disabled="isPaying || countdown.isOver.value" @click="pay">
              <Loader2 v-if="isPaying" class="h-4 w-4 animate-spin" />
              <CreditCard v-else class="h-4 w-4" />
              {{ t('booking.pay') }}
            </button>
          </div>
        </div>
      </div>

      <!-- PAID: ticket -->
      <template v-if="booking.status === 'PAID'">
        <TicketStub :booking="booking" />
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>{{ t('booking.paidAt', { date: booking.paidAt ? formatDateTime(booking.paidAt) : '' }) }} · {{ formatMoney(booking.totalCents, booking.currency) }}</span>
          <button v-if="canRefund" type="button" class="btn-danger" :disabled="isCancelling" @click="cancel">
            {{ t('booking.refund') }}
          </button>
          <span v-else class="text-xs">{{ t('booking.refundWindow', { hours: REFUND_WINDOW_HOURS }) }}</span>
        </div>
      </template>

      <!-- Final states -->
      <div
        v-if="['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(booking.status)"
        class="card space-y-3 p-6 text-center text-sm text-slate-600 dark:text-slate-300"
      >
        <p v-if="booking.status === 'EXPIRED'">{{ t('booking.expiredText') }}</p>
        <p v-else-if="booking.status === 'REFUNDED'">{{ t('booking.refundedText') }}</p>
        <p v-else>{{ booking.cancelledAt ? t('booking.cancelledAtText', { date: formatDateTime(booking.cancelledAt) }) : t('booking.cancelledText') }}</p>
        <RouterLink :to="`/events/${booking.event.id}`" class="btn-secondary">{{ t('booking.bookAgain') }}</RouterLink>
      </div>
    </template>
  </div>
</template>
