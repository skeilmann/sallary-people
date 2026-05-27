'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export function MigrationBanner() {
  const { migration, retryMigration, dismissMigration } = useAuth();

  useEffect(() => {
    if (migration.state === 'success') {
      const t = setTimeout(dismissMigration, 4000);
      return () => clearTimeout(t);
    }
  }, [migration, dismissMigration]);

  if (migration.state === 'idle') return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-2 shadow-md">
        {migration.state === 'running' && (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <span className="text-sm">Importing your saved data…</span>
          </>
        )}
        {migration.state === 'success' && (
          <span className="text-sm">
            Imported {migration.result.workers} workers, {migration.result.calculations} calculations
            {migration.result.pipeline ? ', pipeline' : ''}
          </span>
        )}
        {migration.state === 'error' && (
          <>
            <span className="text-sm text-destructive">Import failed: {migration.error}</span>
            <Button size="sm" variant="outline" onClick={() => void retryMigration()}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissMigration}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
