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
import { AdminModule } from '../src/admin/admin.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { HttpExceptionFilter } from '../src/filter/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

interface UserBody {
  id: string;
  role: string;
}
interface UsersBody {
  meta: { total: number };
  items: UserBody[];
}

describeWithDatabase('Admin API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  const admin = { id: randomUUID(), role: 'ADMIN' as const };
  const member = { id: randomUUID(), role: 'USER' as const };
  const users = [admin, member];
  const jwt = new JwtService({ secret: 'admin-test-secret' });
  const auth = (user = admin as { id: string; role: string }) =>
    `Bearer ${jwt.sign({ sub: user.id, role: user.role })}`;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL,
      }),
    });
    await db.user.createMany({
      data: users.map((user) => ({
        ...user,
        name: `${user.id} Name`,
        email: `${user.id}@test.invalid`,
        passwordHash: 'unused',
      })),
    });
    const module = await Test.createTestingModule({
      imports: [AdminModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .useMocker((token) => {
        if (token === PrismaService) return db;
        if (token === ConfigService)
          return new ConfigService({ JWT_ACCESS_SECRET: 'admin-test-secret' });
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
  });

  afterAll(async () => {
    await db?.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    await app?.close();
    await db?.$disconnect();
  });

  it('lists users with pagination and case-insensitive search', async () => {
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', auth(member))
      .expect(403);
    const list = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', auth())
      .expect(200);
    const body = list.body as UsersBody;
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
    expect(body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: member.id })]),
    );
    for (const item of body.items)
      expect(item).not.toHaveProperty('passwordHash');
    const searched = await request(app.getHttpServer())
      .get(`/api/admin/users?search=${member.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect((searched.body as UsersBody).items).toEqual([
      expect.objectContaining({ id: member.id }),
    ]);
  });

  it('changes a role but forbids changing your own', async () => {
    const changed = await request(app.getHttpServer())
      .patch(`/api/admin/users/${member.id}/role`)
      .set('Authorization', auth())
      .send({ role: 'ORGANIZER' })
      .expect(200);
    expect(changed.body as UserBody).toMatchObject({
      id: member.id,
      role: 'ORGANIZER',
    });
    const own = await request(app.getHttpServer())
      .patch(`/api/admin/users/${admin.id}/role`)
      .set('Authorization', auth())
      .send({ role: 'USER' })
      .expect(400);
    expect(own.body as { code: string }).toMatchObject({
      code: 'CANNOT_CHANGE_OWN_ROLE',
    });
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${randomUUID()}/role`)
      .set('Authorization', auth())
      .send({ role: 'USER' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${member.id}/role`)
      .set('Authorization', auth())
      .send({ role: 'SUPERUSER' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/admin/users/invalid/role')
      .set('Authorization', auth())
      .send({ role: 'USER' })
      .expect(400);
  });
});
