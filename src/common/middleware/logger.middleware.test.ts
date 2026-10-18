import { describe, expect, it } from 'bun:test';
import { sanitizeLoggedUrl } from './logger.middleware';

describe('sanitizeLoggedUrl', () => {
  it('redacts OAuth credentials and correlation values while retaining useful routing fields', () => {
    const sanitized = sanitizeLoggedUrl(
      '/api/oauth/authorize?client_id=client-secret-ish&state=csrf-secret&code_challenge=pkce-value&scope=goals%3Aread&resource=https%3A%2F%2Fexample.com%2Fapi%2Fmcp',
    );
    expect(sanitized).toContain('client_id=%5Bredacted%5D');
    expect(sanitized).toContain('state=%5Bredacted%5D');
    expect(sanitized).toContain('code_challenge=%5Bredacted%5D');
    expect(sanitized).toContain('scope=goals%3Aread');
    expect(sanitized).not.toContain('csrf-secret');
  });
});
