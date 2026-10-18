import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Request } from 'express';
import { PrismaService } from '../../config/prisma.service';
import { McpOAuthService } from './mcp-oauth.service';

export type McpPrincipal = {
  userId: string;
  grantId: string;
  scopes: string[];
};

export type McpRequest = Request & { mcpPrincipal?: McpPrincipal };

export const hashMcpToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly oauth: McpOAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get('MCP_ENABLED') !== 'true') {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<McpRequest>();
    const response = context.switchToHttp().getResponse();
    const challenge = (details?: string) => {
      const metadata = this.config.get('MCP_OAUTH_ENABLED') === 'true'
        ? ` resource_metadata="${this.oauth.issuer}/.well-known/oauth-protected-resource"`
        : '';
      response.setHeader(
        'WWW-Authenticate',
        `Bearer${metadata}${details ? `${metadata ? ',' : ''} ${details}` : ''}`,
      );
    };
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      challenge(`scope="goals:read goals:write"`);
      throw new UnauthorizedException('Bearer token required');
    }
    const token = authorization.slice('Bearer '.length).trim();
    let principal: McpPrincipal | null = null;

    if (this.config.get('MCP_OAUTH_ENABLED') === 'true' && token.startsWith('ngat_')) {
      principal = await this.oauth.resolveAccessToken(token);
    }

    if (!principal && this.config.get('MCP_PERSONAL_GRANTS_ENABLED') === 'true' && token.startsWith('ngmcp_')) {
      const grant = await this.prisma.mcpPersonalGrant.findUnique({
        where: { tokenHash: hashMcpToken(token) },
      });
      if (grant && !grant.revokedAt && grant.expiresAt > new Date()) {
        principal = { userId: grant.userId, grantId: grant.id, scopes: grant.scopes };
        await this.prisma.mcpPersonalGrant.update({
          where: { id: grant.id },
          data: { lastUsedAt: new Date() },
        });
      }
    }

    if (!principal) {
      challenge('error="invalid_token"');
      throw new UnauthorizedException('Grant is invalid, expired, or revoked');
    }

    const method = (request.body as any)?.method;
    const toolName = method === 'tools/call' ? (request.body as any)?.params?.name : undefined;
    const writeTools = new Set([
      'create_goal',
      'update_goal',
      'set_goal_status',
      'add_goal_task',
      'update_goal_task',
      'remove_goal_task',
    ]);
    const requiredScope = writeTools.has(toolName) ? 'goals:write' :
      toolName === 'list_goals' || toolName === 'get_goal' ? 'goals:read' : null;
    const hasRequiredScope = requiredScope === 'goals:read'
      ? principal.scopes.includes('goals:read') || principal.scopes.includes('goals:write')
      : requiredScope ? principal.scopes.includes(requiredScope) : true;
    if (!hasRequiredScope) {
      challenge(`error="insufficient_scope", scope="${requiredScope}"`);
      throw new ForbiddenException(`Missing required scope: ${requiredScope}`);
    }
    if (!principal.scopes.includes('goals:read') && !principal.scopes.includes('goals:write')) {
      challenge('error="insufficient_scope", scope="goals:read goals:write"');
      throw new ForbiddenException('Grant has no goal scopes');
    }

    request.mcpPrincipal = principal;
    return true;
  }
}
