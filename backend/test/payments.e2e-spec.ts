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
import type Stripe from 'stripe';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { BookingsModule } from '../src/bookings/bookings.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { StripeGateway } from '../src/payments/stripe.gateway';
import { PaymentsService } from '../src/payments/payments.service';
import { RefundsService } from '../src/payments/refunds.service';
import { HttpExceptionFilter } from '../src/filter/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

interface FakeSession {
  id: string;
  url: string | null;
  status: string;
}

class FakeStripe {
  private counter = 0;
  sessions = new Map<string, FakeSession>();
  refunds: string[] = [];

  requireClient(): FakeStripe {
    return this;
  }

  createCheckout(): FakeSession {
    const id = `cs_${++this.counter}`;
    const session: FakeSession = {
      id,
      url: `https://checkout.stripe.test/pay/${id}`,
      status: 'open',
    };
    this.sessions.set(id, session);
    return session;
  }

  retrieveCheckout(id: string): FakeSession {
    return this.sessions.get(id) ?? { id, url: null, status: 'expired' };
  }

  expireCheckout(id: string): void {
    this.sessions.set(id, { id, url: null, status: 'expired' });
  }

  refund(paymentIntent: string): { status: string } {
    this.refunds.push(paymentIntent);
    return { status: 'succeeded' };
  }

  reset(): void {
    this.refunds.length = 0;
    this.sessions.clear();
    this.counter = 0;
  }
}

interface BookingBody {
  id: string;
}
interface CheckoutBody {
  checkoutUrl: string;
}

