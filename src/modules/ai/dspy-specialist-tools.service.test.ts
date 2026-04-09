import { describe, expect, it, mock } from 'bun:test';

import { DspySpecialistToolsService } from './dspy-specialist-tools.service';

describe('DspySpecialistToolsService', () => {
  it('dispatches get_financial_context for finance specialists', async () => {
    const aiTools = {
      getFinancialContext: mock(async () => ({ netMonthlyCashflow: 1050 })),
    } as any;
    const service = new DspySpecialistToolsService(aiTools);

    await expect(
      service.execute('finances', 'user-1', {
        name: 'get_financial_context',
        arguments: {},
      }),
    ).resolves.toEqual({
      ok: true,
      name: 'get_financial_context',
      result: { netMonthlyCashflow: 1050 },
    });

    expect(aiTools.getFinancialContext).toHaveBeenCalledWith('user-1');
  });

  it('rejects unsupported specialist tools', async () => {
    const aiTools = {
      getFinancialContext: mock(async () => ({ netMonthlyCashflow: 1050 })),
    } as any;
    const service = new DspySpecialistToolsService(aiTools);

    await expect(
      service.execute('items', 'user-1', {
        name: 'get_financial_context',
        arguments: {},
      }),
    ).rejects.toThrow('Unsupported DSPy specialist tool: items:get_financial_context');
  });
});
