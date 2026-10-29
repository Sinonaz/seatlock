<script setup lang="ts">
import { t } from '@/i18n';
import { onMounted, ref, watch } from 'vue';
import { adminApi } from '@/api/adminApi';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { PaginationMeta, Role, User } from '@/types';
import { formatDateTime } from '@/utils/format';
import { Search } from 'lucide-vue-next';
import ErrorState from '@/components/common/ErrorState.vue';

const auth = useAuthStore();
const toasts = useToastStore();

const ROLES: Role[] = ['USER', 'ORGANIZER', 'ADMIN'];

const users = ref<User[]>([]);
const meta = ref<PaginationMeta | null>(null);
const page = ref(1);
const search = ref('');
const isLoading = ref(true);
const error = ref<string | null>(null);

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await adminApi.getUsers({ page: page.value, limit: 20, search: search.value || undefined });
    users.value = res.items;
    meta.value = res.meta;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    load();
  }, 300);
});

async function changeRole(user: User, role: Role) {
  const previous = user.role;
  user.role = role;
  try {
    await adminApi.changeRole(user.id, role);
    toasts.success(t('admin.roleChanged', { email: user.email, role }));
  } catch (e) {
    user.role = previous;
    toasts.error((e as Error).message);
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="page-title">{{ t('admin.title') }}</h1>
      <div class="relative w-full sm:w-72">
        <Search class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input v-model="search" class="input !pl-9" type="search" :placeholder="t('admin.searchPlaceholder')" />
      </div>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <div v-else-if="isLoading" class="card h-64 animate-pulse" />

    <div v-else class="card overflow-x-auto">
      <table class="w-full min-w-[600px] text-left text-sm">
        <thead class="border-b border-slate-200 text-xs text-slate-500 dark:border-white/10">
          <tr>
            <th class="px-4 py-3">{{ t('admin.colUser') }}</th>
            <th class="px-4 py-3">{{ t('admin.colRegistered') }}</th>
            <th class="px-4 py-3">{{ t('admin.colRole') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b border-slate-100 last:border-0 dark:border-white/5">
            <td class="px-4 py-3">
              <p class="font-semibold">{{ user.name }}</p>
              <p class="text-xs text-slate-500">{{ user.email }}</p>
            </td>
            <td class="px-4 py-3 text-slate-500">{{ formatDateTime(user.createdAt) }}</td>
            <td class="px-4 py-3">
              <select
                class="input !w-auto !py-1.5"
                :value="user.role"
                :disabled="user.id === auth.user?.id"
                :title="user.id === auth.user?.id ? t('admin.ownRole') : ''"
                @change="changeRole(user, ($event.target as HTMLSelectElement).value as Role)"
              >
                <option v-for="role in ROLES" :key="role" :value="role">{{ role }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="meta" class="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10">{{ t('admin.total', { total: meta.total }) }}</p>
    </div>
  </div>
</template>
