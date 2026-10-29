<script setup lang="ts">
import { t } from '@/i18n';
import type { EventItem } from '@/types';
import { formatDateTime, formatPrice } from '@/utils/format';
import { MapPin } from 'lucide-vue-next';
import EventCover from './EventCover.vue';
import SeatsBar from '@/components/common/SeatsBar.vue';

defineProps<{ event: EventItem }>();
</script>

<template>
  <RouterLink
    :to="`/events/${event.id}`"
    class="card group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-violet-400/60 hover:shadow-xl hover:shadow-violet-600/10"
  >
    <EventCover :id="event.id" :title="event.title" :starts-at="event.startsAt" :cover-image-url="event.coverImageUrl">
      <span
        v-if="event.availableSeats === 0"
        class="absolute top-3 right-3 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-bold tracking-wide text-white uppercase"
      >
        {{ t('card.soldOut') }}
      </span>
    </EventCover>
    <div class="flex flex-1 flex-col gap-3 p-4">
      <div>
        <h3 class="line-clamp-2 font-semibold text-slate-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
          {{ event.title }}
        </h3>
        <p class="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <MapPin class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{{ event.venue }}, {{ event.city }}</span>
        </p>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{{ formatDateTime(event.startsAt) }}</p>
      </div>
      <div class="mt-auto space-y-3">
        <SeatsBar :available="event.availableSeats" :capacity="event.capacity" />
        <div class="flex items-center justify-between">
          <span class="text-lg font-bold text-slate-900 dark:text-white">{{ formatPrice(event.priceCents, event.currency) }}</span>
          <span class="text-xs font-semibold text-violet-600 dark:text-violet-300">{{ t('card.details') }}</span>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
