<script setup lang="ts">
import type { Role } from '@/types';

defineProps<{ role: Role }>();

const styles: Record<Role, string> = {
  USER: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  ORGANIZER: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  ADMIN: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
};
</script>

<template>
  <span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase" :class="styles[role]">
    {{ role }}
  </span>
</template>
