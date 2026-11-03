import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { DomainException } from '../common/domain.exception';
import { ConfigService } from '@nestjs/config';
import {
  BOOKING_INCLUDE,
  BookingWithEvent,
  toBookingResponse,
} from './booking-response';
import { transitionBooking } from './booking-transition';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly bookingTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.bookingTtlMinutes = config.getOrThrow<number>('BOOKING_TTL_MINUTES');
  }

  async getMyBookings(authUser: AuthUser) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: authUser.id },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_INCLUDE,
    });
    return bookings.map(toBookingResponse);
  }

  async getBooking(user: AuthUser, id: string) {
    return toBookingResponse(await this.findOwnBooking(user.id, id));
  }

  async cancelBooking(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.findOwnBooking(user.id, id, tx);
      // Match event cancellation's lock order: event first, booking second.
      await this.lockEvent(tx, booking.eventId);
      const changed = await transitionBooking(tx, id, 'PENDING', 'CANCELLED', {
        cancelledAt: new Date(),
      });
      if (!changed) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'INVALID_STATUS_TRANSITION',
          'Invalid booking status transition',
        );
      }
      await tx.event.update({
        where: { id: booking.eventId },
        data: { availableSeats: { increment: booking.quantity } },
      });
      return toBookingResponse(await this.findOwnBooking(user.id, id, tx));
    });
  }

  async createBooking(
    userId: string,
    createBookingDto: CreateBookingDto,
    idempotencyKey: string,
  ) {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          eventId: createBookingDto.eventId,
          quantity: createBookingDto.quantity,
        }),
      )
      .digest('hex');
    const existing = await this.findByIdempotencyKey(userId, idempotencyKey);

    if (existing) {
      return { booking: this.replay(existing, requestHash), created: false };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.lockEvent(tx, createBookingDto.eventId);
        // A concurrent request may have consumed the last seat with this key.
        const replay = await this.findByIdempotencyKey(
          userId,
          idempotencyKey,
          tx,
        );
        if (replay)
          return { booking: this.replay(replay, requestHash), created: false };
        const event = await tx.event.findUnique({
          where: { id: createBookingDto.eventId },
        });

        if (!event) {
          throw new NotFoundException('Event not found');
        }

        if (event.status !== 'PUBLISHED' || event.startsAt <= new Date()) {
          throw new DomainException(
            HttpStatus.CONFLICT,
            'EVENT_NOT_AVAILABLE',
            'Event not available',
          );
        }

        const { count } = await tx.event.updateMany({
          where: {
            id: event.id,
            status: 'PUBLISHED',
            startsAt: { gt: new Date() },
            availableSeats: {
              gte: createBookingDto.quantity,
            },
          },
          data: {
            availableSeats: {
              decrement: createBookingDto.quantity,
            },
          },
        });

        if (count === 0) {
          const fresh = await tx.event.findUniqueOrThrow({
            where: { id: createBookingDto.eventId },
          });

          if (fresh.status !== 'PUBLISHED' || fresh.startsAt <= new Date()) {
            throw new DomainException(
              HttpStatus.CONFLICT,
              'EVENT_NOT_AVAILABLE',
              'Event not available',
            );
          }

          throw new DomainException(
            HttpStatus.CONFLICT,
            'NOT_ENOUGH_SEATS',
            `Not enough seats. Available seats are: ${fresh.availableSeats}`,
          );
        }

        const booking = await tx.booking.create({
          data: {
            userId,
            eventId: createBookingDto.eventId,
            quantity: createBookingDto.quantity,
            unitPriceCents: event.priceCents,
            totalCents: event.priceCents * createBookingDto.quantity,
            currency: event.currency,
            expiresAt: new Date(Date.now() + this.bookingTtlMinutes * 60_000),
            idempotencyKey,
            requestHash,
          },
          include: BOOKING_INCLUDE,
        });
        return { booking: toBookingResponse(booking), created: true };
      });

      if (result.created) {
        this.logger.log(
          `Booking ${result.booking.id} created: ${createBookingDto.quantity} seat(s) for event ${createBookingDto.eventId}`,
        );
      }
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findByIdempotencyKey(userId, idempotencyKey);
        if (winner)
          return { booking: this.replay(winner, requestHash), created: false };
      }
      throw error;
    }
  }

  private async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return db.booking.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: BOOKING_INCLUDE,
    });
  }

  private async findOwnBooking(
    userId: string,
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const booking = await db.booking.findFirst({
      where: { id, userId },
      include: BOOKING_INCLUDE,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private async lockEvent(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM events WHERE id = ${id} FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Event not found');
  }

  private replay(booking: BookingWithEvent, requestHash: string) {
    if (booking.requestHash !== requestHash) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key was taken with another body',
      );
    }

    return toBookingResponse(booking);
  }
}
