'use client';

import { useState, useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { defaultLocale, type Locale } from '@/i18n/config';
import { getMessages } from '@/i18n/request';
import { getStoredLocale } from '@/lib/actions';

export function IntlProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState(getMessages(defaultLocale));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getStoredLocale();
    if (stored) {
      setLocale(stored);
      setMessages(getMessages(stored));
    }
    setMounted(true);
  }, []);

  // Listen for locale changes (triggered by LanguageSwitcher)
  useEffect(() => {
    const handleStorage = () => {
      const stored = getStoredLocale();
      if (stored && stored !== locale) {
        setLocale(stored);
        setMessages(getMessages(stored));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [locale]);

  if (!mounted) {
    return null;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
