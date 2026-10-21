import { describe, expect, it } from 'bun:test';
import { validateEnvironment } from './env.validation';

const productionConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@host/database',
  JWT_SECRET: 'jwt-secret-that-is-long-enough',
  WORKER_API_KEY: 'worker-secret-that-is-long-enough',
  PLAID_TOKEN_ENCRYPTION_KEY: 'plaid-secret-that-is-long-enough',
};

describe('validateEnvironment', () => {
  it('allows non-production environments without production secrets', () => {
    expect(validateEnvironment({ NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test' });
  });

  it('fails closed when a production secret is absent', () => {
    const { WORKER_API_KEY: _missing, ...config } = productionConfig;
    expect(() => validateEnvironment(config)).toThrow('WORKER_API_KEY');
  });

  it('requires an HTTPS public URL when MCP OAuth is enabled', () => {
    expect(() => validateEnvironment({
      ...productionConfig,
      MCP_OAUTH_ENABLED: 'true',
      MCP_PUBLIC_BASE_URL: 'http://goals.example.test/api',
    })).toThrow('MCP_PUBLIC_BASE_URL');
  });

  it('accepts a complete production configuration', () => {
    const config = {
      ...productionConfig,
      MCP_OAUTH_ENABLED: 'true',
      MCP_PUBLIC_BASE_URL: 'https://goals.example.test/api',
    };
    expect(validateEnvironment(config)).toBe(config);
  });
});
