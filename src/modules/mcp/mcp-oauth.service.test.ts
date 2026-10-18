import { describe, expect, it, mock } from 'bun:test';
import { createHash } from 'node:crypto';
import { McpOAuthService } from './mcp-oauth.service';

function inMemoryPrisma() {
  const clients: any[] = [];
  const requests: any[] = [];
  const codes: any[] = [];
  const tokens: any[] = [];
  let sequence = 0;
  const nextId = () => `id-${++sequence}`;
  const prisma: any = {
    mcpOAuthClient: {
      create: mock(async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        clients.push(row);
        return row;
      }),
      findUnique: mock(async ({ where }: any) => clients.find((row) => row.clientId === where.clientId) || null),
    },
    mcpOAuthAuthorizationRequest: {
      create: mock(async ({ data }: any) => {
        const row = { createdAt: new Date(), consumedAt: null, userId: null, ...data };
        requests.push(row);
        return row;
      }),
      findUnique: mock(async ({ where, include }: any) => {
        const row = requests.find((item) => item.id === where.id);
        if (!row) return null;
        return include ? { ...row, client: clients.find((client) => client.clientId === row.clientId) } : row;
      }),
      updateMany: mock(async ({ where, data }: any) => {
        const row = requests.find((item) => item.id === where.id && item.consumedAt === null && item.expiresAt > new Date());
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    mcpOAuthAuthorizationCode: {
      create: mock(async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), usedAt: null, ...data };
        codes.push(row);
        return row;
      }),
      findUnique: mock(async ({ where }: any) => codes.find((row) => row.codeHash === where.codeHash) || null),
      updateMany: mock(async ({ where, data }: any) => {
        const row = codes.find((item) => item.id === where.id && item.usedAt === null && item.expiresAt > new Date());
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    mcpOAuthToken: {
      create: mock(async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), revokedAt: null, lastUsedAt: null, ...data };
        tokens.push(row);
        return row;
      }),
      findUnique: mock(async ({ where }: any) => {
        if (where.accessTokenHash) return tokens.find((row) => row.accessTokenHash === where.accessTokenHash) || null;
        if (where.refreshTokenHash) return tokens.find((row) => row.refreshTokenHash === where.refreshTokenHash) || null;
        return null;
      }),
      update: mock(async ({ where, data }: any) => {
        const row = tokens.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: mock(async ({ where, data }: any) => {
        const rows = tokens.filter((row) => {
          if (where.id && row.id !== where.id) return false;
          if (where.clientId && row.clientId !== where.clientId) return false;
          if (where.revokedAt === null && row.revokedAt !== null) return false;
          if (where.OR) {
            return where.OR.some((condition: any) =>
              (condition.accessTokenHash && row.accessTokenHash === condition.accessTokenHash) ||
              (condition.refreshTokenHash && row.refreshTokenHash === condition.refreshTokenHash));
          }
          return true;
        });
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
  };
  prisma.$transaction = mock(async (callback: any) => callback(prisma));
  return { prisma, clients, requests, codes, tokens };
}

function serviceFixture() {
  const db = inMemoryPrisma();
  const config = {
    get: (key: string) => ({
      MCP_ENABLED: 'true',
      MCP_OAUTH_ENABLED: 'true',
      MCP_PUBLIC_BASE_URL: 'https://goals.example.com/api',
    } as Record<string, string>)[key],
  };
  const auth = { validateCredentials: mock(async () => ({ id: 'user-1' })) };
  return { ...db, auth, service: new McpOAuthService(config as any, db.prisma, auth as any) };
}

describe('McpOAuthService', () => {
  it('publishes resource and authorization server metadata for PKCE clients', () => {
    const { service } = serviceFixture();
    expect(service.protectedResourceMetadata()).toMatchObject({
      resource: 'https://goals.example.com/api/mcp',
      authorization_servers: ['https://goals.example.com/api'],
      scopes_supported: ['goals:read', 'goals:write'],
    });
    expect(service.authorizationServerMetadata()).toMatchObject({
      issuer: 'https://goals.example.com/api',
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    });
    expect(service.openIdProviderMetadata()).toMatchObject({
      jwks_uri: 'https://goals.example.com/api/oauth/jwks',
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  });

  it('runs DCR, authorization code + PKCE, refresh rotation, and revocation', async () => {
    const { service, requests } = serviceFixture();
    const client: any = await service.registerClient({
      client_name: 'OpenClaw',
      redirect_uris: ['http://127.0.0.1:33418/oauth/callback'],
      token_endpoint_auth_method: 'none',
    });
    const verifier = 'v'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorization = await service.beginAuthorization({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: 'https://goals.example.com/api/mcp',
      scope: 'goals:read goals:write',
      state: 'client-state',
    });
    expect(requests[0].oauthStateHash).not.toContain(authorization.githubState);

    const redirect = new URL(await service.authorizeWithPassword(authorization.requestId, 'casey@example.com', 'correct horse'));
    expect(redirect.searchParams.get('state')).toBe('client-state');
    expect(redirect.searchParams.get('iss')).toBe('https://goals.example.com/api');

    const first: any = await service.exchangeToken({
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      code_verifier: verifier,
      resource: 'https://goals.example.com/api/mcp',
    });
    expect(first.access_token).toStartWith('ngat_');
    expect(first.refresh_token).toStartWith('ngrt_');
    expect(await service.resolveAccessToken(first.access_token)).toMatchObject({
      userId: 'user-1',
      scopes: ['goals:read', 'goals:write'],
    });

    const second: any = await service.exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
      client_id: client.client_id,
      resource: 'https://goals.example.com/api/mcp',
      scope: 'goals:read',
    });
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.scope).toBe('goals:read');
    expect(service.exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
      client_id: client.client_id,
      resource: 'https://goals.example.com/api/mcp',
    })).rejects.toThrow('revoked');

    await service.revokeToken({ token: second.access_token, client_id: client.client_id });
    expect(await service.resolveAccessToken(second.access_token)).toBeNull();
  });

  it('rejects non-HTTPS non-loopback redirect URIs', async () => {
    const { service } = serviceFixture();
    expect(service.registerClient({ redirect_uris: ['http://attacker.example/callback'] }))
      .rejects.toThrow('HTTPS or loopback HTTP');
  });
});
