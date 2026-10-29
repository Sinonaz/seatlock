import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ToastMessage } from '@/types';
import { t } from '@/i18n';

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<ToastMessage[]>([]);

  function addToast(toast: Omit<ToastMessage, 'id'> & { id?: string }) {
    const id = toast.id || 'toast-' + Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? 4500;

    const newToast: ToastMessage = {
      ...toast,
      id,
    };

    toasts.value.push(newToast);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function success(message: string, title = t('toast.success')) {
    return addToast({ type: 'success', title, message });
  }

  function error(message: string, title = t('toast.error')) {
    return addToast({ type: 'error', title, message, duration: 6000 });
  }

  function info(message: string, title = t('toast.info')) {
    return addToast({ type: 'info', title, message });
  }

  function warning(message: string, title = t('toast.warning')) {
    return addToast({ type: 'warning', title, message });
  }

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
    warning,
  };
});
