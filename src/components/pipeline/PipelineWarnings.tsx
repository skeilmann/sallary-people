'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { PipelineIssue } from '@/lib/pipeline-utils';

/** Setup problems that would silently change someone's pay. */
export function PipelineWarnings({ issues }: { issues: PipelineIssue[] }) {
  const t = useTranslations('pipeline.warnings');

  const seen = new Set<string>();
  const unique = issues.filter((issue) => {
    const key = `${issue.code}:${JSON.stringify(issue.values)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return null;

  return (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{t('title')}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {unique.map((issue) => (
            <li key={`${issue.code}:${JSON.stringify(issue.values)}`}>
              {t(issue.code, issue.values)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
