import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/authApi';
import { refreshAccessToken, registerSessionHandlers, setAccessToken } from '@/api/client';
import type { AuthResponse, LoginDto, RegisterDto, Role, User } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const isReady = ref(false);
  let initPromise: Promise<void> | null = null;

  const isAuthenticated = computed(() => user.value !== null);

  function applySession(res: AuthResponse) {
    setAccessToken(res.accessToken);
    user.value = res.user;
  }

  function clearSession() {
    setAccessToken(null);
    user.value = null;
  }

  registerSessionHandlers({
    onRefreshed: (res) => {
      user.value = res.user;
    },
    onExpired: clearSession,
  });

  // On page load the access token is gone (memory only), but the refresh cookie survives
  function init(): Promise<void> {
    initPromise ??= refreshAccessToken().finally(() => {
      isReady.value = true;
    }).then(() => undefined);
    return initPromise;
  }

  async function login(dto: LoginDto) {
    applySession(await authApi.login(dto));
  }

  async function register(dto: RegisterDto) {
    applySession(await authApi.register(dto));
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }

  function hasRole(...roles: Role[]) {
    return !!user.value && roles.includes(user.value.role);
  }

  return {
    user,
    isReady,
    isAuthenticated,
    init,
    login,
    register,
    logout,
    hasRole,
  };
});
