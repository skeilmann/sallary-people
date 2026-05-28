'use client';

import { useTranslations } from 'next-intl';
import { TAB_THEMES, tabStyleVars, type TabKey } from '@/lib/tab-themes';
import { cn } from '@/lib/utils';

interface TabHeaderProps {
  tab: TabKey;
  /** Optional override for the i18n title key — defaults to `<tab>.title`. */
  titleKey?: string;
  /** Optional override for the i18n subtitle key — defaults to `<tab>.subtitle`. */
  subtitleKey?: string;
  /** Page-level action(s) — typically a primary CTA already provided by each page. */
  actions?: React.ReactNode;
  className?: string;
}

export function TabHeader({
  tab,
  titleKey,
  subtitleKey,
  actions,
  className,
}: TabHeaderProps) {
  const theme = TAB_THEMES[tab];
  const t = useTranslations(theme.ns);
  const Icon = theme.icon;

  const title = t(titleKey ?? 'title');
  // Subtitle is optional — fall back to empty string if the key doesn't exist.
  let subtitle = '';
  try {
    subtitle = t(subtitleKey ?? 'subtitle');
  } catch {
    subtitle = '';
  }

  return (
    <div
      style={{
        ...tabStyleVars(tab),
        backgroundColor: 'var(--tab-soft)',
      }}
      className={cn(
        'relative overflow-hidden border-b border-border/60',
        className,
      )}
    >
      <div className="container mx-auto px-6 py-10 md:py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-5 md:gap-6">
            <span
              className="font-mono text-5xl md:text-6xl font-bold leading-none tabular-nums tracking-tight"
              style={{ color: 'var(--tab-fg)' }}
              aria-hidden="true"
            >
              {theme.step}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <Icon
                  className="h-7 w-7 md:h-8 md:w-8 shrink-0"
                  style={{ color: 'var(--tab-strong)' }}
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
                <h1
                  className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground"
                >
                  {title}
                </h1>
              </div>
              {subtitle && (
                <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 md:shrink-0">{actions}</div>
          )}
        </div>
      </div>
      {/* bottom edge: a thin band of the tab's strong color anchoring the header. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[2px]"
        style={{ backgroundColor: 'var(--tab-strong)' }}
      />
    </div>
  );
}
