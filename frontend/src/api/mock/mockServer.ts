import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type {
  ApiErrorCode,
  Booking,
  BookingStatus,
  EventItem,
  OrganizerEvent,
  Role,
  User,
} from '@/types';
import { t } from '@/i18n';
import {
  createSeedDb,
  type BookingRecord,
  type EventRecord,
  type MockDb,
  type UserRecord,
} from './mockData';

// In-browser fake of the NestJS backend. It follows the same contract
// (backend/TECHNICAL_SPECIFICATION.md) so the UI can be developed without a server.

const DB_KEY = 'seatlock_mock_db_v1';
const COOKIE_KEY = 'seatlock_mock_refresh_cookie';
const ACCESS_TTL_MS = 15 * 60 * 1000;
export const MOCK_BOOKING_TTL_MINUTES = 15;
const REFUND_WINDOW_HOURS = 24;

class HttpError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode;

  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const HTTP_ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

// ---------------- storage ----------------

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // fall through to seed
  }
  const db = createSeedDb();
  saveDb(db);
  return db;
}

function saveDb(db: MockDb) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function resetMockDb() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(COOKIE_KEY);
}

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------------- serializers (record -> API response) ----------------

function toUser(record: UserRecord): User {
  const { password: _password, ...user } = record;
  return user;
}

function toEvent(db: MockDb, record: EventRecord): EventItem {
  const { organizerId, ...event } = record;
  const organizer = db.users.find((u) => u.id === organizerId);
  return { ...event, organizer: { id: organizerId, name: organizer?.name ?? '—' } };
}

function toOrganizerEvent(db: MockDb, record: EventRecord): OrganizerEvent {
  const bookings = db.bookings.filter((b) => b.eventId === record.id);
  const sum = (status: BookingStatus, pick: (b: BookingRecord) => number) =>
    bookings.filter((b) => b.status === status).reduce((acc, b) => acc + pick(b), 0);
  return {
    ...toEvent(db, record),
    stats: {
      paidSeats: sum('PAID', (b) => b.quantity),
      pendingSeats: sum('PENDING', (b) => b.quantity),
      revenueCents: sum('PAID', (b) => b.totalCents),
    },
  };
}

function toBooking(db: MockDb, record: BookingRecord): Booking {
  const { userId: _u, eventId, idempotencyKey: _k, requestHash: _h, ...booking } = record;
  const event = db.events.find((e) => e.id === eventId)!;
  return {
    ...booking,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      venue: event.venue,
      city: event.city,
      coverImageUrl: event.coverImageUrl,
    },
  };
}

// ---------------- domain helpers ----------------

// Same job the backend cron does: PENDING bookings past expiresAt release their seats
function expireStaleBookings(db: MockDb) {
  const now = Date.now();
  for (const booking of db.bookings) {
    if (booking.status === 'PENDING' && new Date(booking.expiresAt).getTime() < now) {
      booking.status = 'EXPIRED';
      releaseSeats(db, booking);
    }
  }
}

function releaseSeats(db: MockDb, booking: BookingRecord) {
  const event = db.events.find((e) => e.id === booking.eventId);
  if (event) event.availableSeats += booking.quantity;
}

function makeTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `SL-${part()}-${part()}`;
}

function issueSession(db: MockDb, user: UserRecord, familyId: string = uid()) {
  const token = uid();
  db.sessions.push({ token, userId: user.id, familyId, revokedAt: null });
  localStorage.setItem(COOKIE_KEY, token);
  return {
    accessToken: `mock.${user.id}.${Date.now() + ACCESS_TTL_MS}`,
    user: toUser(user),
  };
}

// ---------------- request context ----------------

interface Ctx {
  db: MockDb;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: AxiosHeaders;
  userId: string | null;
}

function requireUser(ctx: Ctx, roles?: Role[]): UserRecord {
  const user = ctx.userId ? ctx.db.users.find((u) => u.id === ctx.userId) : undefined;
  if (!user) throw new HttpError(401, 'Unauthorized');
  if (roles && !roles.includes(user.role)) {
    throw new HttpError(403, t('api.forbidden'));
  }
  return user;
}

function findEvent(ctx: Ctx, id: string) {
  const event = ctx.db.events.find((e) => e.id === id);
  if (!event) throw new HttpError(404, t('api.eventNotFound'));
  return event;
}

