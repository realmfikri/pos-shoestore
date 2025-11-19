import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RefreshTokenRecord {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

class FakePrismaClient {
  users = new Map<string, UserRecord>();
  refreshTokenStore = new Map<string, RefreshTokenRecord>();
  nextRefreshId = 1;

  user = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }): Promise<UserRecord | null> => {
      if (where.email) {
        const normalized = where.email.toLowerCase();
        const match = Array.from(this.users.values()).find((candidate) => candidate.email.toLowerCase() === normalized);
        return match ? { ...match } : null;
      }

      if (where.id) {
        const record = this.users.get(where.id);
        return record ? { ...record } : null;
      }

      return null;
    },
  };

  refreshToken = {
    create: async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }): Promise<RefreshTokenRecord> => {
      const record: RefreshTokenRecord = {
        id: `refresh-${this.nextRefreshId++}`,
        token: data.token,
        userId: data.userId,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      };
      this.refreshTokenStore.set(record.token, record);
      return { ...record };
    },
    deleteMany: async ({ where }: { where: { userId?: string } }): Promise<{ count: number }> => {
      let count = 0;
      for (const record of Array.from(this.refreshTokenStore.values())) {
        if (where.userId && record.userId !== where.userId) {
          continue;
        }
        this.refreshTokenStore.delete(record.token);
        count += 1;
      }
      return { count };
    },
    findUnique: async ({ where }: { where: { token: string } }): Promise<RefreshTokenRecord | null> => {
      const record = this.refreshTokenStore.get(where.token);
      return record ? { ...record } : null;
    },
    delete: async ({ where }: { where: { token: string } }): Promise<RefreshTokenRecord> => {
      const record = this.refreshTokenStore.get(where.token);
      if (!record) {
        throw new Error('Not found');
      }
      this.refreshTokenStore.delete(where.token);
      return { ...record };
    },
  };

  async $disconnect() {}
}

type RegisterAuthRoutes = typeof import('./auth').default;

type InjectedCookie = { name: string; value: string };

const findCookie = (response: { cookies?: unknown }, name: string) => {
  const cookies = (response.cookies ?? []) as InjectedCookie[];
  return cookies.find((cookie) => cookie.name === name);
};

const TEST_PASSWORD = 'SuperSecure!123';

let registerAuthRoutes: RegisterAuthRoutes;
let server: FastifyInstance;
let prisma: FakePrismaClient;
let passwordHash: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-jwt-value-should-be-long-123456';
  process.env.DATABASE_URL = 'postgres://localhost/test';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_ACCESS_KEY = 'minio';
  process.env.MINIO_SECRET_KEY = 'miniopass';
  process.env.MINIO_BUCKET = 'media';
  process.env.MINIO_USE_SSL = 'false';
  process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS = '900';
  process.env.MEDIA_OPTIMIZATION_ENABLED = 'false';
  process.env.MEDIA_KEEP_ORIGINAL = 'true';
  process.env.MEDIA_OPTIMIZED_PREFIX = 'optimized/';
  process.env.REPORT_CACHE_TTL_SECONDS = '60';

  passwordHash = await hashPassword(TEST_PASSWORD);
  ({ default: registerAuthRoutes } = await import('./auth'));
});

beforeEach(async () => {
  prisma = new FakePrismaClient();
  const now = new Date();
  prisma.users.set('user-1', {
    id: 'user-1',
    email: 'owner@example.com',
    passwordHash,
    firstName: 'Avery',
    lastName: 'Shaw',
    role: 'OWNER',
    createdAt: now,
    updatedAt: now,
  });

  server = Fastify({ logger: false });
  await server.register(fastifyCookie);
  await server.register(fastifyJwt, { secret: process.env.JWT_SECRET! });
  server.decorate('prisma', prisma as unknown as PrismaClient);
  await server.register(registerAuthRoutes);
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

describe('POST /api/auth/login', () => {
  it('issues an access token response and refresh cookie', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.token).toBe('string');
    expect(body.user).toMatchObject({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Avery Shaw',
      roles: ['OWNER'],
    });
    const refreshCookie = findCookie(response, 'refreshToken');
    expect(refreshCookie?.value).toBeTruthy();
    expect(prisma.refreshTokenStore.size).toBe(1);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates refresh tokens and returns a fresh access token', async () => {
    const tokenValue = 'existing-refresh-token';
    await prisma.refreshToken.create({
      data: {
        token: tokenValue,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: tokenValue },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.token).toBe('string');
    expect(body.user).toMatchObject({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Avery Shaw',
      roles: ['OWNER'],
    });

    const refreshCookie = findCookie(response, 'refreshToken');
    expect(refreshCookie?.value).toBeTruthy();
    expect(refreshCookie?.value).not.toBe(tokenValue);
    expect(prisma.refreshTokenStore.has(tokenValue)).toBe(false);
    expect(prisma.refreshTokenStore.size).toBe(1);
  });

  it('clears cookies and rejects expired refresh tokens', async () => {
    const tokenValue = 'expired-refresh-token';
    await prisma.refreshToken.create({
      data: {
        token: tokenValue,
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: tokenValue },
    });

    expect(response.statusCode).toBe(401);
    const refreshCookie = findCookie(response, 'refreshToken');
    expect(refreshCookie?.value).toBe('');
    expect(prisma.refreshTokenStore.size).toBe(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('removes refresh credentials and clears the cookie', async () => {
    const tokenValue = 'logout-refresh-token';
    await prisma.refreshToken.create({
      data: {
        token: tokenValue,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { refreshToken: tokenValue },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    const refreshCookie = findCookie(response, 'refreshToken');
    expect(refreshCookie?.value).toBe('');
    expect(prisma.refreshTokenStore.size).toBe(0);
  });
});
