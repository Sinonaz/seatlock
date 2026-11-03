import {
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Booking, Event, Payment, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain.exception';
import { transitionBooking } from '../bookings/booking-transition';
import { lockBookingEvent } from './payment-lock';
import { StripeGateway } from './stripe.gateway';
import { generateTicketCode } from './ticket-code';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly config: ConfigService,
  ) {}

  private assertPayable(booking: Booking & { event: Event }) {
    if (booking.status === 'EXPIRED' || booking.expiresAt <= new Date())
      throw new DomainException(
        HttpStatus.CONFLICT,
        'BOOKING_EXPIRED',
        'Booking has expired',
      );
    if (booking.status !== 'PENDING')
      throw new DomainException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_PENDING',
        'Booking is not pending',
      );
    if (
      booking.event.status !== 'PUBLISHED' ||
      booking.event.startsAt <= new Date()
    )
      throw new DomainException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_AVAILABLE',
        'Event not available',
      );
  }

  async createCheckout(
    userId: string,
    id: string,
  ): Promise<{ checkoutUrl: string }> {
    const attempt = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBookingEvent(tx, id, userId);
      this.assertPayable(booking);
      if (booking.totalCents === 0) {
        await transitionBooking(tx, id, 'PENDING', 'PAID', {
          paidAt: new Date(),
          ticketCode: generateTicketCode(),
        });
        return null;
      }
      this.stripe.requireClient();
      const pending = await tx.payment.findFirst({
        where: { bookingId: id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) return pending;
      const frontend = this.config
        .getOrThrow<string>('FRONTEND_URL')
        .replace(/\/$/, '');
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        line_items: [
          {
            quantity: booking.quantity,
            price_data: {
              currency: booking.currency,
              unit_amount: booking.unitPriceCents,
              product_data: { name: booking.event.title },
            },
          },
        ],
        customer_email: booking.user.email,
        client_reference_id: id,
        metadata: { bookingId: id },
        success_url: `${frontend}/bookings/${id}?payment=success`,
        cancel_url: `${frontend}/bookings/${id}?payment=cancelled`,
        // Persist the complete request so retries use identical Stripe parameters.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      };
      return tx.payment.create({
        data: {
          bookingId: id,
          amountCents: booking.totalCents,
          currency: booking.currency,
          checkoutRequest: params as Prisma.InputJsonObject,
        },
      });
    });
    if (!attempt) {
      this.logger.log(`Free booking ${id} paid`);
      return { checkoutUrl: `/bookings/${id}?payment=success` };
    }
    const session = await this.resolveSession(attempt);
    if (!session || session.status !== 'open' || !session.url) {
      // A completed session may still await its webhook: never open another checkout.
      if (session?.status === 'expired') {
        await this.prisma.payment.updateMany({
          where: { id: attempt.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
      throw new ServiceUnavailableException(
        'Checkout is awaiting confirmation or has closed. Please retry',
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        this.assertPayable(await lockBookingEvent(tx, id, userId));
      });
    } catch (error) {
      try {
        await this.closeSession(attempt.id);
      } catch {
        this.logger.warn(`Checkout cleanup queued for payment ${attempt.id}`);
      }
      throw error;
    }
    return { checkoutUrl: session.url };
  }

  async resolveSession(payment: Payment) {
    if (payment.stripeCheckoutSessionId)
      return this.stripe.retrieveCheckout(payment.stripeCheckoutSessionId);
    if (!payment.checkoutRequest)
      throw new ServiceUnavailableException('Checkout request is missing');
    // Stripe may prune idempotency keys after 24 hours. Never recreate an old attempt.
    if (Date.now() - payment.createdAt.getTime() > 23 * 3_600_000) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return null;
    }
    const session = await this.stripe.createCheckout(
      payment.checkoutRequest as unknown as Stripe.Checkout.SessionCreateParams,
      `checkout-${payment.id}`,
    );
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripeCheckoutSessionId: session.id },
    });
    return session;
  }

  async closeSession(id: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
    });
    if (payment.status !== 'PENDING') return;
    const session = await this.resolveSession(payment);
    if (!session) return;
    if (session.status === 'open') {
      try {
        await this.stripe.expireCheckout(session.id);
      } catch (error) {
        if ((await this.stripe.retrieveCheckout(session.id)).status === 'open')
          throw error;
      }
    }
    // A completed session must remain available to its completion webhook.
    const fresh = await this.stripe.retrieveCheckout(session.id);
    if (fresh.status === 'expired')
      await this.prisma.payment.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
  }

  async closeStaleSessions() {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        booking: {
          OR: [
            { status: { not: 'PENDING' } },
            { expiresAt: { lte: new Date() } },
            { event: { status: 'CANCELLED' } },
          ],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    for (const payment of payments) {
      try {
        await this.closeSession(payment.id);
      } catch (error) {
        this.logger.error(
          `Checkout cleanup failed for payment ${payment.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
  }
}
