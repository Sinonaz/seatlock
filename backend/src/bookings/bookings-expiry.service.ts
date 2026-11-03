import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingsExpiryService {
  private readonly logger = new Logger(BookingsExpiryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async expireStaleBookings() {
    const stale = await this.prisma.booking.findMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: 100,
    });
    for (const { id } of stale) {
      try {
        await this.bookings.expire(id);
      } catch (error) {
        this.logger.error(
          `Failed to expire booking ${id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
  }
}
