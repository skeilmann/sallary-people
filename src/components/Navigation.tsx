'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '@/i18n/config';

export function Navigation() {
  const pathname = usePathname();
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const navItems = [
    { href: '/', label: t('nav.dashboard') },
    { href: '/pipeline', label: t('nav.pipeline') },
    { href: '/calculate', label: t('nav.calculate') },
    { href: '/workers', label: t('nav.workers') },
    { href: '/history', label: t('nav.history') },
  ];

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="font-semibold text-lg">
            {t('common.appName')}
          </Link>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LanguageSwitcher currentLocale={locale} />
          </div>
        </div>
      </div>
    </header>
  );
}
