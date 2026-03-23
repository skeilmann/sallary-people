'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';
import { setLocale } from '@/lib/actions';
import { useLocale } from 'next-intl';

export function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale;

  const handleChange = (newLocale: Locale) => {
    setLocale(newLocale);
    window.location.reload();
  };

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      <SelectTrigger className="w-[140px] h-8">
        <SelectValue>
          {localeFlags[currentLocale]} {localeNames[currentLocale]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeFlags[locale]} {localeNames[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