// Organizer may touch only own events; admin may touch any
function findOwnEvent(ctx: Ctx, user: UserRecord, id: string) {
  const event = findEvent(ctx, id);
  if (user.role !== 'ADMIN' && event.organizerId !== user.id) {
    throw new HttpError(404, t('api.eventNotFound'));
  }
  return event;
}

function findOwnBooking(ctx: Ctx, user: UserRecord, id: string) {
  const booking = ctx.db.bookings.find((b) => b.id === id && b.userId === user.id);
  if (!booking) throw new HttpError(404, t('api.bookingNotFound'));
  return booking;
}

function paginate<T>(items: T[], query: Record<string, string>, defaultLimit: number) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || defaultLimit));
  const total = items.length;
  return {
    items: items.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function validateEventBody(body: Record<string, unknown>, partial: boolean) {
  const errors: string[] = [];
  const check = (field: string, ok: boolean, message: string) => {
    if (body[field] === undefined) {
      if (!partial) errors.push(`${field} should not be empty`);
      return;
    }
    if (!ok) errors.push(message);
  };
  check('title', typeof body.title === 'string' && body.title.trim().length >= 3, 'title must be longer than or equal to 3 characters');
  check('description', typeof body.description === 'string', 'description must be a string');
  check('venue', typeof body.venue === 'string' && body.venue.trim().length > 0, 'venue should not be empty');
  check('city', typeof body.city === 'string' && body.city.trim().length > 0, 'city should not be empty');
  check('startsAt', typeof body.startsAt === 'string' && new Date(body.startsAt).getTime() > Date.now(), 'startsAt must be a future date');
  check('priceCents', Number.isInteger(body.priceCents) && (body.priceCents as number) >= 0, 'priceCents must be a non-negative integer');
  check('capacity', Number.isInteger(body.capacity) && (body.capacity as number) >= 1 && (body.capacity as number) <= 100000, 'capacity must be an integer between 1 and 100000');
  if (errors.length) throw new HttpError(400, errors.join(', '));
}

const EVENT_FIELDS = ['title', 'description', 'venue', 'city', 'startsAt', 'priceCents', 'capacity', 'coverImageUrl'] as const;
const LOCKED_AFTER_PUBLISH = ['startsAt', 'priceCents', 'capacity'] as const;

// ---------------- routes ----------------

type Handler = (ctx: Ctx) => unknown | { __status: number; data: unknown };

const created = (data: unknown) => ({ __status: 201, data });
const noContent = () => ({ __status: 204, data: null });

const routes: Array<[method: string, pattern: string, handler: Handler]> = [
  ['GET', '/health', () => ({ status: 'ok', db: 'up' })],

  // ---- auth ----
  ['POST', '/auth/register', ({ db, body }) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const password = String(body.password ?? '');
    const errors: string[] = [];
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('email must be an email');
    if (name.length < 2) errors.push('name must be longer than or equal to 2 characters');
    if (password.length < 8) errors.push('password must be longer than or equal to 8 characters');
    if (errors.length) throw new HttpError(400, errors.join(', '));
    if (db.users.some((u) => u.email === email)) {
      throw new HttpError(409, t('api.emailTaken'), 'EMAIL_TAKEN');
    }
    const user: UserRecord = { id: uid(), email, name, password, role: 'USER', createdAt: nowIso() };
    db.users.push(user);
    return created(issueSession(db, user));
  }],

  ['POST', '/auth/login', ({ db, body }) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const user = db.users.find((u) => u.email === email && u.password === body.password);
    if (!user) throw new HttpError(401, t('api.invalidCredentials'), 'INVALID_CREDENTIALS');
    return issueSession(db, user);
  }],

  ['POST', '/auth/refresh', ({ db }) => {
    const token = localStorage.getItem(COOKIE_KEY);
    const session = db.sessions.find((s) => s.token === token);
    if (!session) throw new HttpError(401, 'Refresh token is missing or invalid');
    if (session.revokedAt) {
      // Reuse of a rotated token: someone may have stolen it, kill the whole family
      db.sessions
        .filter((s) => s.familyId === session.familyId)
        .forEach((s) => (s.revokedAt ??= nowIso()));
      localStorage.removeItem(COOKIE_KEY);
      throw new HttpError(401, 'Refresh token reuse detected');
    }
    const user = db.users.find((u) => u.id === session.userId);
    if (!user) throw new HttpError(401, 'Unauthorized');
    session.revokedAt = nowIso();
    return issueSession(db, user, session.familyId);
  }],

  ['POST', '/auth/logout', ({ db }) => {
    const token = localStorage.getItem(COOKIE_KEY);
    const session = db.sessions.find((s) => s.token === token);
    if (session) session.revokedAt ??= nowIso();
    localStorage.removeItem(COOKIE_KEY);
    return noContent();
  }],

  ['GET', '/auth/me', (ctx) => toUser(requireUser(ctx))],

  // ---- public events ----
  ['GET', '/events', ({ db, query }) => {
    const search = (query.search ?? '').trim().toLowerCase();
    const items = db.events
      .filter((e) => e.status === 'PUBLISHED' && new Date(e.startsAt).getTime() > Date.now())
      .filter((e) =>
        !search ||
        [e.title, e.venue, e.city].some((field) => field.toLowerCase().includes(search)),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => toEvent(db, e));
    return paginate(items, query, 12);
  }],

  ['GET', '/events/:id', (ctx) => {
    const event = findEvent(ctx, ctx.params.id);
    if (event.status === 'DRAFT') throw new HttpError(404, t('api.eventNotFound'));
    return toEvent(ctx.db, event);
  }],

  // ---- organizer ----
  ['GET', '/organizer/events', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    return ctx.db.events
      .filter((e) => user.role === 'ADMIN' || e.organizerId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => toOrganizerEvent(ctx.db, e));
  }],

  ['GET', '/organizer/events/:id', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    return toOrganizerEvent(ctx.db, findOwnEvent(ctx, user, ctx.params.id));
  }],

  ['POST', '/events', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    validateEventBody(ctx.body, false);
    const b = ctx.body;
    const event: EventRecord = {
      id: uid(),
      title: String(b.title).trim(),
      description: String(b.description ?? ''),
      venue: String(b.venue).trim(),
      city: String(b.city).trim(),
      startsAt: new Date(String(b.startsAt)).toISOString(),
      priceCents: Number(b.priceCents),
      currency: 'usd',
      capacity: Number(b.capacity),
      availableSeats: Number(b.capacity),
      coverImageUrl: (b.coverImageUrl as string) || null,
      status: 'DRAFT',
      organizerId: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    ctx.db.events.push(event);
    return created(toEvent(ctx.db, event));
  }],

  ['PATCH', '/events/:id', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    const event = findOwnEvent(ctx, user, ctx.params.id);
    if (event.status === 'CANCELLED') {
      throw new HttpError(409, t('api.cancelledEventLocked'), 'EVENT_LOCKED');
    }
    validateEventBody(ctx.body, true);
    if (event.status === 'PUBLISHED') {
      const locked = LOCKED_AFTER_PUBLISH.filter(
        (field) => ctx.body[field] !== undefined && ctx.body[field] !== event[field],
      );
      if (locked.length) {
        throw new HttpError(409, t('api.lockedFields', { fields: locked.join(', ') }), 'EVENT_LOCKED');
      }
    }
    for (const field of EVENT_FIELDS) {
      if (ctx.body[field] !== undefined) {
        (event as unknown as Record<string, unknown>)[field] = ctx.body[field];
      }
    }
    if (event.status === 'DRAFT') event.availableSeats = event.capacity;
    event.updatedAt = nowIso();
    return toEvent(ctx.db, event);
  }],

  ['POST', '/events/:id/publish', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    const event = findOwnEvent(ctx, user, ctx.params.id);
    if (event.status !== 'DRAFT') {
      throw new HttpError(409, t('api.onlyDraftPublish'), 'INVALID_STATUS_TRANSITION');
    }
    event.status = 'PUBLISHED';
    event.updatedAt = nowIso();
    return toEvent(ctx.db, event);
  }],

  ['POST', '/events/:id/cancel', (ctx) => {
    const user = requireUser(ctx, ['ORGANIZER', 'ADMIN']);
    const event = findOwnEvent(ctx, user, ctx.params.id);
    if (event.status === 'CANCELLED') {
      throw new HttpError(409, t('api.alreadyCancelled'), 'INVALID_STATUS_TRANSITION');
    }
    event.status = 'CANCELLED';
    event.updatedAt = nowIso();
    for (const booking of ctx.db.bookings.filter((b) => b.eventId === event.id)) {
      if (booking.status === 'PENDING') booking.status = 'CANCELLED';
      if (booking.status === 'PAID') booking.status = 'REFUNDED';
      booking.cancelledAt ??= nowIso();
    }
    return toEvent(ctx.db, event);
  }],

  // ---- bookings ----
  ['POST', '/bookings', (ctx) => {
    const user = requireUser(ctx);
    const key = ctx.headers.get('Idempotency-Key');
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) {
      throw new HttpError(400, t('api.idempotencyRequired'));
    }
    const eventId = String(ctx.body.eventId ?? '');
    const quantity = ctx.body.quantity;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 10) {
      throw new HttpError(400, 'quantity must be an integer between 1 and 10');
    }
    const requestHash = JSON.stringify({ eventId, quantity });

    // Idempotency: same key -> same booking; same key with another body -> 422
    const existing = ctx.db.bookings.find((b) => b.userId === user.id && b.idempotencyKey === key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpError(422, t('api.idempotencyReused'), 'IDEMPOTENCY_KEY_REUSED');
      }
      return toBooking(ctx.db, existing);
    }

    const event = findEvent(ctx, eventId);
    if (event.status !== 'PUBLISHED' || new Date(event.startsAt).getTime() <= Date.now()) {
      throw new HttpError(409, t('api.eventNotAvailable'), 'EVENT_NOT_AVAILABLE');
    }
    // Backend equivalent: UPDATE events SET available_seats = available_seats - $q WHERE id = $id AND available_seats >= $q
    if (event.availableSeats < (quantity as number)) {
      throw new HttpError(409, t('api.notEnoughSeats', { available: event.availableSeats }), 'NOT_ENOUGH_SEATS');
    }
    event.availableSeats -= quantity as number;

    const booking: BookingRecord = {
      id: uid(),
      userId: user.id,
      eventId: event.id,
      status: 'PENDING',
      quantity: quantity as number,
      unitPriceCents: event.priceCents,
      totalCents: event.priceCents * (quantity as number),
      currency: event.currency,
      expiresAt: new Date(Date.now() + MOCK_BOOKING_TTL_MINUTES * 60_000).toISOString(),
      paidAt: null,
      cancelledAt: null,
      ticketCode: null,
      createdAt: nowIso(),
      idempotencyKey: key,
      requestHash,
    };
    ctx.db.bookings.push(booking);
    return created(toBooking(ctx.db, booking));
  }],

  ['GET', '/bookings/my', (ctx) => {
    const user = requireUser(ctx);
    return ctx.db.bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => toBooking(ctx.db, b));
  }],

  ['GET', '/bookings/:id', (ctx) => {
    const user = requireUser(ctx);
    return toBooking(ctx.db, findOwnBooking(ctx, user, ctx.params.id));
  }],

  ['POST', '/bookings/:id/cancel', (ctx) => {
    const user = requireUser(ctx);
    const booking = findOwnBooking(ctx, user, ctx.params.id);
    if (booking.status === 'PENDING') {
      booking.status = 'CANCELLED';
    } else if (booking.status === 'PAID') {
      const event = findEvent(ctx, booking.eventId);
      const hoursLeft = (new Date(event.startsAt).getTime() - Date.now()) / 3_600_000;
      if (hoursLeft < REFUND_WINDOW_HOURS) {
        throw new HttpError(409, t('api.refundWindowClosed', { hours: REFUND_WINDOW_HOURS }), 'REFUND_WINDOW_CLOSED');
      }
      booking.status = 'REFUNDED';
    } else {
      throw new HttpError(409, t('api.cannotCancel', { status: booking.status }), 'INVALID_STATUS_TRANSITION');
    }
    booking.cancelledAt = nowIso();
    releaseSeats(ctx.db, booking);
    return toBooking(ctx.db, booking);
  }],

  ['POST', '/bookings/:id/pay', (ctx) => {
    const user = requireUser(ctx);
    const booking = findOwnBooking(ctx, user, ctx.params.id);
    if (booking.status === 'EXPIRED') {
      throw new HttpError(409, t('api.paymentExpired'), 'BOOKING_EXPIRED');
    }
    if (booking.status !== 'PENDING') {
      throw new HttpError(409, t('api.onlyPendingPay'), 'BOOKING_NOT_PENDING');
    }
    // Stripe cannot charge zero: free bookings are confirmed right away
    if (booking.totalCents === 0) {
      booking.status = 'PAID';
      booking.paidAt = nowIso();
      booking.ticketCode = makeTicketCode();
      return { checkoutUrl: `/bookings/${booking.id}?payment=success` };
    }
    return { checkoutUrl: `/mock-checkout/${booking.id}` };
  }],

  // Stands in for Stripe calling POST /api/payments/webhook with checkout.session.completed
  ['POST', '/__mock/checkout/:id/complete', (ctx) => {
    const booking = ctx.db.bookings.find((b) => b.id === ctx.params.id);
    if (!booking) throw new HttpError(404, t('api.bookingNotFound'));
    if (booking.status === 'PENDING') {
      booking.status = 'PAID';
      booking.paidAt = nowIso();
      booking.ticketCode = makeTicketCode();
    }
    return { received: true };
  }],

  // ---- admin ----
  ['GET', '/admin/users', (ctx) => {
    requireUser(ctx, ['ADMIN']);
    const search = (ctx.query.search ?? '').trim().toLowerCase();
    const items = ctx.db.users
      .filter((u) => !search || u.email.includes(search) || u.name.toLowerCase().includes(search))
      .map(toUser);
    return paginate(items, ctx.query, 20);
  }],

  ['PATCH', '/admin/users/:id/role', (ctx) => {
    const admin = requireUser(ctx, ['ADMIN']);
    const role = ctx.body.role as Role;
    if (!['USER', 'ORGANIZER', 'ADMIN'].includes(role)) {
      throw new HttpError(400, 'role must be one of the following values: USER, ORGANIZER, ADMIN');
    }
    if (ctx.params.id === admin.id) {
      throw new HttpError(400, t('api.ownRole'), 'CANNOT_CHANGE_OWN_ROLE');
    }
    const user = ctx.db.users.find((u) => u.id === ctx.params.id);
    if (!user) throw new HttpError(404, t('api.userNotFound'));
    user.role = role;
    return toUser(user);
  }],
];

