import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: Role[];
    guestOnly?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'events', component: () => import('@/views/EventsView.vue') },
    { path: '/events/:id', name: 'event', component: () => import('@/views/EventDetailsView.vue'), props: true },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/bookings', name: 'my-bookings', component: () => import('@/views/MyBookingsView.vue'), meta: { requiresAuth: true } },
    { path: '/bookings/:id', name: 'booking', component: () => import('@/views/BookingView.vue'), props: true, meta: { requiresAuth: true } },
    { path: '/mock-checkout/:id', name: 'mock-checkout', component: () => import('@/views/MockCheckoutView.vue'), props: true, meta: { requiresAuth: true } },
    { path: '/lab', name: 'lab', component: () => import('@/views/LabView.vue'), meta: { requiresAuth: true } },
    {
      path: '/organizer',
      name: 'organizer',
      component: () => import('@/views/organizer/OrganizerEventsView.vue'),
      meta: { requiresAuth: true, roles: ['ORGANIZER', 'ADMIN'] },
    },
    {
      path: '/organizer/events/new',
      name: 'organizer-event-new',
      component: () => import('@/views/organizer/EventFormView.vue'),
      meta: { requiresAuth: true, roles: ['ORGANIZER', 'ADMIN'] },
    },
    {
      path: '/organizer/events/:id/edit',
      name: 'organizer-event-edit',
      component: () => import('@/views/organizer/EventFormView.vue'),
      props: true,
      meta: { requiresAuth: true, roles: ['ORGANIZER', 'ADMIN'] },
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/views/admin/AdminUsersView.vue'),
      meta: { requiresAuth: true, roles: ['ADMIN'] },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
});

// UI guards only improve UX. Real protection is the backend's JwtAuthGuard + RolesGuard.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.init();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.roles && !auth.hasRole(...to.meta.roles)) {
    return { name: 'events' };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'events' };
  }
});
