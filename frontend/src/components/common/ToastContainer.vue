<script setup lang="ts">
import { t } from '@/i18n';
import { useToastStore } from '@/stores/toastStore';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-vue-next';

const toastStore = useToastStore();
</script>

<template>
  <div
    class="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="translate-y-4 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200"
        :class="{
          'bg-emerald-950/90 text-emerald-100 border-emerald-700/50 dark:bg-emerald-950/90 dark:text-emerald-100':
            toast.type === 'success',
          'bg-rose-950/90 text-rose-100 border-rose-700/50 dark:bg-rose-950/90 dark:text-rose-100':
            toast.type === 'error',
          'bg-amber-950/90 text-amber-100 border-amber-700/50 dark:bg-amber-950/90 dark:text-amber-100':
            toast.type === 'warning',
          'bg-slate-900/90 text-slate-100 border-slate-700/50 dark:bg-slate-900/90 dark:text-slate-100':
            toast.type === 'info',
        }"
        role="alert"
      >
        <div class="shrink-0 mt-0.5">
          <CheckCircle2 v-if="toast.type === 'success'" class="w-5 h-5 text-emerald-400" />
          <AlertCircle v-else-if="toast.type === 'error'" class="w-5 h-5 text-rose-400" />
          <AlertTriangle v-else-if="toast.type === 'warning'" class="w-5 h-5 text-amber-400" />
          <Info v-else class="w-5 h-5 text-blue-400" />
        </div>

        <div class="flex-1 min-w-0">
          <h4 v-if="toast.title" class="text-sm font-semibold leading-tight">
            {{ toast.title }}
          </h4>
          <p class="text-xs leading-relaxed mt-0.5 opacity-90 break-words">
            {{ toast.message }}
          </p>
        </div>

        <button
          type="button"
          class="shrink-0 p-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity hover:bg-white/10"
          :aria-label="t('common.close')"
          @click="toastStore.removeToast(toast.id)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
