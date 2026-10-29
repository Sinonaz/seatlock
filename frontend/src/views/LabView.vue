<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onMounted, ref } from 'vue';
import { apiClient, ApiError } from '@/api/client';
import { bookingsApi } from '@/api/bookingsApi';
import { eventsApi } from '@/api/eventsApi';
import { useToastStore } from '@/stores/toastStore';
import type { Booking, EventItem } from '@/types';
import { FlaskConical, Loader2, Play, Trash2 } from 'lucide-vue-next';

// Fires N booking requests at once to prove the backend never oversells
// and that a repeated Idempotency-Key never creates a second booking.

type Mode = 'race' | 'idempotency';

interface Shot {
  index: number;
  status: number | null;
  bookingId: string | null;
  code: string | null;
  message: string;
  ms: number;
}

const toasts = useToastStore();

const events = ref<EventItem[]>([]);
const eventId = ref('');
const parallel = ref(10);
const mode = ref<Mode>('race');
const isRunning = ref(false);
const shots = ref<Shot[]>([]);
const seatsBefore = ref<number | null>(null);
const seatsAfter = ref<number | null>(null);

const selectedEvent = computed(() => events.value.find((e) => e.id === eventId.value));
const createdIds = computed(() => [...new Set(shots.value.filter((s) => s.bookingId).map((s) => s.bookingId!))]);
const summary = computed(() => ({
  created: shots.value.filter((s) => s.status === 201).length,
  replayed: shots.value.filter((s) => s.status === 200).length,
  rejected: shots.value.filter((s) => s.status !== null && s.status >= 400).length,
  uniqueBookings: createdIds.value.length,
}));

async function loadEvents() {
  const res = await eventsApi.getEvents({ limit: 50 });
  events.value = res.items;
  if (!eventId.value) {
    eventId.value = (res.items.find((e) => e.capacity <= 10 && e.availableSeats > 0) ?? res.items[0])?.id ?? '';
  }
}

onMounted(() => loadEvents().catch((e) => toasts.error((e as Error).message)));

async function run() {
  if (!selectedEvent.value) return;
  isRunning.value = true;
  shots.value = [];
  seatsAfter.value = null;
  seatsBefore.value = (await eventsApi.getEvent(eventId.value)).availableSeats;

  const sharedKey = crypto.randomUUID();
  const fire = async (index: number): Promise<Shot> => {
    const started = performance.now();
    const key = mode.value === 'idempotency' ? sharedKey : crypto.randomUUID();
    try {
      const res = await apiClient.post<Booking>(
        '/bookings',
        { eventId: eventId.value, quantity: 1 },
        { headers: { 'Idempotency-Key': key } },
      );
      return { index, status: res.status, bookingId: res.data.id, code: null, message: res.data.status, ms: performance.now() - started };
    } catch (e) {
      const err = e as ApiError;
      return { index, status: err.status ?? null, bookingId: null, code: err.code ?? null, message: err.message, ms: performance.now() - started };
    }
  };

  // All requests leave the browser at the same moment
  shots.value = await Promise.all(Array.from({ length: parallel.value }, (_, i) => fire(i + 1)));
  seatsAfter.value = (await eventsApi.getEvent(eventId.value)).availableSeats;
  await loadEvents();
  isRunning.value = false;
}

async function cleanup() {
  const ids = createdIds.value;
  await Promise.allSettled(ids.map((id) => bookingsApi.cancelBooking(id)));
  toasts.success(t('lab.cleaned', { count: ids.length }));
  shots.value = [];
  seatsBefore.value = null;
  seatsAfter.value = null;
  await loadEvents();
}

