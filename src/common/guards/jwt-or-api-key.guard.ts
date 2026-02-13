import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/**
 * JWT OR API Key Authentication Guard
 *
 * Allows access with EITHER a valid JWT token OR a valid API key.
 * This implements OR logic for authentication.
 *
 * Usage:
 * @UseGuards(JwtOrApiKeyGuard)
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const expectedApiKey = this.configService.get<string>('AGENT_API_KEY');

    // First, try API key authentication
    if (apiKey) {
      if (!expectedApiKey) {
        throw new UnauthorizedException('API key authentication not configured');
      }

      if (apiKey === expectedApiKey) {
        request.user = {
          id: 'agent',
          userId: 'agent',
          isAgent: true,
        };
        return true;
      }

      throw new UnauthorizedException('Invalid API key');
    }

    // No API key, try JWT authentication
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authentication provided');
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    if (!jwtSecret) {
      throw new UnauthorizedException('JWT not configured');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;

      // Agent service tokens carry role='agent' and the real user's ID
      if (decoded.role === 'agent') {
        request.user = {
          userId: decoded.sub,
          id: decoded.sub,
          isAgent: true,
          agentSource: decoded.source,
        };
        return true;
      }

      // Add userId from sub (JWT standard uses 'sub' for subject/user ID)
      request.user = {
        userId: decoded.sub,
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        avatar: decoded.avatar,
      };
      return true;
    } catch (error) {
      console.log('[JwtOrApiKeyGuard] JWT verification error:', error.message);
      throw new UnauthorizedException('Invalid or expired JWT token');
    }
  }
}
