import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { resetDemoUser, DEMO_USER_EMAIL } from '../../../prisma/seeds/demo-seed';

/**
 * Service for resetting the demo user data on a schedule.
 *
 * Runs every 30 minutes to reset demo user's:
 * - Goals (item, finance, action)
 * - Messages and chats
 * - Plaid accounts (restores demo sandbox account)
 * - Rate limit usage
 */
@Injectable()
export class DemoResetService {
  private readonly logger = new Logger(DemoResetService.name);
  private readonly demoUserEmail: string;
  private readonly resetIntervalMinutes: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.demoUserEmail =
      this.configService.get<string>('DEMO_USER_EMAIL') || DEMO_USER_EMAIL;
    this.resetIntervalMinutes = parseInt(
      this.configService.get<string>('DEMO_USER_RESET_INTERVAL_MINUTES') || '30',
      10,
    );
  }

  /**
   * Reset demo user data on schedule.
   * Runs every 30 minutes by default (at :00 and :30).
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCronReset() {
    this.logger.log('Starting scheduled demo user reset...');
    await this.resetDemoUserData();
  }

  /**
   * Manual reset endpoint (for testing or admin use).
   */
  async manualReset(): Promise<{ success: boolean; message: string }> {
    this.logger.log('Manual demo user reset triggered');
    return this.resetDemoUserData();
  }

  /**
   * Perform the actual reset.
   */
  private async resetDemoUserData(): Promise<{ success: boolean; message: string }> {
    try {
      // Find demo user
      const user = await this.prisma.user.findUnique({
        where: { email: this.demoUserEmail },
      });

      if (!user) {
        const message = `Demo user not found: ${this.demoUserEmail}`;
        this.logger.warn(message);
        return { success: false, message };
      }

      if (!user.isDemo) {
        const message = `User ${this.demoUserEmail} is not marked as demo user`;
        this.logger.error(message);
        return { success: false, message };
      }

      // Reset the demo user data
      await resetDemoUser(user.id);

      const message = `Demo user reset complete: ${user.id}`;
      this.logger.log(message);
      return { success: true, message };
    } catch (error) {
      const message = `Failed to reset demo user: ${error.message}`;
      this.logger.error(message, error.stack);
      return { success: false, message };
    }
  }

  /**
   * Get time until next reset.
   */
  getNextResetTime(): Date {
    const now = new Date();
    const minutes = now.getMinutes();
    const nextReset = new Date(now);

    if (minutes < 30) {
      nextReset.setMinutes(30, 0, 0);
    } else {
      nextReset.setHours(nextReset.getHours() + 1, 0, 0, 0);
    }

    return nextReset;
  }
}
