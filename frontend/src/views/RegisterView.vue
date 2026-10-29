<script setup lang="ts">
import { t } from '@/i18n';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Loader2 } from 'lucide-vue-next';

const auth = useAuthStore();
const toasts = useToastStore();
const router = useRouter();

const form = ref({ name: '', email: '', password: '' });
const error = ref<string | null>(null);
const isSubmitting = ref(false);

async function submit() {
  isSubmitting.value = true;
  error.value = null;
  try {
    await auth.register(form.value);
    toasts.success(t('register.created'));
    router.replace('/');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-6 pt-6">
    <div class="text-center">
      <h1 class="page-title">{{ t('register.title') }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ t('register.haveAccount') }} <RouterLink to="/login" class="font-semibold text-violet-600">{{ t('register.login') }}</RouterLink></p>
    </div>

    <form class="card space-y-4 p-6" @submit.prevent="submit">
      <div>
        <label class="label" for="name">{{ t('register.name') }}</label>
        <input id="name" v-model="form.name" class="input" autocomplete="name" required minlength="2" />
      </div>
      <div>
        <label class="label" for="email">{{ t('common.email') }}</label>
        <input id="email" v-model="form.email" class="input" type="email" autocomplete="email" required />
      </div>
      <div>
        <label class="label" for="password">{{ t('common.password') }}</label>
        <input id="password" v-model="form.password" class="input" type="password" autocomplete="new-password" required minlength="8" />
        <p class="mt-1 text-xs text-slate-500">{{ t('register.passwordHint') }}</p>
      </div>
      <p v-if="error" class="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="isSubmitting">
        <Loader2 v-if="isSubmitting" class="h-4 w-4 animate-spin" />
        {{ t('register.submit') }}
      </button>
    </form>
  </div>
</template>
