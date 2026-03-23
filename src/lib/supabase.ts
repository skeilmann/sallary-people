import { createClient } from '@supabase/supabase-js';
import type { Worker, Calculation, CalculationWithWorker, WorkerFormData } from './types';
import type { CalculationPipeline, PipelineFormData } from './pipeline-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ Workers ============

export async function getWorkers(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function getWorker(id: string): Promise<Worker | null> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createWorker(worker: WorkerFormData): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .insert(worker)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorker(id: string, worker: Partial<WorkerFormData>): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .update(worker)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============ Calculations ============

export async function getCalculations(filters?: {
  workerId?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
}): Promise<CalculationWithWorker[]> {
  let query = supabase
    .from('calculations')
    .select(`
      *,
      worker:workers!worker_id (id, name)
    `)
    .order('created_at', { ascending: false });

  if (filters?.workerId) {
    query = query.eq('worker_id', filters.workerId);
  }
  if (filters?.period) {
    query = query.eq('period', filters.period);
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getCalculation(id: string): Promise<CalculationWithWorker | null> {
  const { data, error } = await supabase
    .from('calculations')
    .select(`
      *,
      worker:workers!worker_id (id, name)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createCalculation(calculation: Omit<Calculation, 'id' | 'created_at'>): Promise<Calculation> {
  const { data, error } = await supabase
    .from('calculations')
    .insert(calculation)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCalculation(id: string): Promise<void> {
  const { error } = await supabase
    .from('calculations')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============ Pipelines ============
// Pipeline functions use localStorage as fallback when Supabase table doesn't exist

const PIPELINE_STORAGE_KEY = 'bonus_calculator_pipeline';

function getLocalPipeline(): CalculationPipeline | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveLocalPipeline(pipeline: CalculationPipeline): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(pipeline));
}

function removeLocalPipeline(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PIPELINE_STORAGE_KEY);
}

export async function getPipelines(): Promise<CalculationPipeline[]> {
  try {
    const { data, error } = await supabase
      .from('calculation_pipelines')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch {
    // Fallback to localStorage
    const local = getLocalPipeline();
    return local ? [local] : [];
  }
}

export async function getDefaultPipeline(): Promise<CalculationPipeline | null> {
  try {
    const { data, error } = await supabase
      .from('calculation_pipelines')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch {
    // Fallback to localStorage
    return getLocalPipeline();
  }
}

export async function getPipeline(id: string): Promise<CalculationPipeline | null> {
  try {
    const { data, error } = await supabase
      .from('calculation_pipelines')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch {
    const local = getLocalPipeline();
    return local?.id === id ? local : null;
  }
}

export async function createPipeline(pipeline: PipelineFormData): Promise<CalculationPipeline> {
  try {
    const { data, error } = await supabase
      .from('calculation_pipelines')
      .insert(pipeline)
      .select()
      .single();

    if (error) throw error;
    // Also save to localStorage for cross-page consistency
    saveLocalPipeline(data);
    return data;
  } catch {
    // Fallback: create locally
    const localPipeline: CalculationPipeline = {
      id: 'local-' + Date.now(),
      ...pipeline,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveLocalPipeline(localPipeline);
    return localPipeline;
  }
}

export async function updatePipeline(
  id: string,
  updates: Partial<PipelineFormData>
): Promise<CalculationPipeline> {
  try {
    const { data, error } = await supabase
      .from('calculation_pipelines')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    saveLocalPipeline(data);
    return data;
  } catch {
    // Fallback: update locally
    const existing = getLocalPipeline();
    const updated: CalculationPipeline = {
      ...(existing || { id, name: 'Pipeline', rows: [], created_at: new Date().toISOString() }),
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };
    saveLocalPipeline(updated);
    return updated;
  }
}

export async function deletePipeline(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('calculation_pipelines')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch {
    // Fallback: just remove local
  }
  removeLocalPipeline();
}

// ============ Stats ============

export async function getQuarterlyStats(period: string): Promise<{
  totalAmount: number;
  calculationCount: number;
}> {
  const { data, error } = await supabase
    .from('calculations')
    .select('final_amount')
    .eq('period', period);

  if (error) throw error;

  const totalAmount = (data || []).reduce((sum, calc) => sum + Number(calc.final_amount), 0);
  return {
    totalAmount,
    calculationCount: data?.length || 0,
  };
}

export async function getRecentCalculations(limit: number = 5): Promise<CalculationWithWorker[]> {
  const { data, error } = await supabase
    .from('calculations')
    .select(`
      *,
      worker:workers!worker_id (id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
