import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { BookingsModule } from '../src/bookings/bookings.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { EventsService } from '../src/events/events.service';
import { HttpExceptionFilter } from '../src/filter/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase('Bookings API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  let service: BookingsService;
  const owner = { id: randomUUID(), role: 'ORGANIZER' as const };
  const buyer = { id: randomUUID(), role: 'USER' as const };
  const other = { id: randomUUID(), role: 'ADMIN' as const };
  const users = [owner, buyer, other];
  const jwt = new JwtService({ secret: 'bookings-test-secret' });
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'bookings-test-secret',
    BOOKING_TTL_MINUTES: 7,
  });
  const auth = (user = buyer as { id: string; role: string }) =>
    `Bearer ${jwt.sign({ sub: user.id, role: user.role })}`;
  const createEvent = (capacity = 5) =>
    db.event.create({
      data: {
        organizerId: owner.id,
        title: 'Booking test',
        venue: 'Hall',
        city: 'City',
        startsAt: new Date(Date.now() + 86400000),
        priceCents: 1500,
        capacity,
        availableSeats: capacity,
        status: 'PUBLISHED',
      },
    });
  const book = (eventId: string, key = randomUUID(), quantity = 1) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .send({ eventId, quantity });
  const cancel = (id: string) =>
    request(app.getHttpServer())
      .post(`/api/bookings/${id}/cancel`)
      .set('Authorization', auth());

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL,
      }),
    });
    await db.user.createMany({
      data: users.map((user) => ({
        ...user,
        name: 'Test',
        email: `${user.id}@test.invalid`,
        passwordHash: 'unused',
      })),
    });
    const module = await Test.createTestingModule({
      imports: [BookingsModule],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
      .useMocker((token) => {
        if (token === PrismaService) return db;
        if (token === ConfigService) return config;
        if (token === JwtService) return jwt;
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useLogger(false);
    // Keep one listener for all concurrent Supertest requests.
    await app.listen(0, '127.0.0.1');
    service = app.get(BookingsService);
  });

  afterEach(async () => {
    await db.booking.deleteMany({
      where: { event: { organizerId: owner.id } },
    });
    await db.event.deleteMany({ where: { organizerId: owner.id } });
  });
  afterAll(async () => {
    await db?.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    await app?.close();
    await db?.$disconnect();
  });

  it('creates a priced reservation with configured TTL and a public response', async () => {
    const event = await createEvent();
    const before = Date.now();
    const result = await book(event.id, randomUUID(), 2).expect(201);
    const body = result.body as { id: string; expiresAt: string };
    expect(result.body).toMatchObject({
      status: 'PENDING',
      quantity: 2,
      unitPriceCents: 1500,
      totalCents: 3000,
      currency: 'usd',
      event: { id: event.id },
    });
    for (const field of [
      'userId',
      'eventId',
      'idempotencyKey',
      'requestHash',
      'updatedAt',
    ])
      expect(result.body).not.toHaveProperty(field);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThanOrEqual(
      before + 7 * 60000,
    );
    expect(new Date(body.expiresAt).getTime()).toBeLessThanOrEqual(
      Date.now() + 7 * 60000,
    );
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(3);
    await request(app.getHttpServer())
      .get(`/api/bookings/${body.id}`)
      .set('Authorization', auth())
      .expect(200, result.body);
    const list = await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body).toEqual([result.body]);
  });

  it('replays current state, rejects a changed body, and scopes keys to a user', async () => {
    const event = await createEvent();
    const key = randomUUID();
    const first = await book(event.id, key).expect(201);
    await book(event.id, key).expect(200, first.body);
    const changed = await book(event.id, key, 2).expect(422);
    expect(changed.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const cancelled = await cancel((first.body as { id: string }).id).expect(
      200,
    );
    await book(event.id, key).expect(200, cancelled.body);
    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', auth(owner))
      .set('Idempotency-Key', key)
      .send({ eventId: event.id, quantity: 1 })
      .expect(201);
  });

  it('enforces authentication, ownership including ADMIN, and UUID validation', async () => {
    const event = await createEvent();
    const result = await book(event.id).expect(201);
    const { id } = result.body as { id: string };
    await request(app.getHttpServer())
      .post('/api/bookings')
      .send({ eventId: event.id, quantity: 1 })
      .expect(401);
    await request(app.getHttpServer()).get('/api/bookings/my').expect(401);
    await request(app.getHttpServer()).get(`/api/bookings/${id}`).expect(401);
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/cancel`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/bookings/${id}`)
      .set('Authorization', auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/cancel`)
      .set('Authorization', auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/bookings/${randomUUID()}`)
      .set('Authorization', auth())
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/bookings/invalid')
      .set('Authorization', auth())
      .expect(400);
    await cancel('invalid').expect(400);
    await cancel(randomUUID()).expect(404);
    await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', auth(other))
      .expect(200, []);
  });

  it('validates the idempotency header and DTO', async () => {
    const event = await createEvent();
    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', auth())
      .send({ eventId: event.id, quantity: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'invalid')
      .send({ eventId: event.id, quantity: 1 })
      .expect(400);
    for (const body of [
      { eventId: 'invalid', quantity: 1 },
      ...[0, 11, 1.5, '2', null].map((quantity) => ({
        eventId: event.id,
        quantity,
      })),
    ]) {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', auth())
        .set('Idempotency-Key', randomUUID())
        .send(body)
        .expect(400);
    }
  });

  it('reports missing, unavailable and sold-out events', async () => {
    await book(randomUUID()).expect(404);
    const event = await createEvent(1);
    const soldOut = await book(event.id, randomUUID(), 2).expect(409);
    expect(soldOut.body).toMatchObject({
      code: 'NOT_ENOUGH_SEATS',
      message: expect.stringContaining('1') as unknown,
    });
    for (const status of ['DRAFT', 'CANCELLED'] as const) {
      await db.event.update({ where: { id: event.id }, data: { status } });
      const result = await book(event.id).expect(409);
      expect(result.body).toMatchObject({ code: 'EVENT_NOT_AVAILABLE' });
    }
    await db.event.update({
      where: { id: event.id },
      data: { status: 'PUBLISHED', startsAt: new Date(0) },
    });
    expect((await book(event.id).expect(409)).body).toMatchObject({
      code: 'EVENT_NOT_AVAILABLE',
    });
  });

  it('sells exactly five seats under twenty concurrent requests', async () => {
    const event = await createEvent(5);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => book(event.id)),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(5);
    expect(results.filter((result) => result.status === 409)).toHaveLength(15);
    expect(await db.booking.count({ where: { eventId: event.id } })).toBe(5);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(0);
  });

  it.each([1, 5])(
    'replays ten simultaneous requests with one key and %i seats',
    async (capacity) => {
      const event = await createEvent(capacity);
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => book(event.id, key)),
      );
      expect(results.filter((result) => result.status === 201)).toHaveLength(1);
      expect(results.filter((result) => result.status === 200)).toHaveLength(9);
      expect(
        new Set(results.map((result) => (result.body as { id: string }).id))
          .size,
      ).toBe(1);
      expect(await db.booking.count({ where: { eventId: event.id } })).toBe(1);
      expect(
        (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
          .availableSeats,
      ).toBe(capacity - 1);
    },
  );

  it('handles the same key concurrently used for different events', async () => {
    const first = await createEvent(1);
    const second = await createEvent(1);
    const key = randomUUID();
    const results = await Promise.all([
      book(first.id, key),
      book(second.id, key),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
    const events = await db.event.findMany({
      where: { organizerId: owner.id },
    });
    expect(events.reduce((sum, event) => sum + event.availableSeats, 0)).toBe(
      1,
    );
    expect(await db.booking.count({ where: { userId: buyer.id } })).toBe(1);
  });

  it('returns seats exactly once on concurrent cancellation and sorts my bookings', async () => {
    const event = await createEvent();
    const first = await book(event.id).expect(201);
    const second = await book(event.id).expect(201);
    const id = (first.body as { id: string }).id;
    const results = await Promise.all([cancel(id), cancel(id)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const stored = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe('CANCELLED');
    expect(stored.cancelledAt).toBeInstanceOf(Date);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(4);
    const list = await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', auth())
      .expect(200);
    expect((list.body as { id: string }[]).map((item) => item.id)).toEqual([
      (second.body as { id: string }).id,
      id,
    ]);
    for (const status of ['EXPIRED', 'REFUNDED'] as const) {
      await db.booking.update({ where: { id }, data: { status } });
      expect((await cancel(id).expect(409)).body).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
      });
    }
    await db.booking.update({ where: { id }, data: { status: 'PAID' } });
    expect((await cancel(id).expect(409)).body).toMatchObject({
      code: 'REFUND_WINDOW_CLOSED',
    });
  });

  it('rolls back seat deduction on insert failure and cancellation on seat update failure', async () => {
    const event = await createEvent();
    const insertFailure = db.$extends({
      query: {
        booking: {
          create() {
            throw new Error('insert failed');
          },
        },
      },
    });
    await expect(
      new BookingsService(
        insertFailure as unknown as PrismaService,
        config,
      ).createBooking(
        buyer.id,
        { eventId: event.id, quantity: 2 },
        randomUUID(),
      ),
    ).rejects.toThrow('insert failed');
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(5);
    const result = await service.createBooking(
      buyer.id,
      { eventId: event.id, quantity: 2 },
      randomUUID(),
    );
    const updateFailure = db.$extends({
      query: {
        event: {
          update() {
            throw new Error('update failed');
          },
        },
      },
    });
    await expect(
      new BookingsService(
        updateFailure as unknown as PrismaService,
        config,
      ).cancelBooking(buyer, result.booking.id),
    ).rejects.toThrow('update failed');
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: result.booking.id } }))
        .status,
    ).toBe('PENDING');
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(3);
  });

  it('serializes booking operations with event cancellation', async () => {
    const events = new EventsService(db as unknown as PrismaService);
    const event = await createEvent();
    const [created] = await Promise.all([
      book(event.id),
      events.cancelEvent(owner, event.id),
    ]);
    expect([201, 409]).toContain(created.status);
    expect(
      await db.booking.count({
        where: { eventId: event.id, status: 'PENDING' },
      }),
    ).toBe(0);
    const next = await createEvent();
    const reservation = await service.createBooking(
      buyer.id,
      { eventId: next.id, quantity: 2 },
      randomUUID(),
    );
    const [cancelled] = await Promise.all([
      cancel(reservation.booking.id),
      events.cancelEvent(owner, next.id),
    ]);
    expect([200, 409]).toContain(cancelled.status);
    const fresh = await db.event.findUniqueOrThrow({ where: { id: next.id } });
    expect(fresh.status).toBe('CANCELLED');
    expect(fresh.availableSeats).toBe(cancelled.status === 200 ? 5 : 3);
    expect(
      (
        await db.booking.findUniqueOrThrow({
          where: { id: reservation.booking.id },
        })
      ).status,
    ).toBe('CANCELLED');
  });
});
