import { describe, expect, it } from 'bun:test';

import { isAllowedOrigin } from './cors';

describe('isAllowedOrigin', () => {
  it('allows requests without an origin header', () => {
    expect(isAllowedOrigin()).toBe(true);
  });

  it('allows localhost development origins', () => {
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
  });

  it('allows private network development origins', () => {
    expect(isAllowedOrigin('http://100.82.23.47:8080')).toBe(true);
  });

  it('allows the production frontend origin', () => {
    expect(isAllowedOrigin('https://goals.keycasey.com')).toBe(true);
  });

  it('allows lovable preview origins', () => {
    expect(
      isAllowedOrigin(
        'https://id-preview--595ad3d6-9a38-49fb-8663-93ceef31952f.lovable.app',
      ),
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'https://595ad3d6-9a38-49fb-8663-93ceef31952f.lovableproject.com',
      ),
    ).toBe(true);
  });

  it('rejects unrelated third-party origins', () => {
    expect(isAllowedOrigin('https://example.com')).toBe(false);
  });
});
