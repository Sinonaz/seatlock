import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
      throw new BadRequestException('Event not found');
    }

    return this.toEventResponse(event);
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
