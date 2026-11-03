import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

describe('EventsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn();
  const service = new EventsService({
    event: { findMany, count },
    $transaction: transaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockResolvedValue([[], 0]);
  });

  it('uses the same upcoming published filter for both queries and returns defaults', async () => {
    const before = Date.now();
    const result = await service.getEvents();
    const options = findMany.mock.calls[0][0];

    expect(options.where.status).toBe('PUBLISHED');
    expect(options.where.startsAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(options.where.startsAt.gt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(options.where.OR).toBeUndefined();
    expect(count.mock.calls[0][0].where).toBe(options.where);
    expect(options).toMatchObject({
      skip: 0,
      take: 12,
      orderBy: { startsAt: 'asc' },
      include: { organizer: { select: { id: true, name: true } } },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });
  });

  it('parses query strings, caps the limit, searches all fields and calculates pages', async () => {
    transaction.mockResolvedValue([[{ id: 'event-1' }], 101]);
    const result = await service.getEvents({
      page: '2',
      limit: '100',
      search: 'джаз',
    });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 50,
      take: 50,
      where: {
        OR: ['title', 'venue', 'city'].map((field) => ({
          [field]: { contains: 'джаз', mode: 'insensitive' },
        })),
      },
    });
    expect(result).toEqual({
      items: [{ id: 'event-1' }],
      meta: { page: 2, limit: 50, total: 101, totalPages: 3 },
    });
  });

  it.each(['0', '-1', '1.5', 'abc', '', 'Infinity'])(
    'rejects invalid pagination value %j before querying the database',
    async (value) => {
      await expect(service.getEvents({ page: value })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getEvents({ limit: value })).rejects.toThrow(
        BadRequestException,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