const compiledRoutes = routes.map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, key: string) => (keys.push(key), '([^/]+)')) + '$',
  );
  return { method, regex, keys, handler };
});

function parseUserId(headers: AxiosHeaders): string | null {
  const auth = headers.get('Authorization');
  if (typeof auth !== 'string' || !auth.startsWith('Bearer mock.')) return null;
  const [, userId, exp] = auth.slice('Bearer '.length).split('.');
  if (!userId || Number(exp) < Date.now()) return null;
  return userId;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  await delay(150 + Math.random() * 250);

  const method = (config.method ?? 'get').toUpperCase();
  const path = (config.url ?? '').split('?')[0];
  const headers = AxiosHeaders.from(config.headers);

  const respond = (status: number, data: unknown): AxiosResponse => ({
    data,
    status,
    statusText: HTTP_ERROR_NAMES[status] ?? 'OK',
    headers: {},
    config,
    request: {},
  });

  let response: AxiosResponse;
  const route = compiledRoutes.find((r) => r.method === method && r.regex.test(path));

  if (!route) {
    response = respond(404, { statusCode: 404, message: `Cannot ${method} /api${path}`, error: 'Not Found' });
  } else {
    const match = path.match(route.regex)!;
    const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    const db = loadDb();
    expireStaleBookings(db);

    try {
      const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : (config.data ?? {});
      const result = route.handler({
        db,
        params,
        query: Object.fromEntries(
          Object.entries(config.params ?? {})
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ),
        body,
        headers,
        userId: parseUserId(headers),
      });
      saveDb(db);
      const wrapped = result as { __status?: number; data?: unknown };
      response = wrapped && typeof wrapped === 'object' && '__status' in wrapped
        ? respond(wrapped.__status!, wrapped.data)
        : respond(200, result);
    } catch (e) {
      // State is saved even on errors, like a committed expiry sweep on the real server
      saveDb(db);
      if (!(e instanceof HttpError)) throw e;
      response = respond(e.status, {
        statusCode: e.status,
        message: e.message,
        error: HTTP_ERROR_NAMES[e.status],
        ...(e.code ? { code: e.code } : {}),
      });
    }
  }

  if (response.status >= 400) {
    throw new AxiosError(
      `Request failed with status code ${response.status}`,
      response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response,
    );
  }
  return response;
};
