<script setup lang="ts">
import { t } from '@/i18n';
import { onMounted, ref, watch } from 'vue';
import { eventsApi } from '@/api/eventsApi';
import type { EventItem, PaginationMeta } from '@/types';
import { ChevronLeft, ChevronRight, Search } from 'lucide-vue-next';
import EventCard from '@/components/events/EventCard.vue';
import ErrorState from '@/components/common/ErrorState.vue';

const PAGE_SIZE = 6;

const events = ref<EventItem[]>([]);
const meta = ref<PaginationMeta | null>(null);
const page = ref(1);
const search = ref('');
const isLoading = ref(true);
const error = ref<string | null>(null);

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await eventsApi.getEvents({ page: page.value, limit: PAGE_SIZE, search: search.value || undefined });
    events.value = res.items;
    meta.value = res.meta;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 300);
});

function goTo(nextPage: number) {
  page.value = nextPage;
  load();
}

onMounted(load);
</script>

<template>
  <div class="space-y-8">
    <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-700 to-pink-600 px-6 py-10 text-white sm:px-10">
      <div class="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div class="relative max-w-2xl">
        <p class="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">{{ t('events.kicker') }}</p>
        <h1 class="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{{ t('events.heroTitle') }}</h1>
        <p class="mt-3 text-sm text-white/80 sm:text-base">
          {{ t('events.heroText') }}
        </p>
        <div class="relative mt-6">
          <Search class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            v-model="search"
            type="search"
            :placeholder="t('events.searchPlaceholder')"
            class="w-full rounded-xl border-0 bg-white py-3 pr-4 pl-10 text-sm text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/30"
          />
        </div>
      </div>
    </section>

    <ErrorState v-if="error" :message="error" @retry="load" />

    <div v-else-if="isLoading" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in PAGE_SIZE" :key="i" class="card h-80 animate-pulse" />
    </div>

    <div v-else-if="events.length === 0" class="card px-6 py-16 text-center text-sm text-slate-500">
      {{ search ? t('events.nothingFoundFor', { query: search }) : t('events.nothingFound') }}
    </div>

    <template v-else>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <EventCard v-for="event in events" :key="event.id" :event="event" />
      </div>

      <div v-if="meta && meta.totalPages > 1" class="flex items-center justify-center gap-3">
        <button type="button" class="btn-secondary !px-3" :disabled="meta.page <= 1" :aria-label="t('events.prev')" @click="goTo(meta.page - 1)">
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span class="text-sm text-slate-500">{{ t('events.pagination', { page: meta.page, totalPages: meta.totalPages, total: meta.total }) }}</span>
        <button type="button" class="btn-secondary !px-3" :disabled="meta.page >= meta.totalPages" :aria-label="t('events.next')" @click="goTo(meta.page + 1)">
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
    </template>
  </div>
</template>
