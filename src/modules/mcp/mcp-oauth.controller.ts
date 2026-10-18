import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { McpOAuthService, OAuthProtocolError } from './mcp-oauth.service';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function oauthPage(input: {
  issuer: string;
  requestId: string;
  clientName: string;
  clientUri?: string | null;
  scopes: string[];
  githubState?: string;
  githubUrl?: string;
  error?: string;
}) {
  const scopeItems = input.scopes.map((scope) => {
    const label = scope === 'goals:write'
      ? 'Create, update, complete, archive, restore, and manage tasks on your goals'
      : 'Read your goals and their details';
    return `<li><strong>${escapeHtml(scope)}</strong><span>${escapeHtml(label)}</span></li>`;
  }).join('');
  const clientLink = input.clientUri
    ? `<a href="${escapeHtml(input.clientUri)}" rel="noreferrer">${escapeHtml(input.clientName)}</a>`
    : escapeHtml(input.clientName);
  const githubButton = input.githubState && input.githubUrl
    ? `<a class="github" href="${escapeHtml(input.githubUrl)}?state=${encodeURIComponent(input.githubState)}">Continue with GitHub and allow</a><div class="or"><span>or use email</span></div>`
    : '';
  const error = input.error ? `<div class="error" role="alert">${escapeHtml(input.error)}</div>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect ${escapeHtml(input.clientName)} · Neon Goals</title>
<style>
:root{color-scheme:dark;--bg:#070812;--card:#111426;--line:#2a3150;--text:#f5f7ff;--muted:#aab2d0;--pink:#ff4fd8;--cyan:#44e8ff;--danger:#ff8c9f}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 18% 12%,#25124a 0,transparent 36%),radial-gradient(circle at 85% 82%,#073c4a 0,transparent 32%),var(--bg);font:15px/1.5 ui-sans-serif,system-ui;color:var(--text);padding:24px}.card{width:min(100%,520px);background:color-mix(in srgb,var(--card) 92%,transparent);border:1px solid var(--line);border-radius:22px;padding:30px;box-shadow:0 24px 80px #0008}.brand{font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);font-size:12px}.mark{font-size:34px;margin:8px 0 2px}h1{font-size:27px;line-height:1.15;margin:0 0 8px}p{color:var(--muted);margin:0 0 18px}a{color:var(--cyan)}ul{list-style:none;padding:0;margin:18px 0 24px;border:1px solid var(--line);border-radius:14px;overflow:hidden}li{padding:12px 14px;background:#0b0e1b}li+li{border-top:1px solid var(--line)}li strong{display:block;color:var(--pink);font-size:13px}li span{display:block;color:var(--muted);font-size:13px;margin-top:2px}label{display:block;margin:12px 0 6px;font-weight:650}input{width:100%;border:1px solid var(--line);background:#080b16;color:var(--text);border-radius:11px;padding:12px 13px;font:inherit;outline:none}input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px #44e8ff22}button,.github{display:block;width:100%;border:0;border-radius:11px;padding:13px 16px;margin-top:16px;font:inherit;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}.allow{background:linear-gradient(90deg,var(--pink),#875cff);color:white}.github{background:#f4f6ff;color:#111426}.deny{background:transparent;color:var(--muted);border:1px solid var(--line);margin-top:10px}.or{height:20px;border-bottom:1px solid var(--line);text-align:center;margin:8px 0 23px}.or span{position:relative;top:9px;background:var(--card);padding:0 10px;color:var(--muted);font-size:12px}.error{background:#3b1520;border:1px solid #7b2d43;color:#ffdbe2;border-radius:11px;padding:11px 13px;margin:14px 0}.foot{font-size:12px;color:var(--muted);margin-top:20px;text-align:center}
</style></head><body><main class="card"><div class="brand">Neon Goals</div><div class="mark">◈</div><h1>Connect ${clientLink}?</h1><p>This lets the app work with your Neon Goals account. You can revoke access later.</p>${error}<ul>${scopeItems}</ul>${githubButton}<form method="post" action="${escapeHtml(input.issuer)}/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(input.requestId)}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button class="allow" type="submit">Sign in and allow</button></form><form method="post" action="${escapeHtml(input.issuer)}/oauth/deny"><input type="hidden" name="request_id" value="${escapeHtml(input.requestId)}"><button class="deny" type="submit">Cancel</button></form><div class="foot">Your password is used only to sign in to Neon Goals and is never shared with the connecting app.</div></main></body></html>`;
}

