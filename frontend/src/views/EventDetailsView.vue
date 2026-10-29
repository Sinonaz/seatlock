<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { eventsApi } from '@/api/eventsApi';
import { bookingsApi } from '@/api/bookingsApi';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useIdempotencyKey } from '@/utils/useIdempotencyKey';
import { formatDateTime, formatMoney, formatPrice } from '@/utils/format';
import type { EventItem } from '@/types';
import { ArrowLeft, CalendarDays, Loader2, MapPin, Minus, Plus, ShieldCheck, User } from 'lucide-vue-next';
import EventCover from '@/components/events/EventCover.vue';
import SeatsBar from '@/components/common/SeatsBar.vue';
import ErrorState from '@/components/common/ErrorState.vue';

const props = defineProps<{ id: string }>();

const auth = useAuthStore();
const toasts = useToastStore();
const router = useRouter();
const route = useRoute();
const idempotency = useIdempotencyKey();

const event = ref<EventItem | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);
const quantity = ref(1);
const isBooking = ref(false);
const lastKey = ref<string | null>(null);

const MAX_PER_BOOKING = 10;
const maxQuantity = computed(() => Math.min(MAX_PER_BOOKING, event.value?.availableSeats ?? 0));
const total = computed(() => (event.value ? event.value.priceCents * quantity.value : 0));
const isPast = computed(() => !!event.value && new Date(event.value.startsAt).getTime() < Date.now());
const canBook = computed(() => event.value?.status === 'PUBLISHED' && maxQuantity.value > 0 && !isPast.value);

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    event.value = await eventsApi.getEvent(props.id);
    quantity.value = Math.max(1, Math.min(quantity.value, maxQuantity.value));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);

async function book() {
  if (!event.value) return;
  if (!auth.isAuthenticated) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }

  isBooking.value = true;
  // Same intent (event + quantity) -> same key, so a retry after a timeout is safe
  const key = idempotency.forIntent(`${event.value.id}:${quantity.value}`);
  lastKey.value = key;
  try {
    const booking = await bookingsApi.createBooking({ eventId: event.value.id, quantity: quantity.value }, key);
    idempotency.reset();
    toasts.success(t('event.reserved'));
    router.push(`/bookings/${booking.id}`);
  } catch (e) {
    const err = e as ApiError;
    toasts.error(err.message, err.code === 'NOT_ENOUGH_SEATS' ? t('event.seatsGone') : t('event.bookingFailed'));
    if (err.code === 'NOT_ENOUGH_SEATS' || err.code === 'EVENT_NOT_AVAILABLE') {
      idempotency.reset();
      await load();
    }
  } finally {
    isBooking.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <RouterLink to="/" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-600">
      <ArrowLeft class="h-4 w-4" /> {{ t('event.allEvents') }}
    </RouterLink>

    <ErrorState v-if="error" :message="error" @retry="load" />

    <div v-else-if="isLoading || !event" class="card h-96 animate-pulse" />

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <article class="card overflow-hidden">
        <EventCover :id="event.id" :title="event.title" :starts-at="event.startsAt" :cover-image-url="event.coverImageUrl" large />
        <div class="space-y-5 p-6">
          <div>
            <span
              v-if="event.status === 'CANCELLED'"
              class="mb-2 inline-flex rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-600 uppercase"
            >
              {{ t('event.cancelled') }}
            </span>
            <h1 class="page-title">{{ event.title }}</h1>
          </div>
          <dl class="grid gap-3 text-sm sm:grid-cols-3">
            <div class="flex items-start gap-2">
              <CalendarDays class="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <div>
                <dt class="text-xs text-slate-500">{{ t('event.when') }}</dt>
                <dd class="font-medium">{{ formatDateTime(event.startsAt) }}</dd>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <MapPin class="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <div>
                <dt class="text-xs text-slate-500">{{ t('event.where') }}</dt>
                <dd class="font-medium">{{ event.venue }}, {{ event.city }}</dd>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <User class="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <div>
                <dt class="text-xs text-slate-500">{{ t('event.organizer') }}</dt>
                <dd class="font-medium">{{ event.organizer.name }}</dd>
              </div>
            </div>
          </dl>
          <p class="text-sm leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-300">{{ event.description }}</p>
        </div>
      </article>

      <aside class="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div class="card space-y-5 p-5">
          <div class="flex items-baseline justify-between">
            <span class="text-sm text-slate-500">{{ t('event.ticketPrice') }}</span>
            <span class="text-2xl font-extrabold">{{ formatPrice(event.priceCents, event.currency) }}</span>
          </div>

          <SeatsBar :available="event.availableSeats" :capacity="event.capacity" />

          <template v-if="canBook">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{{ t('event.quantity') }}</span>
              <div class="flex items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-white/10">
                <button
                  type="button"
                  class="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10 cursor-pointer"
                  :disabled="quantity <= 1"
                  :aria-label="t('event.less')"
                  @click="quantity--"
                >
                  <Minus class="h-4 w-4" />
                </button>
                <span class="w-8 text-center font-semibold tabular-nums">{{ quantity }}</span>
                <button
                  type="button"
                  class="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10 cursor-pointer"
                  :disabled="quantity >= maxQuantity"
                  :aria-label="t('event.more')"
                  @click="quantity++"
                >
                  <Plus class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="flex items-baseline justify-between border-t border-slate-200 pt-4 dark:border-white/10">
              <span class="text-sm text-slate-500">{{ t('event.total') }}</span>
              <span class="text-xl font-bold">{{ formatMoney(total, event.currency) }}</span>
            </div>

            <button type="button" class="btn-primary w-full !py-3" :disabled="isBooking" @click="book">
              <Loader2 v-if="isBooking" class="h-4 w-4 animate-spin" />
              {{ auth.isAuthenticated ? t('event.book') : t('event.loginToBook') }}
            </button>
          </template>

          <p v-else class="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
            {{ event.status === 'CANCELLED' ? t('event.salesClosed') : isPast ? t('event.past') : t('event.noSeats') }}
          </p>
        </div>

        <div class="card flex gap-3 p-4 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck class="h-5 w-5 shrink-0 text-emerald-500" />
          <div class="space-y-1">
            <p>
              <template v-for="(part, i) in t('event.idempotencyHint').split('{header}')" :key="i">
                <code v-if="i > 0" class="text-violet-600 dark:text-violet-300">Idempotency-Key</code>{{ part }}
              </template>
            </p>
            <p v-if="lastKey" class="font-mono break-all text-[11px]">{{ lastKey }}</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
