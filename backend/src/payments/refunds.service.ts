import {
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain.exception';
import { transitionBooking } from '../bookings/booking-transition';
import {
  BOOKING_INCLUDE,
  toBookingResponse,
} from '../bookings/booking-response';
import { lockBookingEvent } from './payment-lock';
import { StripeGateway } from './stripe.gateway';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly config: ConfigService,
  ) {}

  async refundBooking(id: string, userId?: string) {
    const paymentId = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBookingEvent(tx, id, userId);
      if (booking.status !== 'PAID') {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'INVALID_STATUS_TRANSITION',
          'Invalid booking status transition',
        );
      }
      const payment = await tx.payment.findFirst({
        where: { bookingId: id, status: { in: ['SUCCEEDED', 'REFUNDED'] } },
      });
      if (
        userId &&
        !payment?.refundRequested &&
        booking.event.startsAt.getTime() - Date.now() <=
          this.config.getOrThrow<number>('REFUND_WINDOW_HOURS') * 3_600_000
      ) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'REFUND_WINDOW_CLOSED',
          'Refund window is closed',
        );
      }
      if (
        !userId &&
        booking.event.status !== 'CANCELLED' &&
        !payment?.refundRequested
      ) {
        throw new ServiceUnavailableException('Refund is not scheduled');
      }
      if (booking.totalCents === 0) {
        if (
          await transitionBooking(tx, id, 'PAID', 'REFUNDED', {
            cancelledAt: new Date(),
          })
        ) {
          await tx.event.update({
            where: { id: booking.eventId },
            data: { availableSeats: { increment: booking.quantity } },
          });
        }
        return null;
      }
      if (!payment?.stripePaymentIntentId)
        throw new ServiceUnavailableException(
          'Payment is not ready for refund',
        );
      this.stripe.requireClient();
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundRequested: true },
      });
      return payment.id;
    });
    if (paymentId) await this.processRefund(paymentId);
    return toBookingResponse(
      await this.prisma.booking.findUniqueOrThrow({
        where: { id },
        include: BOOKING_INCLUDE,
      }),
    );
  }

  async processRefund(id: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
    });
    if (payment.status === 'REFUNDED') return;
    if (!payment.refundRequested || !payment.stripePaymentIntentId) return;
    const refund = await this.stripe.refund(
      payment.stripePaymentIntentId,
      `refund-${payment.id}`,
    );
    if (refund.status !== 'succeeded')
      throw new ServiceUnavailableException('Refund is awaiting confirmation');
    await this.finishRefund(id);
  }

  async finishRefund(id: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
    });
    await this.prisma.$transaction(async (tx) => {
      const booking = await lockBookingEvent(tx, payment.bookingId);
      // Late payments keep their terminal booking status; seats were already released.
      if (
        await transitionBooking(tx, booking.id, 'PAID', 'REFUNDED', {
          cancelledAt: new Date(),
        })
      ) {
        await tx.event.update({
          where: { id: booking.eventId },
          data: { availableSeats: { increment: booking.quantity } },
        });
      }
      await tx.payment.update({
        where: { id },
        data: { status: 'REFUNDED', refundRequested: false },
      });
    });
    this.logger.log(`Payment ${id} refunded for booking ${payment.bookingId}`);
  }

  async refundCancelledEvents() {
    const bookings = await this.prisma.booking.findMany({
      where: { status: 'PAID', event: { status: 'CANCELLED' } },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    for (const booking of bookings) {
      try {
        await this.refundBooking(booking.id);
      } catch (error) {
        this.logger.error(
          `Refund failed for booking ${booking.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
    const pending = await this.prisma.payment.findMany({
      where: { refundRequested: true, status: 'SUCCEEDED' },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    for (const payment of pending) {
      try {
        await this.processRefund(payment.id);
      } catch (error) {
        this.logger.error(
          `Refund retry failed for payment ${payment.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
  }
}
