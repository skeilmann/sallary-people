import { describe, expect, it } from 'vitest';
import { generateDefaultPipeline, validatePipeline } from './pipeline-utils';
import { companyPipeline, companyWorkers, makePipeline, teamPool } from './test-fixtures';

describe('validatePipeline', () => {
  it('accepts the company setup, including people paid salary only', () => {
    expect(validatePipeline(companyPipeline, companyWorkers)).toEqual({ valid: true, warnings: [], errors: [] });
  });

  it('warns when pool members also have their own commission card (paid twice)', () => {
    const generated = generateDefaultPipeline(companyWorkers);
    generated.rows[generated.rows.length - 1].items.push({ id: 'pool', ...teamPool });
    const { warnings } = validatePipeline(generated, companyWorkers);
    expect(warnings).toContainEqual({ code: 'paidTwice', values: { name: 'Kiril' } });
    expect(warnings).toContainEqual({ code: 'paidTwice', values: { name: 'Liuba' } });
  });

  it('warns when a pool built on members\' sales includes someone with no own-sales field', () => {
    const pipeline = makePipeline([[{ ...teamPool, participantIds: ['Kiril', 'George'] }]]);
    expect(validatePipeline(pipeline, companyWorkers).warnings).toEqual([
      { code: 'poolMemberWithoutSales', values: { name: 'George' } },
    ]);
  });

  it('warns about a pool with no rate, and about empty steps', () => {
    const pipeline = makePipeline([[{ ...teamPool, poolRate: 0 }], []]);
    expect(validatePipeline(pipeline, companyWorkers).warnings).toEqual([
      { code: 'poolNoRate', values: { step: 1 } },
      { code: 'emptyStep', values: { step: 2 } },
    ]);
  });

  it('reports cards that point to a deleted worker as errors', () => {
    const pipeline = makePipeline([[{ type: 'worker_commission', workerId: 'gone' }]]);
    const result = validatePipeline(pipeline, companyWorkers);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ code: 'missingWorker', values: { step: 1 } }]);
  });
});
