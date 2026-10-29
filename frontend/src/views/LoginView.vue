<script setup lang="ts">
import { t } from '@/i18n';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/api/mock/mockData';
import { Loader2 } from 'lucide-vue-next';
import RoleBadge from '@/components/common/RoleBadge.vue';

const auth = useAuthStore();
const toasts = useToastStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const isSubmitting = ref(false);

function fillDemo(demoEmail: string) {
  email.value = demoEmail;
  password.value = DEMO_PASSWORD;
}

async function submit() {
  isSubmitting.value = true;
  error.value = null;
  try {
    await auth.login({ email: email.value, password: password.value });
    toasts.success(t('login.welcome', { name: auth.user?.name ?? '' }));
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
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
      <h1 class="page-title">{{ t('login.title') }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ t('login.noAccount') }} <RouterLink to="/register" class="font-semibold text-violet-600">{{ t('login.register') }}</RouterLink></p>
    </div>

    <form class="card space-y-4 p-6" @submit.prevent="submit">
      <div>
        <label class="label" for="email">{{ t('common.email') }}</label>
        <input id="email" v-model="email" class="input" type="email" autocomplete="email" required />
      </div>
      <div>
        <label class="label" for="password">{{ t('common.password') }}</label>
        <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required />
      </div>
      <p v-if="error" class="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="isSubmitting">
        <Loader2 v-if="isSubmitting" class="h-4 w-4 animate-spin" />
        {{ t('login.submit') }}
      </button>
    </form>

    <div class="card p-4">
      <p class="mb-3 text-xs font-semibold text-slate-500">{{ t('login.demo', { password: DEMO_PASSWORD }) }}</p>
      <div class="space-y-1.5">
        <button
          v-for="account in DEMO_ACCOUNTS"
          :key="account.email"
          type="button"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
          @click="fillDemo(account.email)"
        >
          <span>{{ t(`demo.${account.role}`) }} <span class="text-xs text-slate-400">{{ account.email }}</span></span>
          <RoleBadge :role="account.role" />
        </button>
      </div>
    </div>
  </div>
</template>
