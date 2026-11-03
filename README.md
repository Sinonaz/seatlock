# SeatLock — сервис продажи билетов с ограниченным числом мест

Пет-проект про то, что обычно ломается в коммерческой разработке: **гонки за последнее место, повторные запросы, платежи и фоновые задачи**.

- Два покупателя одновременно бронируют последнее место → продаётся ровно одно (атомарный `UPDATE` + `CHECK` в БД + e2e-тест).
- Повторный запрос после таймаута не создаёт вторую бронь (`Idempotency-Key`).
- Оплата через Stripe Checkout (test mode), статус подтверждается только подписанным вебхуком.
- Неоплаченная бронь держит места 15 минут, затем фоновая задача возвращает их в продажу.
- JWT access + refresh-токен в httpOnly cookie с ротацией и reuse detection, роли USER / ORGANIZER / ADMIN.

## Структура

```
seatlock/
├── frontend/              # Vue 3 + TypeScript + Tailwind 4 + Pinia + Vue Router (готов)
├── backend/               # NestJS + PostgreSQL + Prisma + Stripe
│   └── TECHNICAL_SPECIFICATION.md
├── docker/postgres-init/  # создаёт тестовую БД seatlock_test
├── deploy/                # пример блока для общего Caddy на сервере
├── docker-compose.yaml        # локально: только PostgreSQL на :5434
├── docker-compose.prod.yaml   # сервер: postgres + backend + frontend из GHCR
└── .github/workflows/deploy.yml
```

## Фронтенд

```bash
cd frontend
pnpm install
pnpm dev
```
Откроется [http://localhost:5173](http://localhost:5173).

- **Mock / Live API** — переключатель в шапке. В Mock-режиме весь бэкенд эмулируется в браузере (`src/api/mock/mockServer.ts`) по тому же контракту, что описан в ТЗ, так что интерфейс можно смотреть без сервера. В Live-режиме запросы идут на `/api`, а Vite проксирует их на `http://localhost:3000`.
- **Демо-аккаунты** (пароль `password123`): `user@seatlock.dev`, `organizer@seatlock.dev`, `admin@seatlock.dev`.
- **Страницы**: афиша с поиском и пагинацией, карточка мероприятия, бронь с таймером, оплата, электронный билет, мои билеты, кабинет организатора со статистикой продаж, управление ролями.
- **Лаборатория** (`/lab`, иконка колбы в шапке): отправляет N параллельных `POST /api/bookings` и показывает, сколько получили 201, 200 и 409. На ней видно, что бэкенд не продаёт лишних мест и что повторный `Idempotency-Key` не создаёт новую бронь.

## Бэкенд

👉 **[backend/TECHNICAL_SPECIFICATION.md](./backend/TECHNICAL_SPECIFICATION.md)**: архитектура, схема БД, полный контракт API, статусная машина, 16 этапов разработки с проверками, тесты конкурентности, деплой и вопросы для собеседования.

Быстрый старт после реализации:
```bash
docker compose up -d                 # PostgreSQL на localhost:5434
cd backend && pnpm start:dev         # API на http://localhost:3000/api
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Бэкенд работает и без Stripe-ключей: с `STRIPE_ENABLED=false` (по умолчанию)
бесплатные билеты оплачиваются сразу, а платные возвращают `503`. Чтобы включить
оплату, заполни `STRIPE_SECRET_KEY` и `STRIPE_WEBHOOK_SECRET` в `backend/.env`
и поставь `STRIPE_ENABLED=true` (см. `backend/README.md`).

## Деплой

Как у ApexRate: GitHub Actions собирает образы `ghcr.io/sinonaz/seatlock-{backend,frontend}`, копирует `docker-compose.prod.yaml` в `/srv/seatlock` на сервере и перезапускает контейнеры. HTTPS даёт общий Caddy (блок в `deploy/Caddyfile.example`). Подробности в разделе 9 ТЗ.

Workflow собирает образы и запускает unit/e2e-тесты с PostgreSQL перед деплоем.
