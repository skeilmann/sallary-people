import { type Locale, locales } from '@/i18n/config';

export function setLocale(locale: Locale) {
  if (!locales.includes(locale)) {
    throw new Error('Invalid locale');
  }
  localStorage.setItem('locale', locale);
}

export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('locale');
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale;
  }
  return null;
}
