'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { TAB_ORDER, TAB_THEMES, type TabKey } from '@/lib/tab-themes';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { user, signOut } = useAuth();

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
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="font-semibold text-lg tracking-tight whitespace-nowrap"
          >
            {t('common.appName')}
          </Link>

          <div className="flex items-center gap-4">
            {user && (
              <nav className="flex items-center gap-0.5">
                {TAB_ORDER.map((key) => {
                  const theme = TAB_THEMES[key];
                  const isActive =
                    key === 'dashboard'
                      ? pathname === '/'
                      : pathname.startsWith(theme.href);
                  return (
                    <NavItem
                      key={key}
                      tabKey={key}
                      label={t(`nav.${key}` as const)}
                      isActive={isActive}
                    />
                  );
                })}
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

function NavItem({
  tabKey,
  label,
  isActive,
}: {
  tabKey: TabKey;
  label: string;
  isActive: boolean;
}) {
  const theme = TAB_THEMES[tabKey];
  // CSS vars scoped to this nav item — every color flows from these three.
  const style: React.CSSProperties = {
    ['--nav-strong' as string]: theme.vars.strong,
    ['--nav-soft' as string]: theme.vars.soft,
    ['--nav-fg' as string]: theme.vars.fg,
  };

  return (
    <Link
      href={theme.href}
      style={style}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'text-[color:var(--nav-fg)] bg-[color:var(--nav-soft)]'
          : 'text-muted-foreground hover:text-[color:var(--nav-fg)] hover:bg-[color:var(--nav-soft)]/60',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-sm text-[10px] font-bold tabular-nums tracking-wide',
          'h-5 min-w-[1.4rem] px-1 transition-colors duration-150',
          isActive
            ? 'bg-[color:var(--nav-strong)] text-white'
            : 'bg-[color:var(--nav-soft)] text-[color:var(--nav-fg)] group-hover:bg-[color:var(--nav-strong)]/15',
        )}
      >
        {theme.step}
      </span>
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full',
          'transition-opacity duration-150',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
        style={{ backgroundColor: theme.vars.strong }}
      />
    </Link>
  );
}
