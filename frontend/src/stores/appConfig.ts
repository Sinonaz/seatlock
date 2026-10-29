import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { setApiMockMode } from '@/api/client';
import { resetMockDb } from '@/api/mock/mockServer';

const MOCK_KEY = 'seatlock_mock_mode';
const THEME_KEY = 'seatlock_theme';

function readStoredFlag(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value === 'true' : fallback;
  } catch {
    return fallback;
  }
}

export const useAppConfigStore = defineStore('appConfig', () => {
  // Mock mode: the UI talks to an in-browser fake backend instead of NestJS
  const isMockMode = ref<boolean>(readStoredFlag(MOCK_KEY, import.meta.env.VITE_MOCK_MODE === 'true'));
  const isDarkMode = ref<boolean>(readStoredFlag(THEME_KEY, true));

  const applyTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark);
  };

  setApiMockMode(isMockMode.value);
  applyTheme(isDarkMode.value);

  watch(isDarkMode, (val) => {
    localStorage.setItem(THEME_KEY, String(val));
    applyTheme(val);
  });

  // Switching modes means a different backend with different sessions, so reload cleanly
  function setMockMode(val: boolean) {
    if (val === isMockMode.value) return;
    localStorage.setItem(MOCK_KEY, String(val));
    window.location.assign('/');
  }

  function resetMockData() {
    resetMockDb();
    window.location.assign('/');
  }

  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value;
  }

  return {
    isMockMode,
    isDarkMode,
    setMockMode,
    resetMockData,
    toggleTheme,
  };
});
