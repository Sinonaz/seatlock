import type { Booking, BookingStatus, EventItem, User } from '@/types';

// Records as the fake backend stores them (closer to DB rows than to API responses)
export interface UserRecord extends User {
  password: string;
}

export interface EventRecord extends Omit<EventItem, 'organizer'> {
  organizerId: string;
}

export interface BookingRecord extends Omit<Booking, 'event'> {
  userId: string;
  eventId: string;
  status: BookingStatus;
  idempotencyKey: string;
  requestHash: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  familyId: string;
  revokedAt: string | null;
}

export interface MockDb {
  users: UserRecord[];
  events: EventRecord[];
  bookings: BookingRecord[];
  sessions: SessionRecord[];
}

export const DEMO_PASSWORD = 'password123';

export const DEMO_ACCOUNTS = [
  { email: 'user@seatlock.dev', role: 'USER' as const, label: 'Customer' },
  { email: 'organizer@seatlock.dev', role: 'ORGANIZER' as const, label: 'Organizer' },
  { email: 'admin@seatlock.dev', role: 'ADMIN' as const, label: 'Admin' },
];

const daysFromNow = (days: number, hour = 19) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export function createSeedDb(): MockDb {
  const now = new Date().toISOString();

  const users: UserRecord[] = [
    { id: 'u-user', email: 'user@seatlock.dev', name: 'Алекс Покупатель', role: 'USER', password: DEMO_PASSWORD, createdAt: now },
    { id: 'u-org', email: 'organizer@seatlock.dev', name: 'Live Nation Montevideo', role: 'ORGANIZER', password: DEMO_PASSWORD, createdAt: now },
    { id: 'u-org2', email: 'jazz@seatlock.dev', name: 'Jazz Club Sotano', role: 'ORGANIZER', password: DEMO_PASSWORD, createdAt: now },
    { id: 'u-admin', email: 'admin@seatlock.dev', name: 'Админ Системы', role: 'ADMIN', password: DEMO_PASSWORD, createdAt: now },
  ];

  const base = { currency: 'usd', coverImageUrl: null, createdAt: now, updatedAt: now };

  const events: EventRecord[] = [
    {
      ...base,
      id: 'e-rock',
      title: 'Рок-фестиваль «Ночной прибой»',
      description: 'Три сцены, двенадцать групп и закат над океаном. Вход по билетам, детям до 12 лет бесплатно в сопровождении взрослых.',
      venue: 'Playa Pocitos',
      city: 'Монтевидео',
      startsAt: daysFromNow(12, 18),
      priceCents: 4500,
      capacity: 500,
      availableSeats: 312,
      status: 'PUBLISHED',
      organizerId: 'u-org',
    },
    {
      ...base,
      id: 'e-jazz',
      title: 'Камерный джаз: трио Ортеги',
      description: 'Маленький зал, 5 мест у сцены. Идеальное событие, чтобы проверить, как бэкенд продаёт последнее место двум покупателям одновременно.',
      venue: 'Jazz Club Sotano',
      city: 'Монтевидео',
      startsAt: daysFromNow(5, 21),
      priceCents: 3000,
      capacity: 5,
      availableSeats: 5,
      status: 'PUBLISHED',
      organizerId: 'u-org2',
    },
    {
      ...base,
      id: 'e-standup',
      title: 'Стендап «Без цензуры»',
      description: 'Открытый микрофон и четыре хедлайнера. Осталось совсем немного мест.',
      venue: 'Teatro Solís, малый зал',
      city: 'Монтевидео',
      startsAt: daysFromNow(3, 20),
      priceCents: 2000,
      capacity: 120,
      availableSeats: 3,
      status: 'PUBLISHED',
      organizerId: 'u-org',
    },
    {
      ...base,
      id: 'e-tech',
      title: 'Node.js Meetup #42: транзакции и блокировки',
      description: 'Доклады про SELECT FOR UPDATE, оптимистичные блокировки и идемпотентность платёжных API. Пицца включена.',
      venue: 'Zonamerica, корпус 300',
      city: 'Монтевидео',
      startsAt: daysFromNow(9, 19),
      priceCents: 1000,
      capacity: 80,
      availableSeats: 41,
      status: 'PUBLISHED',
      organizerId: 'u-org',
    },
    {
      ...base,
      id: 'e-tango',
      title: 'Вечер танго в старом городе',
      description: 'Живой оркестр, мастер-класс для начинающих в 20:00 и милонга до полуночи.',
      venue: 'Café Tortoni',
      city: 'Буэнос-Айрес',
      startsAt: daysFromNow(15, 20),
      priceCents: 3500,
      capacity: 60,
      availableSeats: 0,
      status: 'PUBLISHED',
      organizerId: 'u-org2',
    },
    {
      ...base,
      id: 'e-cinema',
      title: 'Кино под открытым небом: «Бегущий по лезвию»',
      description: 'Пледы, попкорн и большой экран на крыше. При дожде показ переносится.',
      venue: 'Rooftop Ciudad Vieja',
      city: 'Монтевидео',
      startsAt: daysFromNow(7, 21),
      priceCents: 1500,
      capacity: 150,
      availableSeats: 98,
      status: 'PUBLISHED',
      organizerId: 'u-org',
    },
    {
      ...base,
      id: 'e-wine',
      title: 'Дегустация вин региона Канелонес',
      description: 'Шесть сортов таната, сыры и рассказ сомелье. Только 18+.',
      venue: 'Bodega Bouza',
      city: 'Канелонес',
      startsAt: daysFromNow(20, 17),
      priceCents: 6000,
      capacity: 30,
      availableSeats: 22,
      status: 'PUBLISHED',
      organizerId: 'u-org2',
    },
    {
      ...base,
      id: 'e-draft',
      title: 'Хакатон по бэкенду (черновик)',
      description: 'Черновик: ещё не опубликован, поэтому его нет в каталоге.',
      venue: 'Sinergia Cowork',
      city: 'Монтевидео',
      startsAt: daysFromNow(30, 10),
      priceCents: 0,
      capacity: 40,
      availableSeats: 40,
      status: 'DRAFT',
      organizerId: 'u-org',
    },
  ];

  const bookings: BookingRecord[] = [
    {
      id: 'b-demo-paid',
      userId: 'u-user',
      eventId: 'e-rock',
      status: 'PAID',
      quantity: 2,
      unitPriceCents: 4500,
      totalCents: 9000,
      currency: 'usd',
      expiresAt: now,
      paidAt: now,
      cancelledAt: null,
      ticketCode: 'SL-7K2M-9QXA',
      createdAt: now,
      idempotencyKey: 'seed-1',
      requestHash: '',
    },
  ];

  return { users, events, bookings, sessions: [] };
}
