import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { transitionBooking } from '../bookings/booking-transition';
import { lockBookingEvent } from './payment-lock';
import { generateTicketCode } from './ticket-code';
import { RefundsService } from './refunds.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
  ) {}

  async handleEvent(event: Stripe.Event) {
    if (
      await this.prisma.processedWebhookEvent.findUnique({
        where: { id: event.id },
      })
    )
      return;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          if (session.payment_status !== 'paid') return;
          const payment = await tx.payment.findUniqueOrThrow({
            where: { stripeCheckoutSessionId: session.id },
          });
          const booking = await lockBookingEvent(tx, payment.bookingId);
          const intent =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id;
          if (
            !intent ||
            session.amount_total !== payment.amountCents ||
            session.currency !== payment.currency ||
            session.metadata?.bookingId !== booking.id ||
            session.client_reference_id !== booking.id
          ) {
            throw new BadRequestException(
              'Checkout payment does not match the booking',
            );
          }
          const current = await tx.payment.findUniqueOrThrow({
            where: { id: payment.id },
          });
          if (current.status === 'REFUNDED' || current.status === 'SUCCEEDED')
            return;
          const now = new Date();
          const valid =
            booking.status === 'PENDING' &&
            booking.expiresAt > now &&
            booking.event.status === 'PUBLISHED' &&
            booking.event.startsAt > now;
          if (valid) {
            await transitionBooking(tx, booking.id, 'PENDING', 'PAID', {
              paidAt: now,
              ticketCode: generateTicketCode(),
            });
          } else if (booking.status === 'PENDING') {
            const status =
              booking.event.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED';
            if (
              await transitionBooking(
                tx,
                booking.id,
                'PENDING',
                status,
                status === 'CANCELLED' ? { cancelledAt: now } : {},
              )
            ) {
              await tx.event.update({
                where: { id: booking.eventId },
                data: { availableSeats: { increment: booking.quantity } },
              });
            }
          }
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCEEDED',
              stripePaymentIntentId: intent,
              refundRequested: !valid,
            },
          });
          this.logger.log(
            `Payment ${payment.id} received for booking ${booking.id}${valid ? '' : '; refund queued'}`,
          );
        } else if (event.type === 'checkout.session.expired') {
          await tx.payment.updateMany({
            where: {
              stripeCheckoutSessionId: event.data.object.id,
              status: 'PENDING',
            },
            data: { status: 'FAILED' },
          });
        } else if (event.type === 'charge.refunded') {
          const charge = event.data.object;
          if (!charge.refunded || charge.amount_refunded !== charge.amount)
            return;
          const intent =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id;
          if (!intent) return;
          const payment = await tx.payment.findUniqueOrThrow({
            where: { stripePaymentIntentId: intent },
          });
          const booking = await lockBookingEvent(tx, payment.bookingId);
          if (
            charge.currency !== payment.currency ||
            charge.amount !== payment.amountCents
          )
            throw new BadRequestException('Refund does not match the payment');
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
            where: { id: payment.id },
            data: { status: 'REFUNDED', refundRequested: false },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (await this.prisma.processedWebhookEvent.findUnique({
          where: { id: event.id },
        }))
      )
        return;
      throw error;
    }
    // Refund intent is durable; cron retries even if the process crashes here.
    if (event.type === 'checkout.session.completed') {
      const payment = await this.prisma.payment.findUnique({
        where: { stripeCheckoutSessionId: event.data.object.id },
      });
      if (payment?.refundRequested) {
        try {
          await this.refunds.processRefund(payment.id);
        } catch {
          this.logger.warn(`Refund retry queued for payment ${payment.id}`);
        }
      }
    }
  }
}
