import path from 'node:path';
import dotenv from 'dotenv';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { EventStatus, Prisma, PrismaClient, Role } from '@prisma/client';

dotenv.config({
  path: [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ],
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// Совпадает с DEMO_PASSWORD в frontend/src/api/mock/mockData.ts
const DEMO_PASSWORD = 'password123';

// Даты относительно «сейчас», чтобы сиды не протухали
const daysFromNow = (days: number, hour = 19) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const USERS = [
  {
    key: 'user',
    email: 'user@seatlock.dev',
    name: 'Алекс Покупатель',
    role: Role.USER,
  },
  {
    key: 'org',
    email: 'organizer@seatlock.dev',
    name: 'Live Nation Montevideo',
    role: Role.ORGANIZER,
  },
  {
    key: 'jazz',
    email: 'jazz@seatlock.dev',
    name: 'Jazz Club Sotano',
    role: Role.ORGANIZER,
  },
  {
    key: 'admin',
    email: 'admin@seatlock.dev',
    name: 'Админ Системы',
    role: Role.ADMIN,
  },
] as const;

type UserKey = (typeof USERS)[number]['key'];

type EventSeed = Omit<Prisma.EventCreateManyInput, 'organizerId'> & {
  organizer: UserKey;
};

const buildEvents = (): EventSeed[] => [
  {
    title: 'Рок-фестиваль «Ночной прибой»',
    description:
      'Три сцены, двенадцать групп и закат над океаном. Вход по билетам, детям до 12 лет бесплатно в сопровождении взрослых.',
    venue: 'Playa Pocitos',
    city: 'Монтевидео',
    startsAt: daysFromNow(12, 18),
    priceCents: 4500,
    capacity: 500,
    availableSeats: 312,
    status: EventStatus.PUBLISHED,
    organizer: 'org',
  },
  {
    // 5 мест: демо гонки за последнее место в «Лаборатории»
    title: 'Камерный джаз: трио Ортеги',
    description:
      'Маленький зал, 5 мест у сцены. Идеальное событие, чтобы проверить, как бэкенд продаёт последнее место двум покупателям одновременно.',
    venue: 'Jazz Club Sotano',
    city: 'Монтевидео',
    startsAt: daysFromNow(5, 21),
    priceCents: 3000,
    capacity: 5,
    availableSeats: 5,
    status: EventStatus.PUBLISHED,
    organizer: 'jazz',
  },
  {
    // Осталось 3 места
    title: 'Стендап «Без цензуры»',
    description:
      'Открытый микрофон и четыре хедлайнера. Осталось совсем немного мест.',
    venue: 'Teatro Solís, малый зал',
    city: 'Монтевидео',
    startsAt: daysFromNow(3, 20),
    priceCents: 2000,
    capacity: 120,
    availableSeats: 3,
    status: EventStatus.PUBLISHED,
    organizer: 'org',
  },
  {
    title: 'Node.js Meetup #42: транзакции и блокировки',
    description:
      'Доклады про SELECT FOR UPDATE, оптимистичные блокировки и идемпотентность платёжных API. Пицца включена.',
    venue: 'Zonamerica, корпус 300',
    city: 'Монтевидео',
    startsAt: daysFromNow(9, 19),
    priceCents: 1000,
    capacity: 80,
    availableSeats: 41,
    status: EventStatus.PUBLISHED,
    organizer: 'org',
  },
  {
    // Распродано
    title: 'Вечер танго в старом городе',
    description:
      'Живой оркестр, мастер-класс для начинающих в 20:00 и милонга до полуночи.',
    venue: 'Café Tortoni',
    city: 'Буэнос-Айрес',
    startsAt: daysFromNow(15, 20),
    priceCents: 3500,
    capacity: 60,
    availableSeats: 0,
    status: EventStatus.PUBLISHED,
    organizer: 'jazz',
  },
  {
    title: 'Кино под открытым небом: «Бегущий по лезвию»',
    description:
      'Пледы, попкорн и большой экран на крыше. При дожде показ переносится.',
    venue: 'Rooftop Ciudad Vieja',
    city: 'Монтевидео',
    startsAt: daysFromNow(7, 21),
    priceCents: 1500,
    capacity: 150,
    availableSeats: 98,
    status: EventStatus.PUBLISHED,
    organizer: 'org',
  },
  {
    title: 'Дегустация вин региона Канелонес',
    description: 'Шесть сортов таната, сыры и рассказ сомелье. Только 18+.',
    venue: 'Bodega Bouza',
    city: 'Канелонес',
    startsAt: daysFromNow(20, 17),
    priceCents: 6000,
    capacity: 30,
    availableSeats: 22,
    status: EventStatus.PUBLISHED,
    organizer: 'jazz',
  },
  {
    // Черновик: не виден в каталоге
    title: 'Хакатон по бэкенду (черновик)',
    description: 'Черновик: ещё не опубликован, поэтому его нет в каталоге.',
    venue: 'Sinergia Cowork',
    city: 'Монтевидео',
    startsAt: daysFromNow(30, 10),
    priceCents: 0,
    capacity: 40,
    availableSeats: 40,
    status: EventStatus.DRAFT,
    organizer: 'org',
  },
];

async function seedUsers(): Promise<Record<UserKey, string>> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const ids = {} as Record<UserKey, string>;

  for (const { key, email, name, role } of USERS) {
    // update тоже сбрасывает пароль: демо-аккаунты всегда входят с password123
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, role, passwordHash },
      update: { name, role, passwordHash },
    });
    ids[key] = user.id;
  }

  return ids;
}

async function seedEvents(userIds: Record<UserKey, string>) {
  const existing = await prisma.event.count();
  if (existing > 0) {
    console.log(`Events: skipped (table already has ${existing})`);
    return;
  }

  const { count } = await prisma.event.createMany({
    data: buildEvents().map(({ organizer, ...event }) => ({
      ...event,
      organizerId: userIds[organizer],
    })),
  });
  console.log(`Events: created ${count}`);
}

async function main() {
  const userIds = await seedUsers();
  console.log(`Users: upserted ${USERS.length}`);
  await seedEvents(userIds);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
