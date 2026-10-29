import { computed, onBeforeUnmount, ref, watchEffect, type Ref } from 'vue';

// Live mm:ss countdown to an ISO date; `isOver` flips when the deadline passes
export function useCountdown(deadline: Ref<string | null | undefined>) {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), 1000);
  onBeforeUnmount(() => clearInterval(timer));

  const msLeft = computed(() =>
    deadline.value ? Math.max(0, new Date(deadline.value).getTime() - now.value) : 0,
  );
  const isOver = computed(() => !!deadline.value && msLeft.value === 0);
  const label = ref('');

  watchEffect(() => {
    const totalSeconds = Math.floor(msLeft.value / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    label.value = `${minutes}:${seconds}`;
  });

  return { msLeft, isOver, label };
}
