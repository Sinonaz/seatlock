import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import type { AuthUser } from '../src/auth/decorators/current-user.decorator';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { EventsController } from '../src/events/events.controller';
import { OrganizerEventsController } from '../src/events/organizer-events.controller';
import { EventsService } from '../src/events/events.service';
import { HttpExceptionFilter } from '../src/filter/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

// Use a separately migrated database; only records created by this suite are removed.
const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase('Events API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  const jwt = new JwtService({ secret: 'events-test-secret' });
  const owner = { id: randomUUID(), role: Role.ORGANIZER };
  const other = { id: randomUUID(), role: Role.ORGANIZER };
  const admin = { id: randomUUID(), role: Role.ADMIN };
  const buyer = { id: randomUUID(), role: Role.USER };
  const users = [owner, other, admin, buyer];
  const auth = (user: AuthUser = owner) =>
    `Bearer ${jwt.sign({ sub: user.id, role: user.role })}`;
  const payload = () => ({
    title: 'Test conference',
    venue: 'Hall',
    city: 'City',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    priceCents: 1000,
    capacity: 20,
  });
  const create = (data = {}) =>
    db.event.create({
      data: {
        ...payload(),
        organizerId: owner.id,
        availableSeats: 20,
        ...data,
      },
    });

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL,
      }),
    });
    await db.user.createMany({
      data: users.map((user) => ({
        ...user,
        name: 'Test user',
        email: `${user.id}@test.invalid`,
        passwordHash: 'unused',
      })),
    });
    const module = await Test.createTestingModule({
      controllers: [EventsController, OrganizerEventsController],
      providers: [
        EventsService,
        { provide: PrismaService, useValue: db },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_ACCESS_SECRET: 'events-test-secret',
          }),
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
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
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.booking.deleteMany({
      where: { event: { organizerId: { in: users.map((user) => user.id) } } },
    });
    await db.event.deleteMany({
      where: { organizerId: { in: users.map((user) => user.id) } },
    });
  });

  afterAll(async () => {
    await db?.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    await app?.close();
    await db?.$disconnect();
  });

  it('creates a draft, publishes it and exposes it in the public catalog', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', auth())
      .send(payload())
      .expect(201);
    const event = response.body as { id: string };
    expect(response.body).toMatchObject({
      status: 'DRAFT',
      availableSeats: 20,
      description: '',
      currency: 'usd',
      organizer: { id: owner.id },
    });
    expect(response.body).not.toHaveProperty('organizerId');
    await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/events/${event.id}/publish`)
      .set('Authorization', auth())
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .expect(200);
    const catalog = await request(app.getHttpServer())
      .get('/api/events?search=Test%20conference')
      .expect(200);
    expect(catalog.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: event.id }),
      ]) as unknown,
    });
    await request(app.getHttpServer())
      .get(`/api/events/${randomUUID()}`)
      .expect(404);
  });

  it('enforces authentication, roles, ownership and UUID parameters', async () => {
    const event = await create();
    for (const path of [
      '/api/organizer/events',
      `/api/organizer/events/${event.id}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', auth(buyer))
        .expect(403);
    }
    for (const action of ['publish', 'cancel']) {
      await request(app.getHttpServer())
        .post(`/api/events/${event.id}/${action}`)
        .set('Authorization', auth(buyer))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/events/${event.id}/${action}`)
        .set('Authorization', auth(other))
        .expect(404);
    }
    await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', auth(buyer))
      .send(payload())
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth(buyer))
      .send({ title: 'Changed' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth(other))
      .send({ title: 'Changed' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/organizer/events/${event.id}`)
      .set('Authorization', auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth(admin))
      .send({ title: 'Changed' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/organizer/events/not-a-uuid')
      .set('Authorization', auth())
      .expect(400);
  });

  it.each([
    { title: 'ab' },
    { title: null },
    { description: null },
    { description: 'a'.repeat(5001) },
    { venue: '' },
    { city: '' },
    { startsAt: 'invalid' },
    { startsAt: '2000-01-01T00:00:00Z' },
    { priceCents: -1 },
    { priceCents: 1.5 },
    { priceCents: 1000001 },
    { priceCents: '10' },
    { capacity: 0 },
    { capacity: 100001 },
    { coverImageUrl: 'invalid' },
    { status: 'PUBLISHED' },
  ])('rejects invalid create and patch input: %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', auth())
      .send({ ...payload(), ...invalid })
      .expect(400);
    const event = await create();
    await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth())
      .send(invalid)
      .expect(400);
  });

  it('updates draft capacity and accepts nullable cover and free admission', async () => {
    const event = await create();
    const result = await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth())
      .send({ capacity: 30, priceCents: 0, coverImageUrl: null })
      .expect(200);
    expect(result.body).toMatchObject({
      capacity: 30,
      availableSeats: 30,
      priceCents: 0,
      coverImageUrl: null,
    });
  });

  it('locks changed commercial fields after publishing but accepts unchanged values', async () => {
    const event = await create({ status: 'PUBLISHED', availableSeats: 15 });
    for (const change of [
      { capacity: 21 },
      { priceCents: 2000 },
      { startsAt: new Date(Date.now() + 172800000).toISOString() },
    ]) {
      const result = await request(app.getHttpServer())
        .patch(`/api/events/${event.id}`)
        .set('Authorization', auth())
        .send(change)
        .expect(409);
      expect(result.body).toMatchObject({ code: 'EVENT_LOCKED' });
    }
    const result = await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth())
      .send({
        title: 'Updated conference',
        capacity: 20,
        priceCents: 1000,
        startsAt: event.startsAt.toISOString(),
      })
      .expect(200);
    expect(result.body).toMatchObject({
      availableSeats: 15,
      title: 'Updated conference',
    });
  });

  it('rejects publication of past drafts and repeated status transitions', async () => {
    const past = await create({ startsAt: new Date(0) });
    await request(app.getHttpServer())
      .post(`/api/events/${past.id}/publish`)
      .set('Authorization', auth())
      .expect(400);
    const event = await create({ status: 'PUBLISHED' });
    const repeated = await request(app.getHttpServer())
      .post(`/api/events/${event.id}/publish`)
      .set('Authorization', auth())
      .expect(409);
    expect(repeated.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    await request(app.getHttpServer())
      .post(`/api/events/${event.id}/cancel`)
      .set('Authorization', auth())
      .expect(200);
    for (const action of ['publish', 'cancel']) {
      const result = await request(app.getHttpServer())
        .post(`/api/events/${event.id}/${action}`)
        .set('Authorization', auth())
        .expect(409);
      expect(result.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    }
    const locked = await request(app.getHttpServer())
      .patch(`/api/events/${event.id}`)
      .set('Authorization', auth())
      .send({})
      .expect(409);
    expect(locked.body).toMatchObject({ code: 'EVENT_LOCKED' });
  });

  it('aggregates stats and cancels only pending bookings', async () => {
    const event = await create({ status: 'PUBLISHED' });
    const empty = await create();
    await db.booking.createMany({
      data: (['PAID', 'PENDING', 'REFUNDED'] as const).map((status) => ({
        eventId: event.id,
        userId: buyer.id,
        status,
        quantity: 2,
        unitPriceCents: 1000,
        totalCents: 2000,
        currency: 'usd',
        expiresAt: new Date(Date.now() + 600000),
        idempotencyKey: randomUUID(),
        requestHash: 'test',
      })),
    });
    const stats = { paidSeats: 2, pendingSeats: 2, revenueCents: 2000 };
    const groupBy = jest.spyOn(db.booking, 'groupBy');
    const list = await request(app.getHttpServer())
      .get('/api/organizer/events')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: empty.id,
        stats: { paidSeats: 0, pendingSeats: 0, revenueCents: 0 },
      }),
      expect.objectContaining({ id: event.id, stats }),
    ]);
    expect(groupBy).toHaveBeenCalledTimes(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/organizer/events/${event.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(detail.body).toMatchObject({ stats });
    const otherList = await request(app.getHttpServer())
      .get('/api/organizer/events')
      .set('Authorization', auth(other))
      .expect(200);
    expect(otherList.body).toEqual([]);
    const adminList = await request(app.getHttpServer())
      .get('/api/organizer/events')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(adminList.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: event.id })]),
    );
    await request(app.getHttpServer())
      .post(`/api/events/${event.id}/cancel`)
      .set('Authorization', auth())
      .expect(200);
    const bookings = await db.booking.findMany({
      where: { eventId: event.id },
    });
    expect(bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'PAID', cancelledAt: null }),
        expect.objectContaining({ status: 'REFUNDED', cancelledAt: null }),
        expect.objectContaining({
          status: 'CANCELLED',
          cancelledAt: expect.any(Date) as unknown,
        }),
      ]),
    );
  });

  it('serializes simultaneous publications and publish/edit races', async () => {
    const event = await create();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/events/${event.id}/publish`)
          .set('Authorization', auth()),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const draft = await create();
    const [published, edited] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/events/${draft.id}/publish`)
        .set('Authorization', auth()),
      request(app.getHttpServer())
        .patch(`/api/events/${draft.id}`)
        .set('Authorization', auth())
        .send({ capacity: 30 }),
    ]);
    expect(published.status).toBe(200);
    expect([200, 409]).toContain(edited.status);
    const fresh = await db.event.findUniqueOrThrow({ where: { id: draft.id } });
    expect(fresh).toMatchObject({
      status: 'PUBLISHED',
      capacity: edited.status === 200 ? 30 : 20,
      availableSeats: edited.status === 200 ? 30 : 20,
    });
  });

  it('rolls back event cancellation if cancelling bookings fails', async () => {
    const event = await create({ status: 'PUBLISHED' });
    const failingDb = db.$extends({
      query: {
        booking: {
          updateMany() {
            throw new Error('Simulated booking update failure');
          },
        },
      },
    });
    const service = new EventsService(failingDb as unknown as PrismaService);
    await expect(service.cancelEvent(owner, event.id)).rejects.toThrow(
      'Simulated booking update failure',
    );
    const fresh = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(fresh.status).toBe('PUBLISHED');
  });

  it('allows only one of two simultaneous draft cancellations', async () => {
    const event = await create();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/events/${event.id}/cancel`)
          .set('Authorization', auth()),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const fresh = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(fresh.status).toBe('CANCELLED');
  });
});
