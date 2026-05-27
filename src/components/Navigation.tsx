'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { user, signOut } = useAuth();

  const navItems = [
    { href: '/', label: t('nav.dashboard') },
    { href: '/pipeline', label: t('nav.pipeline') },
    { href: '/calculate', label: t('nav.calculate') },
    { href: '/workers', label: t('nav.workers') },
    { href: '/history', label: t('nav.history') },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="font-semibold text-lg">
            {t('common.appName')}
          </Link>

          <div className="flex items-center gap-4">
            {user && (
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
            )}
            <LanguageSwitcher />
            {user && (
              <>
                <span
                  className="hidden md:inline max-w-[180px] truncate text-sm text-muted-foreground"
                  title={user.email ?? ''}
                >
                  {user.email}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
