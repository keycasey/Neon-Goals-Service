import { describe, expect, it, mock } from 'bun:test';
import { McpAuthGuard, hashMcpToken } from './mcp-auth.guard';

function context(request: any, setHeader = mock(() => {})) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as any;
}

describe('McpAuthGuard', () => {
  it('resolves a valid private grant without retaining the plaintext token', async () => {
    const token = `ngmcp_${'a'.repeat(43)}`;
    const prisma = {
      mcpPersonalGrant: {
        findUnique: mock(async ({ where }: any) => {
          expect(where.tokenHash).toBe(hashMcpToken(token));
          return {
            id: 'grant-1',
            userId: 'user-1',
            scopes: ['goals:read'],
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
          };
        }),
        update: mock(async () => ({})),
      },
    };
    const guard = new McpAuthGuard(
      { get: (key: string) => ({ MCP_ENABLED: 'true', MCP_PERSONAL_GRANTS_ENABLED: 'true' })[key] } as any,
      prisma as any,
      {} as any,
    );
    const request = { headers: { authorization: `Bearer ${token}` } };
    expect(await guard.canActivate(context(request))).toBe(true);
    expect(request.mcpPrincipal).toEqual({ userId: 'user-1', grantId: 'grant-1', scopes: ['goals:read'] });
  });

  it('hides the endpoint while MCP is disabled', async () => {
    const guard = new McpAuthGuard({ get: () => 'false' } as any, {} as any, {} as any);
    expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow();
  });

  it('advertises protected resource metadata on an unauthenticated request', async () => {
    const setHeader = mock(() => {});
    const guard = new McpAuthGuard(
      { get: (key: string) => ({ MCP_ENABLED: 'true', MCP_OAUTH_ENABLED: 'true' })[key] } as any,
      {} as any,
      { issuer: 'https://goals.example.com/api' } as any,
    );
    expect(guard.canActivate(context({ headers: {} }, setHeader))).rejects.toThrow('Bearer token required');
    expect(setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://goals.example.com/api/.well-known/oauth-protected-resource", scope="goals:read goals:write"',
    );
  });

  it('returns insufficient_scope when a read token calls a write tool', async () => {
    const setHeader = mock(() => {});
    const guard = new McpAuthGuard(
      { get: (key: string) => ({ MCP_ENABLED: 'true', MCP_OAUTH_ENABLED: 'true' })[key] } as any,
      {} as any,
      {
        issuer: 'https://goals.example.com/api',
        resolveAccessToken: mock(async () => ({ userId: 'user-1', grantId: 'token-1', scopes: ['goals:read'] })),
      } as any,
    );
    const request = {
      headers: { authorization: `Bearer ngat_${'a'.repeat(43)}` },
      body: { method: 'tools/call', params: { name: 'create_goal' } },
    };
    expect(guard.canActivate(context(request, setHeader))).rejects.toThrow('Missing required scope');
    expect(setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://goals.example.com/api/.well-known/oauth-protected-resource", error="insufficient_scope", scope="goals:write"',
    );
  });
});
