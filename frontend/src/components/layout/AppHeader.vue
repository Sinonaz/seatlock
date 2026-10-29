<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppConfigStore } from '@/stores/appConfig';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { locale, t, toggleLocale } from '@/i18n';
import { Database, FlaskConical, Languages, LogIn, LogOut, Moon, Server, Sun, Ticket } from 'lucide-vue-next';
import RoleBadge from '@/components/common/RoleBadge.vue';

const appConfig = useAppConfigStore();
const auth = useAuthStore();
const toasts = useToastStore();
const router = useRouter();

const links = computed(() => {
  const items = [{ to: '/', label: t('nav.events') }];
  if (auth.isAuthenticated) {
    items.push({ to: '/bookings', label: t('nav.myTickets') });
  }
  if (auth.hasRole('ORGANIZER', 'ADMIN')) {
    items.push({ to: '/organizer', label: t('nav.organizer') });
  }
  if (auth.hasRole('ADMIN')) {
    items.push({ to: '/admin/users', label: t('nav.users') });
  }
  return items;
});

async function handleLogout() {
  await auth.logout();
  toasts.info(t('header.loggedOut'));
  router.push('/');
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/[0.07] dark:bg-[#0c0a14]/80">
    <div class="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2.5">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-pink-500 text-white shadow-lg shadow-violet-600/25">
          <Ticket class="h-5 w-5" />
        </span>
        <span class="text-lg font-bold tracking-tight text-slate-900 dark:text-white">SeatLock</span>
      </RouterLink>

      <nav class="hidden items-center gap-1 lg:flex">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          exact-active-class="!bg-violet-500/10 !text-violet-700 dark:!text-violet-300"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <!-- Mock / Live switch -->
        <div class="hidden items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium lg:flex dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            class="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-all cursor-pointer"
            :class="appConfig.isMockMode ? 'bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            :title="t('header.mockTitle')"
            @click="appConfig.setMockMode(true)"
          >
            <Database class="h-3.5 w-3.5" />
            Mock
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-all cursor-pointer"
            :class="!appConfig.isMockMode ? 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            :title="t('header.liveTitle')"
            @click="appConfig.setMockMode(false)"
          >
            <Server class="h-3.5 w-3.5" />
            Live API
          </button>
        </div>

        <RouterLink
          v-if="auth.isAuthenticated"
          to="/lab"
          class="rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:border-violet-400 hover:text-violet-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-white"
          :title="t('header.lab')"
        >
          <FlaskConical class="h-4 w-4" />
        </RouterLink>

        <button
          type="button"
          class="rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:border-violet-400 dark:border-white/10 dark:text-slate-300 cursor-pointer"
          :title="appConfig.isDarkMode ? t('header.lightTheme') : t('header.darkTheme')"
          @click="appConfig.toggleTheme"
        >
          <Sun v-if="appConfig.isDarkMode" class="h-4 w-4 text-amber-400" />
          <Moon v-else class="h-4 w-4" />
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-slate-200 p-2 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-400 dark:border-white/10 dark:text-slate-300 cursor-pointer"
          :title="t('header.switchLanguage')"
          @click="toggleLocale"
        >
          <Languages class="h-4 w-4" />
          <span class="w-5 text-center">{{ locale.toUpperCase() }}</span>
        </button>

        <template v-if="auth.user">
          <div class="hidden flex-col items-end leading-tight xl:flex">
            <span class="max-w-40 truncate whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-slate-100">{{ auth.user.name }}</span>
            <RoleBadge :role="auth.user.role" />
          </div>
          <button
            type="button"
            class="rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-white/10 dark:text-slate-300 cursor-pointer"
            :title="t('header.logout')"
            @click="handleLogout"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </template>
        <RouterLink v-else-if="auth.isReady" to="/login" class="btn-primary !px-3 !py-2">
          <LogIn class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('header.login') }}</span>
        </RouterLink>
      </div>
    </div>

    <!-- Mobile navigation -->
    <nav class="flex gap-1 overflow-x-auto [scrollbar-width:none] border-t border-slate-200 px-4 py-2 lg:hidden dark:border-white/[0.07]">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400"
        exact-active-class="!bg-violet-500/10 !text-violet-700 dark:!text-violet-300"
      >
        {{ link.label }}
      </RouterLink>
      <button
        type="button"
        class="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
        :class="appConfig.isMockMode ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'"
        @click="appConfig.setMockMode(!appConfig.isMockMode)"
      >
        {{ appConfig.isMockMode ? 'Mock' : 'Live API' }}
      </button>
    </nav>
  </header>
</template>
