import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AgentTokenPayload {
  userId: string;
  role: 'agent';
  source: string;
}

@Injectable()
export class AgentAuthService {
  constructor(private jwtService: JwtService) {}

  /**
   * Generate a short-lived JWT for agent-to-agent calls.
   * Carries the real user's ID so the specialist operates in user context.
   */
  generateAgentToken(userId: string, sourceAgent: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        role: 'agent',
        source: sourceAgent,
      },
      { expiresIn: '60s' },
    );
  }

  /**
   * Validate an agent token and extract its payload.
   * Returns null if the token is invalid or expired.
   */
  validateAgentToken(token: string): AgentTokenPayload | null {
    try {
      const decoded = this.jwtService.verify(token) as any;
      if (decoded.role !== 'agent') return null;
      return {
        userId: decoded.sub,
        role: 'agent',
        source: decoded.source,
      };
    } catch {
      return null;
    }
  }
}
