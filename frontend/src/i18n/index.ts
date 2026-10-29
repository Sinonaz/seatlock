import { ref, watch } from 'vue';
import { en, ru, type MessageKey } from './messages';

export type Locale = 'en' | 'ru';
export type { MessageKey };

const LOCALE_KEY = 'seatlock_locale';
const messages: Record<Locale, Record<MessageKey, string>> = { en, ru };

function readStoredLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

// Module-level ref: templates that call t() re-render when it changes
export const locale = ref<Locale>(readStoredLocale());

watch(
  locale,
  (val) => {
    try {
      localStorage.setItem(LOCALE_KEY, val);
    } catch {
      // Private mode: the choice just won't survive a reload
    }
    document.documentElement.lang = val;
  },
  { immediate: true },
);

export function setLocale(val: Locale) {
  locale.value = val;
}

export function toggleLocale() {
  setLocale(locale.value === 'en' ? 'ru' : 'en');
}

// BCP 47 tag for Intl formatters
export function intlLocale() {
  return locale.value === 'ru' ? 'ru-RU' : 'en-US';
}

// Looks up a message and fills {placeholders} from params
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[locale.value][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
