'use client';

import type { Worker, Calculation, CalculationWithWorker, WorkerFormData } from './types';
import type { CalculationPipeline, PipelineFormData } from './pipeline-types';
import { getSupabaseBrowserClient } from './supabase-client';

async function requireUser(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

// ============ Workers ============

export async function getWorkers(): Promise<Worker[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Worker[];
}

export async function getWorker(id: string): Promise<Worker | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Worker | null) ?? null;
}

export async function createWorker(worker: WorkerFormData): Promise<Worker> {
  const supabase = getSupabaseBrowserClient();
  const user_id = await requireUser();
  const { data, error } = await supabase
    .from('workers')
    .insert({
      user_id,
      name: worker.name,
      formula_config: worker.formula_config,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(
  id: string,
  worker: Partial<WorkerFormData>
): Promise<Worker> {
  const supabase = getSupabaseBrowserClient();
  await requireUser();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (worker.name !== undefined) patch.name = worker.name;
  if (worker.formula_config !== undefined) patch.formula_config = worker.formula_config;
  const { data, error } = await supabase
    .from('workers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function deleteWorker(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await requireUser();
  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) throw error;
}

// ============ Calculations ============

const CALC_WITH_WORKER_SELECT = '*, worker:workers(id, name)';

function normalizeCalcRow(row: unknown): CalculationWithWorker {
  const r = row as Calculation & { worker: { id: string; name: string } | null };
  return {
    ...r,
    worker: r.worker ?? { id: r.worker_id, name: 'Unknown worker' },
  };
}

export async function getCalculations(filters?: {
  workerId?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
}): Promise<CalculationWithWorker[]> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from('calculations')
    .select(CALC_WITH_WORKER_SELECT)
    .order('created_at', { ascending: false });
  if (filters?.workerId) query = query.eq('worker_id', filters.workerId);
  if (filters?.period) query = query.eq('period', filters.period);
  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalizeCalcRow);
}

export async function getCalculation(id: string): Promise<CalculationWithWorker | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculations')
    .select(CALC_WITH_WORKER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeCalcRow(data) : null;
}

export async function createCalculation(
  calculation: Omit<Calculation, 'id' | 'created_at'>
): Promise<Calculation> {
  const supabase = getSupabaseBrowserClient();
  const user_id = await requireUser();
  const payload = { user_id, ...calculation };
  const { data, error } = await supabase
    .from('calculations')
    .insert(payload)
    .select()
    .single();
  if (error) {
    // Surface PostgREST details so we can diagnose 400/409s. The default
    // Error rendering omits .details/.hint/.code which usually have the
    // real cause (NOT NULL violation, FK violation, etc.).
    console.error('createCalculation failed', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      payload,
    });
    throw new Error(
      `${error.message}${error.details ? ` — ${error.details}` : ''}${
        error.hint ? ` (hint: ${error.hint})` : ''
      }`,
    );
  }
  return data as Calculation;
}

export async function deleteCalculation(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await requireUser();
  const { error } = await supabase.from('calculations').delete().eq('id', id);
  if (error) throw error;
}

// ============ Pipelines ============
// Single pipeline per user — enforced by unique(user_id) constraint.
// upsert({...}, { onConflict: 'user_id' }) lets us treat create/update uniformly.

export async function getPipelines(): Promise<CalculationPipeline[]> {
  const pipeline = await getDefaultPipeline();
  return pipeline ? [pipeline] : [];
}

export async function getDefaultPipeline(): Promise<CalculationPipeline | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculation_pipelines')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CalculationPipeline | null) ?? null;
}

export async function getPipeline(id: string): Promise<CalculationPipeline | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculation_pipelines')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as CalculationPipeline | null) ?? null;
}

export async function createPipeline(
  pipeline: PipelineFormData
): Promise<CalculationPipeline> {
  const supabase = getSupabaseBrowserClient();
  const user_id = await requireUser();
  const { data, error } = await supabase
    .from('calculation_pipelines')
    .upsert(
      {
        user_id,
        name: pipeline.name,
        rows: pipeline.rows,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as CalculationPipeline;
}

export async function updatePipeline(
  _id: string,
  updates: Partial<PipelineFormData>
): Promise<CalculationPipeline> {
  const supabase = getSupabaseBrowserClient();
  const user_id = await requireUser();
  const existing = await getDefaultPipeline();
  const payload = {
    user_id,
    name: updates.name ?? existing?.name ?? 'Default Pipeline',
    rows: updates.rows ?? existing?.rows ?? [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('calculation_pipelines')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as CalculationPipeline;
}

export async function deletePipeline(_id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const user_id = await requireUser();
  const { error } = await supabase
    .from('calculation_pipelines')
    .delete()
    .eq('user_id', user_id);
  if (error) throw error;
}

// ============ Stats ============

export async function getQuarterlyStats(period: string): Promise<{
  totalAmount: number;
  calculationCount: number;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculations')
    .select('final_amount')
    .eq('period', period);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ final_amount: number }>;
  return {
    totalAmount: rows.reduce((sum, r) => sum + Number(r.final_amount), 0),
    calculationCount: rows.length,
  };
}

export async function getRecentCalculations(
  limit: number = 5
): Promise<CalculationWithWorker[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculations')
    .select(CALC_WITH_WORKER_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(normalizeCalcRow);
}

/**
 * Returns calculations for a given period, grouped by worker_id and sorted
 * within each group by created_at DESC (latest first). Used by the dashboard's
 * quarter-scoped "Saved Bonuses" section.
 */
export async function getCalculationsByWorkerForPeriod(
  period: string,
): Promise<Record<string, CalculationWithWorker[]>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('calculations')
    .select(CALC_WITH_WORKER_SELECT)
    .eq('period', period)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const result: Record<string, CalculationWithWorker[]> = {};
  for (const row of (data ?? []).map(normalizeCalcRow)) {
    (result[row.worker_id] ??= []).push(row);
  }
  return result;
}
