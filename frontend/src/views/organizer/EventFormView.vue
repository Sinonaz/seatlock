<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { eventsApi } from '@/api/eventsApi';
import { useToastStore } from '@/stores/toastStore';
import type { CreateEventDto, EventStatus } from '@/types';
import { ArrowLeft, Loader2, Lock } from 'lucide-vue-next';

const props = defineProps<{ id?: string }>();

const router = useRouter();
const toasts = useToastStore();

const isEdit = computed(() => !!props.id);
const status = ref<EventStatus>('DRAFT');
const isLoading = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);

// Price is edited in dollars for humans, sent in cents for the API
const form = ref({
  title: '',
  description: '',
  venue: '',
  city: '',
  startsAtLocal: '',
  price: 0,
  capacity: 50,
  coverImageUrl: '',
});

// Price, capacity and date are frozen after publishing: tickets were sold under those terms
const isLocked = computed(() => status.value === 'PUBLISHED');

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

onMounted(async () => {
  if (!props.id) return;
  isLoading.value = true;
  try {
    const event = await eventsApi.getMyEvent(props.id);
    status.value = event.status;
    form.value = {
      title: event.title,
      description: event.description,
      venue: event.venue,
      city: event.city,
      startsAtLocal: toLocalInput(event.startsAt),
      price: event.priceCents / 100,
      capacity: event.capacity,
      coverImageUrl: event.coverImageUrl ?? '',
    };
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
});

async function submit() {
  isSaving.value = true;
  error.value = null;
  const f = form.value;
  const dto: CreateEventDto = {
    title: f.title.trim(),
    description: f.description.trim(),
    venue: f.venue.trim(),
    city: f.city.trim(),
    coverImageUrl: f.coverImageUrl.trim() || null,
    startsAt: new Date(f.startsAtLocal).toISOString(),
    priceCents: Math.round(Number(f.price) * 100),
    capacity: Number(f.capacity),
  };
  try {
    if (props.id) {
      const payload: Partial<CreateEventDto> = { ...dto };
      if (isLocked.value) {
        delete payload.startsAt;
        delete payload.priceCents;
        delete payload.capacity;
      }
      await eventsApi.updateEvent(props.id, payload);
      toasts.success(t('form.saved'));
    } else {
      await eventsApi.createEvent(dto);
      toasts.success(t('form.draftCreated'));
    }
    router.push('/organizer');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <RouterLink to="/organizer" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-600">
      <ArrowLeft class="h-4 w-4" /> {{ t('organizer.back') }}
    </RouterLink>
    <h1 class="page-title">{{ isEdit ? t('form.editTitle') : t('form.newTitle') }}</h1>

    <div v-if="isLoading" class="card h-96 animate-pulse" />

    <form v-else class="card space-y-5 p-6" @submit.prevent="submit">
      <div>
        <label class="label" for="title">{{ t('form.title') }}</label>
        <input id="title" v-model="form.title" class="input" required minlength="3" maxlength="120" />
      </div>
      <div>
        <label class="label" for="description">{{ t('form.description') }}</label>
        <textarea id="description" v-model="form.description" class="input min-h-28" maxlength="5000" />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="venue">{{ t('form.venue') }}</label>
          <input id="venue" v-model="form.venue" class="input" required />
        </div>
        <div>
          <label class="label" for="city">{{ t('form.city') }}</label>
          <input id="city" v-model="form.city" class="input" required />
        </div>
      </div>

      <div v-if="isLocked" class="flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
        <Lock class="mt-0.5 h-4 w-4 shrink-0" />
        {{ t('form.locked') }}
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="label" for="startsAt">{{ t('form.startsAt') }}</label>
          <input id="startsAt" v-model="form.startsAtLocal" class="input" type="datetime-local" required :disabled="isLocked" />
        </div>
        <div>
          <label class="label" for="price">{{ t('form.price') }}</label>
          <input id="price" v-model.number="form.price" class="input" type="number" min="0" step="0.01" required :disabled="isLocked" />
        </div>
        <div>
          <label class="label" for="capacity">{{ t('form.capacity') }}</label>
          <input id="capacity" v-model.number="form.capacity" class="input" type="number" min="1" max="100000" required :disabled="isLocked" />
        </div>
      </div>
      <div>
        <label class="label" for="cover">{{ t('form.cover') }}</label>
        <input id="cover" v-model="form.coverImageUrl" class="input" type="url" placeholder="https://…" />
      </div>

      <p v-if="error" class="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <RouterLink to="/organizer" class="btn-secondary">{{ t('common.cancel') }}</RouterLink>
        <button type="submit" class="btn-primary" :disabled="isSaving">
          <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
          {{ isEdit ? t('common.save') : t('form.createDraft') }}
        </button>
      </div>
    </form>
  </div>
</template>
