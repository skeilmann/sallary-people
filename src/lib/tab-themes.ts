import type { CSSProperties } from 'react';
import {
  LayoutDashboard,
  Workflow,
  Calculator,
  Users,
  History,
  type LucideIcon,
} from 'lucide-react';

export type TabKey = 'dashboard' | 'pipeline' | 'calculate' | 'workers' | 'history';

export interface TabTheme {
  key: TabKey;
  href: string;
  step: string;
  icon: LucideIcon;
  /** i18n key under root used for tab title (`<ns>.title`) and subtitle (`<ns>.subtitle`). */
  ns: TabKey;
  /** CSS variable names — values live in globals.css :root / .dark. */
  vars: {
    strong: string;
    soft: string;
    fg: string;
  };
}

export const TAB_THEMES: Record<TabKey, TabTheme> = {
  dashboard: {
    key: 'dashboard',
    href: '/',
    step: '01',
    icon: LayoutDashboard,
    ns: 'dashboard',
    vars: {
      strong: 'var(--tab-dashboard-strong)',
      soft: 'var(--tab-dashboard-soft)',
      fg: 'var(--tab-dashboard-fg)',
    },
  },
  pipeline: {
    key: 'pipeline',
    href: '/pipeline',
    step: '02',
    icon: Workflow,
    ns: 'pipeline',
    vars: {
      strong: 'var(--tab-pipeline-strong)',
      soft: 'var(--tab-pipeline-soft)',
      fg: 'var(--tab-pipeline-fg)',
    },
  },
  calculate: {
    key: 'calculate',
    href: '/calculate',
    step: '03',
    icon: Calculator,
    ns: 'calculate',
    vars: {
      strong: 'var(--tab-calculate-strong)',
      soft: 'var(--tab-calculate-soft)',
      fg: 'var(--tab-calculate-fg)',
    },
  },
  workers: {
    key: 'workers',
    href: '/workers',
    step: '04',
    icon: Users,
    ns: 'workers',
    vars: {
      strong: 'var(--tab-workers-strong)',
      soft: 'var(--tab-workers-soft)',
      fg: 'var(--tab-workers-fg)',
    },
  },
  history: {
    key: 'history',
    href: '/history',
    step: '05',
    icon: History,
    ns: 'history',
    vars: {
      strong: 'var(--tab-history-strong)',
      soft: 'var(--tab-history-soft)',
      fg: 'var(--tab-history-fg)',
    },
  },
};

export const TAB_ORDER: TabKey[] = ['dashboard', 'pipeline', 'calculate', 'workers', 'history'];

export function getTabFromPath(pathname: string): TabKey {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/pipeline')) return 'pipeline';
  if (pathname.startsWith('/calculate')) return 'calculate';
  if (pathname.startsWith('/workers')) return 'workers';
  if (pathname.startsWith('/history')) return 'history';
  return 'dashboard';
}

/** Inline style object exposing the active tab's three colors as CSS vars
 * a child can reference via `var(--tab-strong)` etc. Used by TabHeader and
 * by accented Cards so each page stays in sync from a single source. */
export function tabStyleVars(key: TabKey): CSSProperties {
  const t = TAB_THEMES[key];
  return {
    ['--tab-strong' as string]: t.vars.strong,
    ['--tab-soft' as string]: t.vars.soft,
    ['--tab-fg' as string]: t.vars.fg,
  };
}
