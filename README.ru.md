# SeatLock — продажа билетов с ограниченным числом мест, Stripe и защитой от гонок

[English](README.md) | **Русский**

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Checkout-635BFF?logo=stripe&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Build and deploy](https://github.com/Sinonaz/seatlock/actions/workflows/deploy.yml/badge.svg)

Сервис продажи билетов на мероприятия с фиксированной вместимостью. Два покупателя одновременно бронируют последнее место — продаётся ровно одно (атомарный `UPDATE` + `CHECK` в PostgreSQL + e2e-доказательство). Повторный запрос после таймаута не создаёт вторую бронь (`Idempotency-Key`). Платные места идут через Stripe Checkout; статус `PAID` ставится только по подписанному вебхуку. Неоплаченная бронь держит места 15 минут, затем фоновая задача возвращает их в продажу.

> **Мой вклад.** Бэкенд (`/backend`) и инфраструктура (Docker, CI/CD, деплой) написаны мной по техническому заданию. Фронтенд (`/frontend`) сгенерирован ИИ-агентом и служит клиентом для API.

![Main](docs/screenshot.png)
<!--**Демо:** https://seatlock.example.com-->

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Стек](#стек)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [API](#api)
- [Структура проекта](#структура-проекта)
- [Тесты](#тесты)
- [Деплой](#деплой)
- [Технические решения](#технические-решения)
- [Планы](#планы)

## Возможности

- **Роли** — `USER` / `ORGANIZER` / `ADMIN`, JWT access + refresh-токен в httpOnly cookie (ротация и reuse detection).
- **Бронь без гонок** — места списываются атомарным условным `UPDATE`; `CHECK` в БД не даёт уйти `availableSeats` в минус.
- **Идемпотентность** — заголовок `Idempotency-Key` на `POST /bookings`: повтор возвращает ту же бронь, а не вторую.
- **Платежи** — Stripe Checkout (test mode); статус только из подписанных вебхуков; возвраты в настраиваемом окне.
- **Истечение брони** — неоплаченные `PENDING` через 15 минут становятся `EXPIRED`, места возвращаются в продажу.
- **Кабинет организатора** — создание / публикация / отмена мероприятий и статистика продаж по своим событиям.
- **Лаборатория конкурентности** — `/lab` шлёт N параллельных броней и показывает, сколько получили `201` / `200` / `409`.
- **Документация API** — Swagger UI в режиме разработки.

## Архитектура

```mermaid
flowchart LR
    User((Пользователь)) --> Caddy[Caddy<br/>HTTPS]
    Caddy --> Nginx[Nginx<br/>Vue SPA]
    Nginx -- /api --> API[NestJS API]

    subgraph Backend
        API --> Auth[AuthModule]
        API --> Events[EventsModule]
        API --> Bookings[BookingsModule]
        API --> Payments[PaymentsModule]
        Expiry[BookingsExpiry<br/>cron] --> DB
        Auth --> DB[(PostgreSQL)]
        Events --> DB
        Bookings --> DB
        Payments --> DB
    end

    Payments --> Stripe[Stripe API]
    Stripe -- webhook --> Payments
```

**Главный сценарий:**

1. Покупатель выбирает места → `POST /api/bookings` атомарно уменьшает `availableSeats` и создаёт бронь `PENDING` на 15 минут.
2. Покупатель жмёт «Оплатить» → бэкенд создаёт сессию Stripe Checkout → браузер уходит на Stripe.
3. Stripe присылает `checkout.session.completed` → бронь становится `PAID`, генерируется код билета.
4. Если оплаты нет → задача истечения переводит бронь в `EXPIRED` и возвращает места.

Фронтенд и API работают на одном origin (`/api` проксирует Vite локально и nginx в production) — CORS не нужен, refresh-cookie работает без `SameSite=None`.

### Модель данных

```mermaid
erDiagram
    User ||--o{ Event : organizes
    User ||--o{ Booking : places
    User ||--o{ RefreshToken : sessions
    Event ||--o{ Booking : seats
    Booking ||--o{ Payment : payments

    User {
        uuid id PK
        string email UK
        enum role "USER | ORGANIZER | ADMIN"
    }
    Event {
        uuid id PK
        uuid organizerId FK
        int capacity
        int availableSeats
        enum status "DRAFT | PUBLISHED | CANCELLED"
    }
    Booking {
        uuid id PK
        uuid userId FK
        uuid eventId FK
        enum status "PENDING | PAID | CANCELLED | EXPIRED | REFUNDED"
        string idempotencyKey
        string ticketCode UK
    }
    Payment {
        uuid id PK
        uuid bookingId FK
        enum status "PENDING | SUCCEEDED | FAILED | REFUNDED"
        string stripeCheckoutSessionId UK
    }
    RefreshToken {
        uuid id PK
        uuid userId FK
        string tokenHash UK
        string familyId
    }
```

`@@unique([userId, idempotencyKey])` — основа идемпотентности бронирования. `CHECK`-ограничения держат `availableSeats >= 0`, границы quantity и равенство `totalCents = unitPriceCents * quantity`.

## Стек

| Слой | Технологии |
|---|---|
| Backend | NestJS 11, TypeScript, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 16, JWT + argon2, `@nestjs/schedule`, `@nestjs/throttler`, Stripe SDK, `class-validator`, Swagger |
| Frontend | Vue 3, Vite, Pinia, Vue Router, Tailwind CSS 4 *(сгенерирован ИИ)* |
| Тесты | Jest, Supertest, ESLint, Prettier |
| Инфраструктура | Docker (multi-stage), Docker Compose, Nginx, Caddy, GitHub Actions, GHCR |

## Быстрый старт

**Требования:** Docker и Docker Compose. Для локальной разработки без Docker — Node.js 22+ и pnpm. Опционально: [Stripe CLI](https://stripe.com/docs/stripe-cli) для вебхуков.

### Вариант 1. Локальная разработка (рекомендуется)

```bash
git clone https://github.com/Sinonaz/seatlock.git
cd seatlock

# 1. База данных
docker compose up -d           # PostgreSQL на localhost:5434

# 2. Бэкенд
cd backend
cp .env.example .env
pnpm install
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
pnpm start:dev                 # http://localhost:3000/api

# 3. Фронтенд (в другом терминале)
cd ../frontend
cp .env.example .env
pnpm install
pnpm dev                       # http://localhost:5173
```

Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs) (доступен только вне production).

> Фронтенд умеет работать в **Mock Mode** без бэкенда — переключатель в шапке или `VITE_MOCK_MODE=true`.

**Демо-аккаунты** (пароль `password123`): `user@seatlock.dev`, `organizer@seatlock.dev`, `admin@seatlock.dev`.

### Stripe (опционально)

При `STRIPE_ENABLED=false` (по умолчанию) бесплатные билеты оплачиваются сразу, платные checkout'ы возвращают `503`. Чтобы включить оплату:

```bash
# в backend/.env
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # из `stripe listen`

stripe listen --forward-to localhost:3000/api/payments/webhook \
  --events checkout.session.completed,checkout.session.expired,charge.refunded
```

### Вариант 2. Production-like compose

```bash
cp .env.example .env           # заполните секреты
docker compose -f docker-compose.prod.yaml up -d
```

## Переменные окружения

### Backend (`backend/.env`)

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да | Строка подключения к PostgreSQL |
| `PORT` | нет | Порт API, по умолчанию `3000` |
| `FRONTEND_URL` | да | Origin фронтенда (cookies / редиректы Stripe) |
| `JWT_ACCESS_SECRET` | да | Секрет подписи access-токена |
| `JWT_ACCESS_TTL` | нет | TTL access, по умолчанию `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | нет | TTL refresh в днях, по умолчанию `30` |
| `BOOKING_TTL_MINUTES` | нет | Время жизни неоплаченной брони, по умолчанию `15` |
| `REFUND_WINDOW_HOURS` | нет | Окно возврата после оплаты, по умолчанию `24` |
| `STRIPE_ENABLED` | нет | `true` включает Checkout; по умолчанию `false` |
| `STRIPE_SECRET_KEY` | если Stripe | Секретный ключ Stripe (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | если Stripe | Секрет подписи вебхука (`whsec_...`) |
| `NODE_ENV` | нет | `production` отключает Swagger |

### Корень проекта (`.env` для production Compose)

| Переменная | Описание |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Учётные данные PostgreSQL |
| `FRONTEND_URL` | Публичный origin, например `https://seatlock.example.com` |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_DAYS` | Настройки auth |
| `BOOKING_TTL_MINUTES`, `REFUND_WINDOW_HOURS` | Окна брони / возврата |
| `STRIPE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe (опционально) |

### Frontend (`frontend/.env`)

| Переменная | Описание |
|---|---|
| `VITE_API_URL` | Базовый путь API, по умолчанию `/api` (same-origin proxy) |
| `VITE_MOCK_MODE` | `true` — стартовать на mock-данных |

## API

Все эндпоинты имеют префикс `/api`. Входные данные валидируются через `ValidationPipe` (`whitelist`, `transform`). Деньги всегда в центах (целые числа). Авторизация: `Authorization: Bearer <accessToken>`; refresh живёт в httpOnly cookie.

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| `POST` | `/auth/register` | public | Регистрация |
| `POST` | `/auth/login` | public | Вход |
| `POST` | `/auth/refresh` | cookie | Ротация refresh / выдача access |
| `POST` | `/auth/logout` | cookie | Отзыв семейства refresh |
| `GET` | `/auth/me` | user | Текущий пользователь |
| `GET` | `/events` | public | Каталог опубликованных |
| `GET` | `/events/:id` | public | Карточка мероприятия |
| `POST` | `/events` | organizer | Создать черновик |
| `PATCH` | `/events/:id` | organizer | Обновить черновик |
| `POST` | `/events/:id/publish` | organizer | Опубликовать |
| `POST` | `/events/:id/cancel` | organizer | Отменить |
| `GET` | `/organizer/events` | organizer | Свои мероприятия + статистика |
| `POST` | `/bookings` | user | Создать бронь (нужен `Idempotency-Key`) |
| `GET` | `/bookings/my` | user | Мои брони |
| `GET` | `/bookings/:id` | user | Детали брони |
| `POST` | `/bookings/:id/pay` | user | Checkout / подтверждение бесплатной |
| `POST` | `/bookings/:id/cancel` | user | Отмена / запрос возврата |
| `POST` | `/payments/webhook` | Stripe | Приём подписанных вебхуков |
| `GET` | `/admin/users` | admin | Список пользователей |
| `PATCH` | `/admin/users/:id/role` | admin | Сменить роль |
| `GET` | `/health` | public | Healthcheck |

<details>
<summary>Примеры запросов</summary>

```bash
# Вход
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@seatlock.dev","password":"password123"}'

# Бронь на 2 места (сохраните Idempotency-Key — повторы должны его переиспользовать)
curl -b cookies.txt -X POST http://localhost:3000/api/bookings \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
  -H 'Content-Type: application/json' \
  -d '{"eventId":"<uuid>","quantity":2}'

# Оплата
curl -b cookies.txt -X POST http://localhost:3000/api/bookings/<id>/pay \
  -H 'Authorization: Bearer <accessToken>'
```

</details>

Полный контракт, статусная машина и вопросы к собеседованию: [backend/TECHNICAL_SPECIFICATION.md](backend/TECHNICAL_SPECIFICATION.md).

## Структура проекта

```
.
├── backend/
│   ├── prisma/               # схема, миграции, seed
│   ├── test/                 # e2e: events, bookings, payments, admin
│   └── src/
│       ├── auth/             # JWT access, refresh cookie, ротация, reuse detection
│       ├── users/            # поиск пользователей
│       ├── events/           # каталог + кабинет организатора
│       ├── bookings/         # атомарное списание мест, cron истечения
│       ├── payments/         # Stripe Checkout, вебхуки, возвраты
│       ├── admin/            # управление ролями
│       ├── health/           # /api/health
│       ├── prisma/           # PrismaService
│       └── filter/           # глобальный фильтр HTTP-исключений
├── frontend/                 # Vue 3 SPA + nginx (проксирует /api на бэкенд)
├── docker/postgres-init/     # создаёт seatlock_test для e2e
├── deploy/                   # фрагмент Caddyfile для общего reverse proxy
├── docker-compose.yaml       # локальный PostgreSQL на :5434
├── docker-compose.prod.yaml  # production: postgres + образы из GHCR
└── .github/workflows/        # CI/CD
```

## Тесты

```bash
cd backend
pnpm test --runInBand                                    # unit-тесты
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/seatlock_test \
  pnpm run test:e2e --runInBand                          # полный e2e
pnpm run test:bookings                                   # конкурентность + идемпотентность
pnpm run test:payments                                   # checkout, вебхуки, возвраты
```

E2E-сьюты используют отдельную БД `seatlock_test`. Сьюит бронирований доказывает, что N параллельных запросов на ограниченную вместимость не продают лишних мест, а повторный `Idempotency-Key` возвращает ту же бронь.

## Деплой

При пуше в `main` GitHub Actions:

1. Прогоняет unit- и e2e-тесты на PostgreSQL service — при ошибке деплой не начинается.
2. Собирает Docker-образы бэкенда и фронтенда (matrix build, кэш слоёв через GHA).
3. Публикует их в GitHub Container Registry с тегами `latest` и `<commit sha>`.
4. Копирует `docker-compose.prod.yaml` в `/srv/seatlock` по SSH, подтягивает образы и перезапускает сервисы с ожиданием healthcheck (`docker compose up -d --wait`).

В production стек: `postgres` + `backend` + `frontend` из GHCR. Caddy во внешней Docker-сети `proxy` закрывает HTTPS и проксирует на `seatlock-frontend`. Nginx внутри фронтенда раздаёт SPA и проксирует `/api` на бэкенд — один origin. Ни бэкенд, ни PostgreSQL порты наружу не публикуют.

Секреты репозитория: `SERVER_HOST`, `SERVER_USER`, `SSH_KEY`. На сервере нужны `/srv/seatlock/.env` и внешняя сеть `proxy`. Пример блока Caddy: [deploy/Caddyfile.example](deploy/Caddyfile.example).

## Технические решения

- **Атомарное списание мест.** `UPDATE ... SET availableSeats = availableSeats - N WHERE availableSeats >= N` — без гонки read-check-write. `CHECK` в БД — второй рубеж.
- **Idempotency-Key.** Уникальность `(userId, idempotencyKey)` плюс хеш тела: тот же ключ + то же тело → тот же ответ; тот же ключ + другое тело → `409`.
- **Refresh не JWT.** Opaque-токен, хеш SHA-256; хранится с `familyId` для ротации и reuse detection (повторное использование украденного токена отзывает всё семейство).
- **Вебхук — источник истины.** Success URL Checkout никогда не ставит `PAID`; только событие Stripe с проверенной подписью. Id обработанных событий сохраняются, чтобы игнорировать дубли.
- **Деньги в центах.** Все суммы — целые числа, без float.
- **Compare-and-set переходы статусов.** Expiry / pay / cancel / refund обновляют только из ожидаемого предыдущего статуса — cron и вебхук не ломают состояние.
- **Stripe можно выключить.** При `STRIPE_ENABLED=false` бесплатные брони работают без ключей; платные checkout'ы дают `503`.
- **Multi-stage Dockerfile** и `prisma migrate deploy` при старте контейнера.

## Планы

- [ ] BullMQ + Redis: отложенное истечение каждой брони вместо polling cron
- [ ] Нумерованные места (ряд/место) с частичным уникальным индексом
- [ ] Email с билетом через outbox-таблицу
- [ ] QR-код билета и роль контролёра на входе
- [ ] Нагрузочный тест (`k6` / autocannon) на `POST /bookings`
- [ ] Структурированные логи (`nestjs-pino`) и метрики Prometheus
