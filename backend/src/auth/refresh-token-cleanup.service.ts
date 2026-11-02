import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS = 7;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Keep expired tokens for a while to investigate sessions and suspicious activity
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeExpired() {
    const threshold = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: threshold } },
    });
    this.logger.log(`Removed ${count} expired refresh tokens`);
  }
}
