<script setup lang="ts">
import { t } from '@/i18n';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { bookingsApi } from '@/api/bookingsApi';
import { useAppConfigStore } from '@/stores/appConfig';
import { formatMoney } from '@/utils/format';
import type { Booking } from '@/types';
import { CreditCard, Loader2, Lock } from 'lucide-vue-next';

// Stand-in for the hosted Stripe Checkout page, used only in mock mode
const props = defineProps<{ id: string }>();

const router = useRouter();
const appConfig = useAppConfigStore();
const booking = ref<Booking | null>(null);
const isPaying = ref(false);

onMounted(async () => {
  if (!appConfig.isMockMode) {
    router.replace(`/bookings/${props.id}`);
    return;
  }
  booking.value = await bookingsApi.getBooking(props.id);
});

async function pay() {
  isPaying.value = true;
  // Simulates Stripe sending checkout.session.completed to the webhook
  await apiClient.post(`/__mock/checkout/${props.id}/complete`);
  router.replace({ path: `/bookings/${props.id}`, query: { payment: 'success' } });
}

function cancel() {
  router.replace({ path: `/bookings/${props.id}`, query: { payment: 'cancelled' } });
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between bg-[#635bff] px-6 py-4 text-white">
        <span class="font-bold">Test Checkout</span>
        <span class="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">{{ t('checkout.mockMode') }}</span>
      </div>
      <div v-if="booking" class="space-y-5 p-6">
        <div>
          <p class="text-sm text-slate-500">{{ booking.event.title }} × {{ booking.quantity }}</p>
          <p class="text-3xl font-extrabold">{{ formatMoney(booking.totalCents, booking.currency) }}</p>
        </div>
        <div>
          <label class="label" for="card">{{ t('checkout.card') }}</label>
          <input id="card" class="input font-mono" value="4242 4242 4242 4242" disabled />
          <p class="mt-1.5 text-xs text-slate-500">{{ t('checkout.liveHint') }}</p>
        </div>
        <button type="button" class="btn w-full bg-[#635bff] !py-3 text-white hover:bg-[#7a73ff]" :disabled="isPaying" @click="pay">
          <Loader2 v-if="isPaying" class="h-4 w-4 animate-spin" />
          <CreditCard v-else class="h-4 w-4" />
          {{ t('checkout.pay') }}
        </button>
        <button type="button" class="w-full text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer" @click="cancel">
          {{ t('checkout.back') }}
        </button>
        <p class="flex items-center justify-center gap-1 text-[11px] text-slate-400"><Lock class="h-3 w-3" /> {{ t('checkout.simulated') }}</p>
      </div>
      <div v-else class="h-72 animate-pulse" />
    </div>
  </div>
</template>
