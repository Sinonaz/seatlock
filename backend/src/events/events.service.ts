import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { DomainException } from '../common/domain.exception';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

const eventInclude = {
  organizer: { select: { id: true, name: true } },
} as const;
type EventWithOrganizer = Prisma.EventGetPayload<{
  include: typeof eventInclude;
}>;

export interface EventsQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(query: EventsQuery = {}) {
    const page = this.parsePositiveInteger(query.page, 1, 'page');
    const limit = Math.min(
      this.parsePositiveInteger(query.limit, 12, 'limit'),
      50,
    );
    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      throw new BadRequestException('page is too large');
    }
    if (query.search !== undefined && typeof query.search !== 'string') {
      throw new BadRequestException('search must be a string');
    }

    const where: Prisma.EventWhereInput = {
      status: 'PUBLISHED',
      startsAt: { gt: new Date() },
      ...(query.search
        ? {
            OR: ['title', 'venue', 'city'].map((field) => ({
              [field]: { contains: query.search, mode: 'insensitive' },
            })),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startsAt: 'asc' },
        include: { organizer: { select: { id: true, name: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: items.map((event) => this.toEventResponse(event)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getEvent(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: { in: ['PUBLISHED', 'CANCELLED'] },
      },
      include: { organizer: { select: { id: true, name: true } } },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.toEventResponse(event);
  }

  async createEvent(user: AuthUser, dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    this.assertFutureDate(startsAt);
    const event = await this.prisma.event.create({
      data: {
        ...dto,
        startsAt,
        organizerId: user.id,
        status: 'DRAFT',
        availableSeats: dto.capacity,
      },
      include: eventInclude,
    });
    return this.toEventResponse(event);
  }

  async getOrganizerEvents(user: AuthUser) {
    const events = await this.prisma.event.findMany({
      where: user.role === 'ADMIN' ? {} : { organizerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: eventInclude,
    });
    return this.withStats(events);
  }

  async getOrganizerEvent(user: AuthUser, id: string) {
    const event = await this.findOwnEvent(user, id);
    const [result] = await this.withStats([event]);
    return result;
  }

  async updateEvent(user: AuthUser, id: string, dto: UpdateEventDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwnEvent(tx, user, id);
      const event = await this.findOwnEvent(user, id, tx);
      const startsAt =
        dto.startsAt === undefined ? undefined : new Date(dto.startsAt);
      if (
        event.status === 'CANCELLED' ||
        (event.status === 'PUBLISHED' &&
          ((startsAt !== undefined &&
            startsAt.getTime() !== event.startsAt.getTime()) ||
            (dto.priceCents !== undefined &&
              dto.priceCents !== event.priceCents) ||
            (dto.capacity !== undefined && dto.capacity !== event.capacity)))
      ) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'EVENT_LOCKED',
          'Event cannot be modified',
        );
      }
      if (event.status === 'DRAFT' && startsAt !== undefined) {
        this.assertFutureDate(startsAt);
      }
      const updated = await tx.event.update({
        where: { id },
        data: {
          ...dto,
          startsAt,
          ...(event.status === 'DRAFT' && dto.capacity !== undefined
            ? { availableSeats: dto.capacity }
            : {}),
        },
        include: eventInclude,
      });
      return this.toEventResponse(updated);
    });
  }

  async publishEvent(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwnEvent(tx, user, id);
      const event = await this.findOwnEvent(user, id, tx);
      if (event.status !== 'DRAFT') this.invalidTransition();
      this.assertFutureDate(event.startsAt);
      const { count } = await tx.event.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
      if (count === 0) this.invalidTransition();
      return this.toEventResponse(await this.findOwnEvent(user, id, tx));
    });
  }

  async cancelEvent(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwnEvent(tx, user, id);
      await this.findOwnEvent(user, id, tx);
      const { count } = await tx.event.updateMany({
        where: { id, status: { in: ['DRAFT', 'PUBLISHED'] } },
        data: { status: 'CANCELLED' },
      });
      if (count === 0) this.invalidTransition();
      await tx.booking.updateMany({
        where: { eventId: id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return this.toEventResponse(await this.findOwnEvent(user, id, tx));
    });
  }

  private async findOwnEvent(
    user: AuthUser,
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const event = await db.event.findFirst({
      where: user.role === 'ADMIN' ? { id } : { id, organizerId: user.id },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async lockOwnEvent(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    id: string,
  ) {
    // Serialize mutations before reading the fields used by business rules.
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM events WHERE id = ${id}
      ${user.role === 'ADMIN' ? Prisma.empty : Prisma.sql`AND "organizerId" = ${user.id}`}
      FOR UPDATE
    `);
    if (rows.length === 0) throw new NotFoundException('Event not found');
  }

  private async withStats(events: EventWithOrganizer[]) {
    if (events.length === 0) return [];
    const rows = await this.prisma.booking.groupBy({
      by: ['eventId', 'status'],
      where: {
        eventId: { in: events.map((event) => event.id) },
        status: { in: ['PAID', 'PENDING'] },
      },
      _sum: { quantity: true, totalCents: true },
    });
    const stats = new Map<
      string,
      { paidSeats: number; pendingSeats: number; revenueCents: number }
    >();
    for (const row of rows) {
      const item = stats.get(row.eventId) ?? {
        paidSeats: 0,
        pendingSeats: 0,
        revenueCents: 0,
      };
      if (row.status === 'PAID') {
        item.paidSeats = row._sum.quantity ?? 0;
        item.revenueCents = row._sum.totalCents ?? 0;
      } else if (row.status === 'PENDING') {
        item.pendingSeats = row._sum.quantity ?? 0;
      }
      stats.set(row.eventId, item);
    }
    return events.map((event) => ({
      ...this.toEventResponse(event),
      stats: stats.get(event.id) ?? {
        paidSeats: 0,
        pendingSeats: 0,
        revenueCents: 0,
      },
    }));
  }

  private assertFutureDate(date: Date) {
    if (!Number.isFinite(date.getTime()) || date <= new Date()) {
      throw new BadRequestException('Event start date must be in the future');
    }
  }

  private invalidTransition(): never {
    throw new DomainException(
      HttpStatus.CONFLICT,
      'INVALID_STATUS_TRANSITION',
      'Invalid event status transition',
    );
  }

  private toEventResponse<T extends { organizerId: string }>(
    event: T,
  ): Omit<T, 'organizerId'> {
    const { organizerId, ...response } = event;
    void organizerId;
    return response;
  }

  private parsePositiveInteger(
    value: string | number | undefined,
    fallback: number,
    name: string,
  ): number {
    if (value === undefined) return fallback;

    const parsed =
      typeof value === 'number' ||
      (typeof value === 'string' && /^\d+$/.test(value))
        ? Number(value)
        : NaN;

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${name} must be a positive integer`);
    }

    return parsed;
  }
}
