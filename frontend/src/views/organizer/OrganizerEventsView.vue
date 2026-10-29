<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onMounted, ref } from 'vue';
import { eventsApi } from '@/api/eventsApi';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { EventStatus, OrganizerEvent } from '@/types';
import { eventStatusLabel, formatDateTime, formatMoney } from '@/utils/format';
import { Ban, Pencil, Plus, Rocket } from 'lucide-vue-next';
import ErrorState from '@/components/common/ErrorState.vue';

const auth = useAuthStore();
const toasts = useToastStore();

const events = ref<OrganizerEvent[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);

const totals = computed(() =>
  events.value.reduce(
    (acc, e) => ({
      revenue: acc.revenue + e.stats.revenueCents,
      paid: acc.paid + e.stats.paidSeats,
      pending: acc.pending + e.stats.pendingSeats,
    }),
    { revenue: 0, paid: 0, pending: 0 },
  ),
);

const statusStyles: Record<EventStatus, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  PUBLISHED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CANCELLED: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    events.value = await eventsApi.getMyEvents();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

async function publish(event: OrganizerEvent) {
  busyId.value = event.id;
  try {
    await eventsApi.publishEvent(event.id);
    toasts.success(t('organizer.published', { title: event.title }));
    await load();
  } catch (e) {
    toasts.error((e as Error).message);
  } finally {
    busyId.value = null;
  }
}

async function cancel(event: OrganizerEvent) {
  const question = t('organizer.confirmCancel', { title: event.title });
  if (!window.confirm(question)) return;
  busyId.value = event.id;
  try {
    await eventsApi.cancelEvent(event.id);
    toasts.success(t('organizer.cancelled'));
    await load();
  } catch (e) {
    toasts.error((e as Error).message);
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="page-title">{{ t('organizer.title') }}</h1>
        <p v-if="auth.hasRole('ADMIN')" class="mt-1 text-sm text-slate-500">{{ t('organizer.adminHint') }}</p>
      </div>
      <RouterLink to="/organizer/events/new" class="btn-primary"><Plus class="h-4 w-4" /> {{ t('organizer.create') }}</RouterLink>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-xs text-slate-500">{{ t('organizer.revenue') }}</p>
        <p class="text-2xl font-bold">{{ formatMoney(totals.revenue) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-slate-500">{{ t('organizer.seatsSold') }}</p>
        <p class="text-2xl font-bold">{{ totals.paid }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-slate-500">{{ t('organizer.reserved') }}</p>
        <p class="text-2xl font-bold">{{ totals.pending }}</p>
      </div>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <div v-else-if="isLoading" class="card h-64 animate-pulse" />
    <div v-else-if="events.length === 0" class="card px-6 py-16 text-center text-sm text-slate-500">
      {{ t('organizer.empty') }}
    </div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead class="border-b border-slate-200 text-xs text-slate-500 dark:border-white/10">
          <tr>
            <th class="px-4 py-3">{{ t('organizer.colEvent') }}</th>
            <th class="px-4 py-3">{{ t('organizer.colStatus') }}</th>
            <th class="px-4 py-3 text-right">{{ t('organizer.colSeats') }}</th>
            <th class="px-4 py-3 text-right">{{ t('organizer.colRevenue') }}</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id" class="border-b border-slate-100 last:border-0 dark:border-white/5">
            <td class="px-4 py-3">
              <RouterLink
                v-if="event.status !== 'DRAFT'"
                :to="`/events/${event.id}`"
                class="font-semibold hover:text-violet-600"
              >
                {{ event.title }}
              </RouterLink>
              <span v-else class="font-semibold">{{ event.title }}</span>
              <p class="text-xs text-slate-500">{{ formatDateTime(event.startsAt) }} · {{ event.organizer.name }}</p>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="statusStyles[event.status]">
                {{ eventStatusLabel(event.status) }}
              </span>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ event.stats.paidSeats }} / {{ event.stats.pendingSeats }} / {{ event.capacity }}
            </td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums">{{ formatMoney(event.stats.revenueCents, event.currency) }}</td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1.5">
                <RouterLink
                  v-if="event.status !== 'CANCELLED'"
                  :to="`/organizer/events/${event.id}/edit`"
                  class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-white/5"
                  :title="t('organizer.edit')"
                >
                  <Pencil class="h-4 w-4" />
                </RouterLink>
                <button
                  v-if="event.status === 'DRAFT'"
                  type="button"
                  class="rounded-lg p-2 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-40 cursor-pointer"
                  :title="t('organizer.publish')"
                  :disabled="busyId === event.id"
                  @click="publish(event)"
                >
                  <Rocket class="h-4 w-4" />
                </button>
                <button
                  v-if="event.status !== 'CANCELLED'"
                  type="button"
                  class="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40 cursor-pointer"
                  :title="t('organizer.cancelEvent')"
                  :disabled="busyId === event.id"
                  @click="cancel(event)"
                >
                  <Ban class="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
