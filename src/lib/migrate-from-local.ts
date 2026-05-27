'use client';

import { getSupabaseBrowserClient } from './supabase-client';
import type { Worker, Calculation } from './types';
import type { CalculationPipeline, PipelineRow } from './pipeline-types';

const WORKERS_KEY = 'bonus_calculator_workers';
const CALCULATIONS_KEY = 'bonus_calculator_calculations';
const PIPELINE_KEY = 'bonus_calculator_pipeline';

const flagKey = (userId: string) => `bc_migrated:${userId}`;

export interface MigrationResult {
  workers: number;
  calculations: number;
  pipeline: boolean;
  skipped: boolean;
}

/**
 * Hash `${userId}:${kind}:${legacyId}` with SHA-256 and format the first
 * 16 bytes as a UUID with the v5 version/variant nibbles set. Same input
 * always produces the same UUID — re-running the migration is a no-op.
 */
async function deterministicUuid(userId: string, kind: string, legacyId: string): Promise<string> {
  const input = `${userId}:${kind}:${legacyId}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function migrateLocalDataToSupabase(userId: string): Promise<MigrationResult> {
  if (typeof window === 'undefined') {
    return { workers: 0, calculations: 0, pipeline: false, skipped: true };
  }
  if (localStorage.getItem(flagKey(userId)) === 'true') {
    return { workers: 0, calculations: 0, pipeline: false, skipped: true };
  }

  const legacyWorkers = readJson<Worker[]>(WORKERS_KEY) ?? [];
  const legacyCalcs = readJson<Calculation[]>(CALCULATIONS_KEY) ?? [];
  const legacyPipeline = readJson<CalculationPipeline>(PIPELINE_KEY);

  if (legacyWorkers.length === 0 && legacyCalcs.length === 0 && !legacyPipeline) {
    localStorage.setItem(flagKey(userId), 'true');
    return { workers: 0, calculations: 0, pipeline: false, skipped: true };
  }

  const supabase = getSupabaseBrowserClient();

  // ---- workers ----
  const workerIdMap = new Map<string, string>();
  const workerRows = await Promise.all(
    legacyWorkers.map(async (w) => {
      const newId = await deterministicUuid(userId, 'worker', w.id);
      workerIdMap.set(w.id, newId);
      return {
        id: newId,
        user_id: userId,
        name: w.name,
        formula_config: w.formula_config,
        created_at: w.created_at,
        updated_at: w.updated_at,
      };
    })
  );
  if (workerRows.length > 0) {
    const { error } = await supabase.from('workers').upsert(workerRows, { onConflict: 'id' });
    if (error) throw error;
  }

  // ---- calculations ----
  const calcRows: Array<{
    id: string;
    user_id: string;
    worker_id: string;
    period: string;
    inputs: Calculation['inputs'];
    calculated_amount: number;
    adjustment_amount: number;
    adjustment_note: string | null;
    final_amount: number;
    created_at: string;
  }> = [];
  for (const c of legacyCalcs) {
    const mappedWorker = workerIdMap.get(c.worker_id);
    if (!mappedWorker) {
      console.warn(`Skipping orphan calculation ${c.id} (worker ${c.worker_id} missing)`);
      continue;
    }
    calcRows.push({
      id: await deterministicUuid(userId, 'calculation', c.id),
      user_id: userId,
      worker_id: mappedWorker,
      period: c.period,
      inputs: c.inputs,
      calculated_amount: c.calculated_amount,
      adjustment_amount: c.adjustment_amount,
      adjustment_note: c.adjustment_note,
      final_amount: c.final_amount,
      created_at: c.created_at,
    });
  }
  if (calcRows.length > 0) {
    const { error } = await supabase.from('calculations').upsert(calcRows, { onConflict: 'id' });
    if (error) throw error;
  }

  // ---- pipeline ----
  let pipelineMigrated = false;
  if (legacyPipeline) {
    const rows: PipelineRow[] = legacyPipeline.rows.map((row) => ({
      ...row,
      items: row.items.map((item) => ({
        ...item,
        workerId: item.workerId ? workerIdMap.get(item.workerId) ?? item.workerId : item.workerId,
      })),
    }));
    const pipelineId = await deterministicUuid(userId, 'pipeline', legacyPipeline.id);
    const { error } = await supabase
      .from('calculation_pipelines')
      .upsert(
        {
          id: pipelineId,
          user_id: userId,
          name: legacyPipeline.name,
          rows,
          created_at: legacyPipeline.created_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    pipelineMigrated = true;
  }

  // Success: set flag and remove ONLY the migrated keys.
  // Do NOT touch compareCalculationIds, locale, or usePersistedInputs keys.
  localStorage.setItem(flagKey(userId), 'true');
  localStorage.removeItem(WORKERS_KEY);
  localStorage.removeItem(CALCULATIONS_KEY);
  localStorage.removeItem(PIPELINE_KEY);

  return {
    workers: workerRows.length,
    calculations: calcRows.length,
    pipeline: pipelineMigrated,
    skipped: false,
  };
}
