import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../config/prisma.service';
import { AuthService } from '../auth/auth.service';

export const MCP_SCOPES = ['goals:read', 'goals:write'] as const;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000;

export class OAuthProtocolError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function hashOAuthSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseScopes(value?: string) {
  const scopes = [...new Set((value || MCP_SCOPES.join(' ')).split(/\s+/).filter(Boolean))];
  if (scopes.length === 0 || scopes.some((scope) => !MCP_SCOPES.includes(scope as any))) {
    throw new OAuthProtocolError('invalid_scope', 'Only goals:read and goals:write are supported');
  }
  return scopes;
}

function validateRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthProtocolError('invalid_redirect_uri', 'redirect_uri must be an absolute URL');
  }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new OAuthProtocolError('invalid_redirect_uri', 'redirect_uri must use HTTPS or loopback HTTP');
  }
  if (url.username || url.password || url.hash) {
    throw new OAuthProtocolError('invalid_redirect_uri', 'redirect_uri cannot contain credentials or a fragment');
  }
  return url.toString();
}

@Injectable()
export class McpOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  private requireEnabled() {
    if (this.config.get('MCP_ENABLED') !== 'true' || this.config.get('MCP_OAUTH_ENABLED') !== 'true') {
      throw new NotFoundException();
    }
  }

  get issuer() {
    const configured = this.config.get<string>('MCP_PUBLIC_BASE_URL') || this.config.get<string>('BACKEND_URL');
    if (!configured) {
      throw new ServiceUnavailableException('MCP_PUBLIC_BASE_URL is not configured');
    }
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new ServiceUnavailableException('MCP_PUBLIC_BASE_URL must use HTTPS');
    }
    return url.toString().replace(/\/$/, '');
  }

  get resource() {
    return `${this.issuer}/mcp`;
  }

  protectedResourceMetadata() {
    this.requireEnabled();
    return {
      resource: this.resource,
      authorization_servers: [this.issuer],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ['header'],
      resource_documentation: `${this.issuer}/oauth/docs`,
    };
  }

  authorizationServerMetadata() {
    this.requireEnabled();
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth/authorize`,
      token_endpoint: `${this.issuer}/oauth/token`,
      registration_endpoint: `${this.issuer}/oauth/register`,
      revocation_endpoint: `${this.issuer}/oauth/revoke`,
      scopes_supported: [...MCP_SCOPES],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    };
  }

  openIdProviderMetadata() {
    return {
      ...this.authorizationServerMetadata(),
      jwks_uri: `${this.issuer}/oauth/jwks`,
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
  }

  async registerClient(input: Record<string, unknown>) {
    this.requireEnabled();
    const redirectUris = input.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 20) {
      throw new OAuthProtocolError('invalid_client_metadata', 'redirect_uris must be a non-empty array');
    }
    const normalizedRedirectUris = [...new Set(redirectUris.map((uri) => {
      if (typeof uri !== 'string') {
        throw new OAuthProtocolError('invalid_client_metadata', 'Every redirect URI must be a string');
      }
      return validateRedirectUri(uri);
    }))];
    const authMethod = input.token_endpoint_auth_method ?? 'none';
    if (authMethod !== 'none') {
      throw new OAuthProtocolError('invalid_client_metadata', 'Only public PKCE clients are supported');
    }
    const grantTypes = Array.isArray(input.grant_types)
      ? input.grant_types.filter((value): value is string => typeof value === 'string')
      : ['authorization_code', 'refresh_token'];
    if (grantTypes.some((grant) => !['authorization_code', 'refresh_token'].includes(grant))) {
      throw new OAuthProtocolError('invalid_client_metadata', 'Unsupported grant type');
    }
    const responseTypes = Array.isArray(input.response_types)
      ? input.response_types.filter((value): value is string => typeof value === 'string')
      : ['code'];
    if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
      throw new OAuthProtocolError('invalid_client_metadata', 'Only the code response type is supported');
    }
    const clientName = typeof input.client_name === 'string' && input.client_name.trim()
      ? input.client_name.trim().slice(0, 200)
      : 'MCP client';
    const clientUri = typeof input.client_uri === 'string' ? validateRedirectUri(input.client_uri) : null;
    const clientId = randomToken('ngclient_');
    const client = await this.prisma.mcpOAuthClient.create({
      data: {
        clientId,
        clientName,
        clientUri,
        redirectUris: normalizedRedirectUris,
        tokenEndpointAuthMethod: 'none',
        grantTypes,
        responseTypes,
      },
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      client_uri: client.clientUri || undefined,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
    };
  }

  async beginAuthorization(query: Record<string, unknown>) {
    this.requireEnabled();
    const clientId = typeof query.client_id === 'string' ? query.client_id : '';
    const redirectUri = typeof query.redirect_uri === 'string' ? validateRedirectUri(query.redirect_uri) : '';
    const client = await this.prisma.mcpOAuthClient.findUnique({ where: { clientId } });
    if (!client || !client.redirectUris.includes(redirectUri)) {
      throw new OAuthProtocolError('invalid_request', 'Unknown client or redirect URI');
    }
    if (query.response_type !== 'code') {
      throw new OAuthProtocolError('unsupported_response_type', 'Only response_type=code is supported');
    }
    if (query.code_challenge_method !== 'S256' || typeof query.code_challenge !== 'string') {
      throw new OAuthProtocolError('invalid_request', 'S256 PKCE is required');
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(query.code_challenge)) {
      throw new OAuthProtocolError('invalid_request', 'Invalid PKCE code challenge');
    }
    if (query.resource !== this.resource) {
      throw new OAuthProtocolError('invalid_target', 'The resource parameter must identify this MCP server');
    }
    const scopes = parseScopes(typeof query.scope === 'string' ? query.scope : undefined);
    const requestId = randomToken('ngreq_');
    const oauthStateSecret = randomBytes(32).toString('base64url');
    await this.prisma.mcpOAuthAuthorizationRequest.create({
      data: {
        id: requestId,
        clientId,
        redirectUri,
        state: typeof query.state === 'string' ? query.state.slice(0, 2000) : null,
        scopes,
        resource: this.resource,
        codeChallenge: query.code_challenge,
        oauthStateHash: hashOAuthSecret(oauthStateSecret),
        expiresAt: new Date(Date.now() + AUTHORIZATION_REQUEST_TTL_MS),
      },
    });
    return {
      requestId,
      githubState: `ngoauth_${Buffer.from(requestId).toString('base64url')}.${oauthStateSecret}`,
      clientName: client.clientName,
      clientUri: client.clientUri,
      scopes,
    };
  }

  async getAuthorizationRequest(requestId: string) {
    this.requireEnabled();
    const request = await this.prisma.mcpOAuthAuthorizationRequest.findUnique({
      where: { id: requestId },
      include: { client: true },
    });
    if (!request || request.consumedAt || request.expiresAt <= new Date()) {
      throw new OAuthProtocolError('invalid_request', 'Authorization request is invalid or expired');
    }
    return {
      requestId: request.id,
      clientName: request.client.clientName,
      clientUri: request.client.clientUri,
      scopes: request.scopes,
    };
  }

  async authorizeWithPassword(requestId: string, email: string, password: string) {
    this.requireEnabled();
    const user = await this.auth.validateCredentials(email, password);
    if (!user) {
      throw new BadRequestException('Invalid email or password');
    }
    return this.completeAuthorizationRequest(requestId, user.id);
  }

  async denyAuthorization(requestId: string) {
    this.requireEnabled();
    const now = new Date();
    const request = await this.prisma.$transaction(async (tx) => {
      const current = await tx.mcpOAuthAuthorizationRequest.findUnique({ where: { id: requestId } });
      if (!current || current.consumedAt || current.expiresAt <= now) {
        throw new OAuthProtocolError('invalid_request', 'Authorization request is invalid or expired');
      }
      const consumed = await tx.mcpOAuthAuthorizationRequest.updateMany({
        where: { id: requestId, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new OAuthProtocolError('invalid_request', 'Authorization request was already used');
      }
      return current;
    });
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('error', 'access_denied');
    redirect.searchParams.set('error_description', 'The user denied access');
    if (request.state) redirect.searchParams.set('state', request.state);
    redirect.searchParams.set('iss', this.issuer);
    return redirect.toString();
  }

  async completeGithubAuthorization(state: string, userId: string) {
    this.requireEnabled();
    const match = /^ngoauth_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(state);
    if (!match) {
      throw new OAuthProtocolError('invalid_request', 'Invalid OAuth login state');
    }
    let requestId: string;
    try {
      requestId = Buffer.from(match[1], 'base64url').toString('utf8');
    } catch {
      throw new OAuthProtocolError('invalid_request', 'Invalid OAuth login state');
    }
    const request = await this.prisma.mcpOAuthAuthorizationRequest.findUnique({ where: { id: requestId } });
    if (!request || !constantTimeEqual(request.oauthStateHash, hashOAuthSecret(match[2]))) {
      throw new OAuthProtocolError('invalid_request', 'Invalid OAuth login state');
    }
    return this.completeAuthorizationRequest(requestId, userId);
  }

  private async completeAuthorizationRequest(requestId: string, userId: string) {
    const code = randomToken('ngcode_');
    const now = new Date();
    const request = await this.prisma.$transaction(async (tx) => {
      const current = await tx.mcpOAuthAuthorizationRequest.findUnique({ where: { id: requestId } });
      if (!current || current.consumedAt || current.expiresAt <= now) {
        throw new OAuthProtocolError('invalid_request', 'Authorization request is invalid or expired');
      }
      const consumed = await tx.mcpOAuthAuthorizationRequest.updateMany({
        where: { id: requestId, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now, userId },
      });
      if (consumed.count !== 1) {
        throw new OAuthProtocolError('invalid_request', 'Authorization request was already used');
      }
      await tx.mcpOAuthAuthorizationCode.create({
        data: {
          codeHash: hashOAuthSecret(code),
          clientId: current.clientId,
          userId,
          redirectUri: current.redirectUri,
          scopes: current.scopes,
          resource: current.resource,
          codeChallenge: current.codeChallenge,
          expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
        },
      });
      return current;
    });
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('code', code);
    if (request.state) redirect.searchParams.set('state', request.state);
    redirect.searchParams.set('iss', this.issuer);
    return redirect.toString();
  }

  async exchangeToken(body: Record<string, unknown>) {
    this.requireEnabled();
    const grantType = body.grant_type;
    if (grantType === 'authorization_code') return this.exchangeAuthorizationCode(body);
    if (grantType === 'refresh_token') return this.exchangeRefreshToken(body);
    throw new OAuthProtocolError('unsupported_grant_type', 'Unsupported grant_type');
  }

  private async exchangeAuthorizationCode(body: Record<string, unknown>) {
    const code = typeof body.code === 'string' ? body.code : '';
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    const redirectUri = typeof body.redirect_uri === 'string' ? validateRedirectUri(body.redirect_uri) : '';
    const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new OAuthProtocolError('invalid_grant', 'Invalid PKCE verifier');
    }
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const now = new Date();
    const tokenPair = this.newTokenPair();
    const token = await this.prisma.$transaction(async (tx) => {
      const authorizationCode = await tx.mcpOAuthAuthorizationCode.findUnique({
        where: { codeHash: hashOAuthSecret(code) },
      });
      if (
        !authorizationCode || authorizationCode.usedAt || authorizationCode.expiresAt <= now ||
        authorizationCode.clientId !== clientId || authorizationCode.redirectUri !== redirectUri ||
        authorizationCode.resource !== body.resource || !constantTimeEqual(authorizationCode.codeChallenge, challenge)
      ) {
        throw new OAuthProtocolError('invalid_grant', 'Authorization code is invalid, expired, or already used');
      }
      const used = await tx.mcpOAuthAuthorizationCode.updateMany({
        where: { id: authorizationCode.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (used.count !== 1) {
        throw new OAuthProtocolError('invalid_grant', 'Authorization code was already used');
      }
      return tx.mcpOAuthToken.create({
        data: {
          clientId,
          userId: authorizationCode.userId,
          accessTokenHash: hashOAuthSecret(tokenPair.accessToken),
          refreshTokenHash: hashOAuthSecret(tokenPair.refreshToken),
          scopes: authorizationCode.scopes,
          resource: authorizationCode.resource,
          accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
          refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
      });
    });
    return this.tokenResponse(tokenPair, token.scopes);
  }

  private async exchangeRefreshToken(body: Record<string, unknown>) {
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    const resource = typeof body.resource === 'string' ? body.resource : '';
    const requestedScopes = typeof body.scope === 'string' ? parseScopes(body.scope) : null;
    const now = new Date();
    const tokenPair = this.newTokenPair();
    const token = await this.prisma.$transaction(async (tx) => {
      const current = await tx.mcpOAuthToken.findUnique({
        where: { refreshTokenHash: hashOAuthSecret(refreshToken) },
      });
      if (
        !current || current.revokedAt || !current.refreshExpiresAt || current.refreshExpiresAt <= now ||
        current.clientId !== clientId || current.resource !== resource
      ) {
        throw new OAuthProtocolError('invalid_grant', 'Refresh token is invalid, expired, or revoked');
      }
      const scopes = requestedScopes || current.scopes;
      if (scopes.some((scope) => !current.scopes.includes(scope))) {
        throw new OAuthProtocolError('invalid_scope', 'Refresh cannot add scopes');
      }
      const revoked = await tx.mcpOAuthToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new OAuthProtocolError('invalid_grant', 'Refresh token was already used');
      }
      return tx.mcpOAuthToken.create({
        data: {
          clientId,
          userId: current.userId,
          accessTokenHash: hashOAuthSecret(tokenPair.accessToken),
          refreshTokenHash: hashOAuthSecret(tokenPair.refreshToken),
          scopes,
          resource: current.resource,
          accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
          refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
      });
    });
    return this.tokenResponse(tokenPair, token.scopes);
  }

  private newTokenPair() {
    return { accessToken: randomToken('ngat_'), refreshToken: randomToken('ngrt_') };
  }

  private tokenResponse(pair: { accessToken: string; refreshToken: string }, scopes: string[]) {
    return {
      access_token: pair.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: pair.refreshToken,
      scope: scopes.join(' '),
    };
  }

  async revokeToken(body: Record<string, unknown>) {
    this.requireEnabled();
    const token = typeof body.token === 'string' ? body.token : '';
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    if (!token || !clientId) return;
    const hash = hashOAuthSecret(token);
    await this.prisma.mcpOAuthToken.updateMany({
      where: {
        clientId,
        revokedAt: null,
        OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }],
      },
      data: { revokedAt: new Date() },
    });
  }

  async resolveAccessToken(token: string) {
    if (!token.startsWith('ngat_')) return null;
    const now = new Date();
    const grant = await this.prisma.mcpOAuthToken.findUnique({
      where: { accessTokenHash: hashOAuthSecret(token) },
    });
    if (!grant || grant.revokedAt || grant.accessExpiresAt <= now || grant.resource !== this.resource) {
      return null;
    }
    await this.prisma.mcpOAuthToken.update({
      where: { id: grant.id },
      data: { lastUsedAt: now },
    });
    return { userId: grant.userId, grantId: grant.id, scopes: grant.scopes };
  }
}