describeWithDatabase('Payments (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  let bookings: BookingsService;
  let payments: PaymentsService;
  let refunds: RefundsService;
  let stripe: FakeStripe;
  const owner = { id: randomUUID(), role: 'ORGANIZER' as const };
  const buyer = { id: randomUUID(), role: 'USER' as const };
  const users = [owner, buyer];
  const jwt = new JwtService({ secret: 'payments-test-secret' });
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'payments-test-secret',
    BOOKING_TTL_MINUTES: 7,
    REFUND_WINDOW_HOURS: 24,
    FRONTEND_URL: 'http://localhost:5173',
  });
  const auth = (user = buyer as { id: string; role: string }) =>
    `Bearer ${jwt.sign({ sub: user.id, role: user.role })}`;
  const createEvent = (priceCents = 1000) =>
    db.event.create({
      data: {
        organizerId: owner.id,
        title: 'Paid test',
        venue: 'Hall',
        city: 'City',
        startsAt: new Date(Date.now() + 48 * 3600000),
        priceCents,
        capacity: 10,
        availableSeats: 10,
        status: 'PUBLISHED',
      },
    });
  const book = (eventId: string, quantity = 1) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ eventId, quantity });
  const pay = (id: string) =>
    request(app.getHttpServer())
      .post(`/api/bookings/${id}/pay`)
      .set('Authorization', auth());
  const cancel = (id: string) =>
    request(app.getHttpServer())
      .post(`/api/bookings/${id}/cancel`)
      .set('Authorization', auth());
  const completed = (
    sessionId: string,
    bookingId: string,
    amount = 1000,
  ): Stripe.Event =>
    ({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_status: 'paid',
          amount_total: amount,
          currency: 'usd',
          payment_intent: `pi_${randomUUID()}`,
          metadata: { bookingId },
          client_reference_id: bookingId,
        },
      },
    }) as unknown as Stripe.Event;
  const bookId = async (eventId: string) => {
    const res = await book(eventId).expect(201);
    return (res.body as BookingBody).id;
  };
  const bookAndPay = async () => {
    const event = await createEvent();
    const id = await bookId(event.id);
    await pay(id).expect(200);
    const payment = await db.payment.findFirstOrThrow({
      where: { bookingId: id },
    });
    return { event, id, payment };
  };

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
    stripe = new FakeStripe();
    const module = await Test.createTestingModule({
      imports: [BookingsModule],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
      .overrideProvider(StripeGateway)
      .useValue(stripe)
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
    await app.init();
    bookings = app.get(BookingsService);
    payments = app.get(PaymentsService);
    refunds = app.get(RefundsService);
  });

  afterEach(async () => {
    stripe.reset();
    await db.payment.deleteMany({
      where: { booking: { event: { organizerId: owner.id } } },
    });
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

  it('pays a free booking immediately with a ticket code and a relative URL', async () => {
    const event = await createEvent(0);
    const id = await bookId(event.id);
    const result = await pay(id).expect(200);
    expect((result.body as CheckoutBody).checkoutUrl).toBe(
      `/bookings/${id}?payment=success`,
    );
    const stored = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      status: 'PAID',
      paidAt: expect.any(Date) as unknown,
    });
    expect(stored.ticketCode).toMatch(/^SL-/);
  });

  it('creates and reuses a single checkout session for a paid booking', async () => {
    const { id } = await bookAndPay();
    const first = await pay(id).expect(200);
    expect((first.body as CheckoutBody).checkoutUrl).toMatch(
      /^https:\/\/checkout\.stripe\.test/,
    );
    await pay(id).expect(200, first.body);
    expect(await db.payment.count({ where: { bookingId: id } })).toBe(1);
    expect(stripe.sessions.size).toBe(1);
  });

  it('confirms a paid booking via the completed webhook', async () => {
    const { id, payment } = await bookAndPay();
    await payments.handleEvent(completed(payment.stripeCheckoutSessionId!, id));
    await payments.handleEvent(completed(payment.stripeCheckoutSessionId!, id)); // idempotent
    const stored = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      status: 'PAID',
      ticketCode: expect.stringMatching(/^SL-/) as unknown,
    });
    const updated = await db.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(updated).toMatchObject({
      status: 'SUCCEEDED',
      refundRequested: false,
    });
    expect(updated.stripePaymentIntentId).toBeTruthy();
  });

  it('rejects a mismatched completed webhook', async () => {
    const { id, payment } = await bookAndPay();
    await expect(
      payments.handleEvent(
        completed(payment.stripeCheckoutSessionId!, id, 99999),
      ),
    ).rejects.toThrow('does not match');
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
  });

  it('refunds a late payment and releases seats without double-crediting', async () => {
    const event = await createEvent();
    const id = await bookId(event.id);
    await pay(id).expect(200);
    const payment = await db.payment.findFirstOrThrow({
      where: { bookingId: id },
    });
    await db.booking.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await payments.handleEvent(completed(payment.stripeCheckoutSessionId!, id));
    const stored = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe('EXPIRED');
    const updated = await db.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stripe.refunds).toContain(updated.stripePaymentIntentId!);
    expect(updated.status).toBe('REFUNDED');
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(10);
  });

  it('expires stale bookings once and releases seats', async () => {
    const event = await createEvent();
    const id = await bookId(event.id);
    await db.booking.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await bookings.expire(id)).toBe(true);
    expect(await bookings.expire(id)).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      'EXPIRED',
    );
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(10);
  });

  it('refunds a paid booking on cancel and releases seats once', async () => {
    const event = await createEvent();
    const id = await bookId(event.id);
    await pay(id).expect(200);
    const payment = await db.payment.findFirstOrThrow({
      where: { bookingId: id },
    });
    await payments.handleEvent(completed(payment.stripeCheckoutSessionId!, id));
    await cancel(id).expect(200);
    const stored = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      status: 'REFUNDED',
      cancelledAt: expect.any(Date) as unknown,
    });
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .availableSeats,
    ).toBe(10);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('REFUNDED');
    expect(stripe.refunds.length).toBe(1);
  });

  it('refunds paid bookings of a cancelled event via maintenance', async () => {
    const event = await createEvent();
    const id = await bookId(event.id);
    await pay(id).expect(200);
    const payment = await db.payment.findFirstOrThrow({
      where: { bookingId: id },
    });
    await payments.handleEvent(completed(payment.stripeCheckoutSessionId!, id));
    await db.event.update({
      where: { id: event.id },
      data: { status: 'CANCELLED' },
    });
    await refunds.refundCancelledEvents();
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      'REFUNDED',
    );
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('REFUNDED');
  });
});