@Controller()
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  private noStore(response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }

  private protocolError(response: Response, error: unknown) {
    this.noStore(response);
    if (error instanceof OAuthProtocolError) {
      return response.status(error.status).json({ error: error.error, error_description: error.message });
    }
    throw error;
  }

  @Get('.well-known/oauth-protected-resource')
  protectedResource() {
    return this.oauth.protectedResourceMetadata();
  }

  @Get('.well-known/oauth-protected-resource/mcp')
  pathProtectedResource() {
    return this.oauth.protectedResourceMetadata();
  }

  @Get('.well-known/oauth-authorization-server')
  authorizationServer() {
    return this.oauth.authorizationServerMetadata();
  }

  @Get('.well-known/openid-configuration')
  openIdConfiguration() {
    return this.oauth.openIdProviderMetadata();
  }

  @Get('oauth/jwks')
  jwks() {
    return { keys: [] };
  }

  @Post('oauth/register')
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  async register(@Body() body: Record<string, unknown>, @Res() response: Response) {
    try {
      this.noStore(response);
      return response.status(201).json(await this.oauth.registerClient(body));
    } catch (error) {
      return this.protocolError(response, error);
    }
  }

  @Get('oauth/authorize')
  async authorize(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      const request = await this.oauth.beginAuthorization(query);
      this.noStore(response);
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      return response.type('html').send(oauthPage({
        ...request,
        issuer: this.oauth.issuer,
        githubUrl: `${this.oauth.issuer}/auth/github`,
      }));
    } catch (error) {
      return this.protocolError(response, error);
    }
  }

  @Post('oauth/authorize')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async authorizePassword(
    @Body() body: { request_id?: string; email?: string; password?: string },
    @Res() response: Response,
  ) {
    const requestId = body.request_id || '';
    try {
      const redirect = await this.oauth.authorizeWithPassword(requestId, body.email || '', body.password || '');
      this.noStore(response);
      return response.redirect(303, redirect);
    } catch (error) {
      try {
        const request = await this.oauth.getAuthorizationRequest(requestId);
        this.noStore(response);
        response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        const message = error instanceof Error ? error.message : 'Unable to authorize this connection';
        return response.status(400).type('html').send(oauthPage({
          ...request,
          issuer: this.oauth.issuer,
          error: message,
        }));
      } catch (requestError) {
        return this.protocolError(response, requestError);
      }
    }
  }

  @Post('oauth/deny')
  async deny(@Body() body: { request_id?: string }, @Res() response: Response) {
    try {
      const redirect = await this.oauth.denyAuthorization(body.request_id || '');
      this.noStore(response);
      return response.redirect(303, redirect);
    } catch (error) {
      return this.protocolError(response, error);
    }
  }

  @Post('oauth/token')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async token(@Body() body: Record<string, unknown>, @Res() response: Response) {
    try {
      this.noStore(response);
      return response.json(await this.oauth.exchangeToken(body));
    } catch (error) {
      return this.protocolError(response, error);
    }
  }

  @Post('oauth/revoke')
  @HttpCode(200)
  async revoke(@Body() body: Record<string, unknown>, @Res() response: Response) {
    try {
      await this.oauth.revokeToken(body);
      this.noStore(response);
      return response.send();
    } catch (error) {
      return this.protocolError(response, error);
    }
  }

  @Get('oauth/docs')
  @Header('Cache-Control', 'public, max-age=300')
  docs() {
    return {
      name: 'Neon Goals MCP',
      resource: this.oauth.resource,
      scopes: {
        'goals:read': 'Read goals owned by the authenticated user',
        'goals:write': 'Create and update goals owned by the authenticated user',
      },
      revocation_endpoint: `${this.oauth.issuer}/oauth/revoke`,
    };
  }
}
