export const buildTestingCustomerUsername = (now: number): string =>
  `neon_finicity_probe_${now}`;

export const buildInstitutionSettings = (institutionId?: number) =>
  institutionId ? { institutionId } : {};
