import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

describe('AgentRoutingModule', () => {
  it('does not import AuthModule directly', () => {
    const source = readFileSync(new URL('./agent-routing.module.ts', import.meta.url), 'utf8');

    expect(source.includes("import { AuthModule } from '../auth/auth.module';")).toBe(false);
    expect(source.includes('AuthModule,')).toBe(false);
  });
});
