import { describe, expect, it } from 'bun:test';
import { PlaidTokenCipherService } from './plaid-token-cipher.service';

function config(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
  } as any;
}

describe('PlaidTokenCipherService', () => {
  it('encrypts with authenticated ciphertext and decrypts the token', () => {
    const cipher = new PlaidTokenCipherService(
      config({ PLAID_TOKEN_ENCRYPTION_KEY: 'test-key-material-that-is-long-enough' }),
    );

    const encrypted = cipher.encrypt('access-sandbox-secret');

    expect(encrypted).not.toContain('access-sandbox-secret');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe('access-sandbox-secret');
  });

  it('rejects a modified authentication tag', () => {
    const cipher = new PlaidTokenCipherService(
      config({ PLAID_TOKEN_ENCRYPTION_KEY: 'test-key-material-that-is-long-enough' }),
    );
    const parts = cipher.encrypt('access-sandbox-secret').split(':');
    parts[2] = Buffer.alloc(16, 1).toString('base64');

    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });

  it('requires an explicit production encryption key', () => {
    expect(
      () => new PlaidTokenCipherService(config({ NODE_ENV: 'production' })),
    ).toThrow('PLAID_TOKEN_ENCRYPTION_KEY must be set in production');
  });
});