function statusClass(status: number | null) {
  if (status === 201) return 'text-emerald-600 dark:text-emerald-400';
  if (status === 200) return 'text-sky-600 dark:text-sky-400';
  return 'text-rose-600 dark:text-rose-400';
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="page-title flex items-center gap-2"><FlaskConical class="h-7 w-7 text-violet-500" /> {{ t('lab.title') }}</h1>
      <p class="mt-2 max-w-3xl text-sm text-slate-500">
        <template v-for="(part, i) in t('lab.intro').split(/\{(endpoint|header)\}/)" :key="i">
          <code v-if="part === 'endpoint'">POST /api/bookings</code>
          <code v-else-if="part === 'header'">Idempotency-Key</code>
          <template v-else>{{ part }}</template>
        </template>
      </p>
    </div>

    <div class="card grid gap-4 p-5 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
      <div>
        <label class="label" for="lab-event">{{ t('lab.event') }}</label>
        <select id="lab-event" v-model="eventId" class="input">
          <option v-for="event in events" :key="event.id" :value="event.id">
            {{ t('lab.eventOption', { title: event.title, available: event.availableSeats, capacity: event.capacity }) }}
          </option>
        </select>
      </div>
      <div>
        <label class="label" for="lab-parallel">{{ t('lab.requests') }}</label>
        <input id="lab-parallel" v-model.number="parallel" class="input w-24" type="number" min="2" max="50" />
      </div>
      <div>
        <span class="label">{{ t('lab.scenario') }}</span>
        <div class="flex rounded-xl border border-slate-200 p-0.5 text-xs font-semibold dark:border-white/10">
          <button
            type="button"
            class="rounded-lg px-3 py-2 cursor-pointer"
            :class="mode === 'race' ? 'bg-violet-600 text-white' : 'text-slate-500'"
            @click="mode = 'race'"
          >
            {{ t('lab.race') }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 cursor-pointer"
            :class="mode === 'idempotency' ? 'bg-violet-600 text-white' : 'text-slate-500'"
            @click="mode = 'idempotency'"
          >
            {{ t('lab.sameKey') }}
          </button>
        </div>
      </div>
      <button type="button" class="btn-primary" :disabled="isRunning || !selectedEvent" @click="run">
        <Loader2 v-if="isRunning" class="h-4 w-4 animate-spin" />
        <Play v-else class="h-4 w-4" />
        {{ t('lab.run') }}
      </button>
    </div>

    <p class="text-xs text-slate-500">
      <template v-if="mode === 'race'">
        {{ t('lab.raceHint') }}
      </template>
      <template v-else>
        {{ t('lab.keyHint') }}
      </template>
    </p>

    <template v-if="shots.length">
      <div class="grid gap-3 sm:grid-cols-4">
        <div class="card p-4">
          <p class="text-xs text-slate-500">{{ t('lab.seatsBeforeAfter') }}</p>
          <p class="text-2xl font-bold">{{ seatsBefore }} → {{ seatsAfter }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-slate-500">201 Created</p>
          <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ summary.created }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-slate-500">200 Replay</p>
          <p class="text-2xl font-bold text-sky-600 dark:text-sky-400">{{ summary.replayed }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-slate-500">{{ t('lab.rejected') }}</p>
          <p class="text-2xl font-bold text-rose-600 dark:text-rose-400">{{ summary.rejected }}</p>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-xs text-slate-500 dark:border-white/10">
            <tr>
              <th class="px-4 py-3">#</th>
              <th class="px-4 py-3">HTTP</th>
              <th class="px-4 py-3">{{ t('lab.result') }}</th>
              <th class="px-4 py-3 text-right">{{ t('lab.ms') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shot in shots" :key="shot.index" class="border-b border-slate-100 last:border-0 dark:border-white/5">
              <td class="px-4 py-2 text-slate-400">{{ shot.index }}</td>
              <td class="px-4 py-2 font-mono font-bold" :class="statusClass(shot.status)">{{ shot.status ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs">
                <template v-if="shot.bookingId">{{ shot.bookingId }}</template>
                <template v-else>{{ shot.code ?? '' }} {{ shot.message }}</template>
              </td>
              <td class="px-4 py-2 text-right text-slate-400 tabular-nums">{{ Math.round(shot.ms) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button v-if="createdIds.length" type="button" class="btn-secondary" @click="cleanup">
        <Trash2 class="h-4 w-4" /> {{ t('lab.cleanup', { count: createdIds.length }) }}
      </button>
    </template>
  </div>
</template>
