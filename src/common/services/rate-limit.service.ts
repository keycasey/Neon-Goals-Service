import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/**
 * Rate limit configuration
 */
export const RATE_LIMIT_CONFIG = {
  MAX_MESSAGES_PER_DAY: 20,
  RESET_HOUR_UTC: 0, // Midnight UTC
} as const;

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

/**
 * Service for managing chat message rate limits.
 *
 * Implements a global 20 messages/day limit per user across all chat types.
 * Resets at UTC midnight.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Check and increment rate limit for a user.
   * Throws HttpException if rate limit exceeded.
   *
   * @param userId - The user to check
   * @returns Rate limit info for response headers
   */
  async checkAndIncrement(userId: string): Promise<RateLimitResult> {
    const usage = await this.getOrCreateUsage(userId);
    const now = new Date();

    // Check if we need to reset (past resetAt time)
    if (now >= usage.resetAt) {
      await this.resetUsage(userId);
      return this.checkAndIncrement(userId);
    }

    // Check if limit exceeded
    if (usage.messageCount >= RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY) {
      const retryAfterSeconds = Math.ceil(
        (usage.resetAt.getTime() - now.getTime()) / 1000,
      );

      this.logger.warn(
        `Rate limit exceeded for user ${userId}. Reset in ${retryAfterSeconds}s`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily message limit exceeded',
          error: 'Too Many Requests',
          remaining: 0,
          limit: RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY,
          resetAt: usage.resetAt.toISOString(),
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment count
    const updated = await this.prisma.userUsage.update({
      where: { userId },
      data: { messageCount: { increment: 1 } },
    });

    return {
      allowed: true,
      remaining:
        RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY - updated.messageCount,
      limit: RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY,
      resetAt: usage.resetAt,
    };
  }

  /**
   * Get current rate limit status without incrementing.
   *
   * @param userId - The user to check
   * @returns Current rate limit status
   */
  async getStatus(userId: string): Promise<RateLimitResult> {
    const usage = await this.getOrCreateUsage(userId);
    const now = new Date();

    // Check if we need to reset
    if (now >= usage.resetAt) {
      await this.resetUsage(userId);
      return this.getStatus(userId);
    }

    const remaining = Math.max(
      0,
      RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY - usage.messageCount,
    );

    return {
      allowed: usage.messageCount < RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY,
      remaining,
      limit: RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_DAY,
      resetAt: usage.resetAt,
      retryAfterSeconds:
        remaining === 0
          ? Math.ceil((usage.resetAt.getTime() - now.getTime()) / 1000)
          : undefined,
    };
  }

  /**
   * Get or create usage record for a user.
   */
  private async getOrCreateUsage(userId: string) {
    let usage = await this.prisma.userUsage.findUnique({
      where: { userId },
    });

    if (!usage) {
      const resetAt = this.getNextMidnightUTC();
      usage = await this.prisma.userUsage.create({
        data: {
          userId,
          messageCount: 0,
          resetAt,
        },
      });
    }

    return usage;
  }

  /**
   * Reset usage count and set next reset time.
   */
  private async resetUsage(userId: string) {
    const resetAt = this.getNextMidnightUTC();
    await this.prisma.userUsage.update({
      where: { userId },
      data: {
        messageCount: 0,
        resetAt,
      },
    });
  }

  /**
   * Get the next UTC midnight timestamp.
   */
  private getNextMidnightUTC(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }
}
