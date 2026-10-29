import type { BookingStatus, EventStatus } from '@/types';
import { intlLocale, t } from '@/i18n';

export function formatMoney(cents: number, currency = 'usd') {
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// Ticket price: zero means a free event
export function formatPrice(cents: number, currency = 'usd') {
  return cents === 0 ? t('common.free') : formatMoney(cents, currency);
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(intlLocale(), {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDay(iso: string) {
  const date = new Date(iso);
  return {
    day: date.getDate(),
    month: new Intl.DateTimeFormat(intlLocale(), { month: 'short' }).format(date).replace('.', ''),
    weekday: new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' }).format(date),
  };
}

export function bookingStatusLabel(status: BookingStatus) {
  return t(`bookingStatus.${status}` as const);
}

export function eventStatusLabel(status: EventStatus) {
  return t(`eventStatus.${status}` as const);
}

// Deterministic gradient cover for events without an image
const GRADIENTS = [
  'from-violet-600 via-fuchsia-600 to-pink-500',
  'from-sky-600 via-indigo-600 to-violet-600',
  'from-emerald-600 via-teal-600 to-cyan-600',
  'from-amber-500 via-orange-600 to-rose-600',
  'from-rose-600 via-pink-600 to-purple-600',
  'from-cyan-600 via-blue-600 to-indigo-700',
];

export function coverGradient(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}
