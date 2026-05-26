import type { Worker, Calculation, CalculationWithWorker, WorkerFormData } from './types';
import type { CalculationPipeline, PipelineFormData } from './pipeline-types';

// ============ Storage keys ============

const WORKERS_KEY = 'bonus_calculator_workers';
const CALCULATIONS_KEY = 'bonus_calculator_calculations';
const PIPELINE_STORAGE_KEY = 'bonus_calculator_pipeline';

// ============ Internal helpers ============

const isBrowser = (): boolean => typeof window !== 'undefined';

function readArray<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function newId(): string {
  if (isBrowser() && typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const nowIso = (): string => new Date().toISOString();

function attachWorker(
  calc: Calculation,
  workersById: Map<string, Worker>
): CalculationWithWorker {
  const worker = workersById.get(calc.worker_id);
  return {
    ...calc,
    worker: worker
      ? { id: worker.id, name: worker.name }
      : { id: calc.worker_id, name: 'Unknown worker' },
  };
}

// ============ Workers ============

export async function getWorkers(): Promise<Worker[]> {
  const workers = readArray<Worker>(WORKERS_KEY);
  return [...workers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorker(id: string): Promise<Worker | null> {
  const workers = readArray<Worker>(WORKERS_KEY);
  return workers.find((w) => w.id === id) ?? null;
}

export async function createWorker(worker: WorkerFormData): Promise<Worker> {
  const workers = readArray<Worker>(WORKERS_KEY);
  const now = nowIso();
  const created: Worker = {
    id: newId(),
    name: worker.name,
    formula_config: worker.formula_config,
    created_at: now,
    updated_at: now,
  };
  workers.push(created);
  writeArray(WORKERS_KEY, workers);
  return created;
}

export async function updateWorker(
  id: string,
  worker: Partial<WorkerFormData>
): Promise<Worker> {
  const workers = readArray<Worker>(WORKERS_KEY);
  const index = workers.findIndex((w) => w.id === id);
  if (index === -1) throw new Error(`Worker not found: ${id}`);

  const updated: Worker = {
    ...workers[index],
    ...worker,
    updated_at: nowIso(),
  };
  workers[index] = updated;
  writeArray(WORKERS_KEY, workers);
  return updated;
}

export async function deleteWorker(id: string): Promise<void> {
  const workers = readArray<Worker>(WORKERS_KEY);
  const filtered = workers.filter((w) => w.id !== id);
  writeArray(WORKERS_KEY, filtered);
}

// ============ Calculations ============

export async function getCalculations(filters?: {
  workerId?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
}): Promise<CalculationWithWorker[]> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const workers = readArray<Worker>(WORKERS_KEY);
  const workersById = new Map(workers.map((w) => [w.id, w]));

  let filtered = calculations;
  if (filters?.workerId) {
    filtered = filtered.filter((c) => c.worker_id === filters.workerId);
  }
  if (filters?.period) {
    filtered = filtered.filter((c) => c.period === filters.period);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((c) => c.created_at >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((c) => c.created_at <= filters.endDate!);
  }

  filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return filtered.map((c) => attachWorker(c, workersById));
}

export async function getCalculation(id: string): Promise<CalculationWithWorker | null> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const calc = calculations.find((c) => c.id === id);
  if (!calc) return null;

  const workers = readArray<Worker>(WORKERS_KEY);
  const workersById = new Map(workers.map((w) => [w.id, w]));
  return attachWorker(calc, workersById);
}

export async function createCalculation(
  calculation: Omit<Calculation, 'id' | 'created_at'>
): Promise<Calculation> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const created: Calculation = {
    id: newId(),
    created_at: nowIso(),
    ...calculation,
  };
  calculations.push(created);
  writeArray(CALCULATIONS_KEY, calculations);
  return created;
}

export async function deleteCalculation(id: string): Promise<void> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const filtered = calculations.filter((c) => c.id !== id);
  writeArray(CALCULATIONS_KEY, filtered);
}

// ============ Pipelines ============
// Single-pipeline model stored under PIPELINE_STORAGE_KEY (object, not array).

function getLocalPipeline(): CalculationPipeline | null {
  if (!isBrowser()) return null;
  try {
    const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CalculationPipeline) : null;
  } catch {
    return null;
  }
}

function saveLocalPipeline(pipeline: CalculationPipeline): void {
  if (!isBrowser()) return;
  localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(pipeline));
}

function removeLocalPipeline(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PIPELINE_STORAGE_KEY);
}

export async function getPipelines(): Promise<CalculationPipeline[]> {
  const pipeline = getLocalPipeline();
  return pipeline ? [pipeline] : [];
}

export async function getDefaultPipeline(): Promise<CalculationPipeline | null> {
  return getLocalPipeline();
}

export async function getPipeline(id: string): Promise<CalculationPipeline | null> {
  const pipeline = getLocalPipeline();
  return pipeline?.id === id ? pipeline : null;
}

export async function createPipeline(
  pipeline: PipelineFormData
): Promise<CalculationPipeline> {
  const now = nowIso();
  const created: CalculationPipeline = {
    id: newId(),
    name: pipeline.name,
    rows: pipeline.rows,
    created_at: now,
    updated_at: now,
  };
  saveLocalPipeline(created);
  return created;
}

export async function updatePipeline(
  id: string,
  updates: Partial<PipelineFormData>
): Promise<CalculationPipeline> {
  const existing = getLocalPipeline();
  const base: CalculationPipeline = existing ?? {
    id,
    name: 'Pipeline',
    rows: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const updated: CalculationPipeline = {
    ...base,
    ...updates,
    id,
    updated_at: nowIso(),
  };
  saveLocalPipeline(updated);
  return updated;
}

export async function deletePipeline(_id: string): Promise<void> {
  removeLocalPipeline();
}

// ============ Stats ============

export async function getQuarterlyStats(period: string): Promise<{
  totalAmount: number;
  calculationCount: number;
}> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const matching = calculations.filter((c) => c.period === period);
  const totalAmount = matching.reduce((sum, c) => sum + Number(c.final_amount), 0);
  return {
    totalAmount,
    calculationCount: matching.length,
  };
}

export async function getRecentCalculations(
  limit: number = 5
): Promise<CalculationWithWorker[]> {
  const all = await getCalculations();
  return all.slice(0, limit);
}
