import { describe, expect, it } from 'bun:test';

import {
  buildInstitutionSettings,
  buildTestingCustomerUsername,
} from './finicity.helpers';

describe('finicity helpers', () => {
  it('builds deterministic probe usernames', () => {
    expect(buildTestingCustomerUsername(12345)).toBe(
      'neon_finicity_probe_12345',
    );
  });

  it('omits institution settings when no institution is provided', () => {
    expect(buildInstitutionSettings()).toEqual({});
  });

  it('passes through institution id when provided', () => {
    expect(buildInstitutionSettings(4222)).toEqual({ institutionId: 4222 });
  });
});
