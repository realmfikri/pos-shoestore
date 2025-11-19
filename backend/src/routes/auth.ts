import { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { verifyPassword } from '../utils/password';
import { env } from '../config/env';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
};

const setRefreshCookie = (reply: FastifyReply, token: string, expiresAt: Date) => {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    ...cookieOptions,
    expires: expiresAt,
  });
};

const clearRefreshCookie = (reply: FastifyReply) => {
  reply.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
};

const serializeUser = (user: {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}) => {
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter((part) => part)
    .join(' ');

  return {
    id: user.id,
    email: user.email,
    name,
    roles: [user.role],
  };
};

const createRefreshToken = async (fastify: FastifyInstance, userId: string) => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await fastify.prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
};

const deleteRefreshToken = async (fastify: FastifyInstance, token: string) => {
  try {
    await fastify.prisma.refreshToken.delete({
      where: { token },
    });
  } catch (error) {
    fastify.log.debug({ err: error }, 'Refresh token already removed');
  }
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginSchema = z.infer<typeof loginSchema>;

const registerAuthRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post<{ Body: LoginSchema }>('/api/auth/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400).send({
        message: 'Validation failed',
        issues: parseResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { email, password } = parseResult.data;

    const user = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      reply.code(401).send({ message: 'Invalid credentials' });
      return;
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      reply.code(401).send({ message: 'Invalid credentials' });
      return;
    }

    await fastify.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    const refresh = await createRefreshToken(fastify, user.id);
    setRefreshCookie(reply, refresh.token, refresh.expiresAt);

    const token = await reply.jwtSign({
      sub: user.id,
      role: user.role,
    });

    return {
      token,
      user: serializeUser(user),
    };
  });

  fastify.post('/api/auth/refresh', async (request, reply) => {
    const existingToken = request.cookies?.[REFRESH_COOKIE_NAME];

    if (!existingToken) {
      clearRefreshCookie(reply);
      reply.code(401).send({ message: 'Missing refresh token' });
      return;
    }

    const storedToken = await fastify.prisma.refreshToken.findUnique({
      where: { token: existingToken },
    });

    if (!storedToken || storedToken.expiresAt.getTime() <= Date.now()) {
      if (storedToken) {
        await deleteRefreshToken(fastify, storedToken.token);
      }
      clearRefreshCookie(reply);
      reply.code(401).send({ message: 'Invalid refresh token' });
      return;
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: storedToken.userId } });

    if (!user) {
      await deleteRefreshToken(fastify, storedToken.token);
      clearRefreshCookie(reply);
      reply.code(401).send({ message: 'Invalid refresh token' });
      return;
    }

    await deleteRefreshToken(fastify, storedToken.token);
    const refresh = await createRefreshToken(fastify, user.id);
    setRefreshCookie(reply, refresh.token, refresh.expiresAt);

    const token = await reply.jwtSign({ sub: user.id, role: user.role });

    return {
      token,
      user: serializeUser(user),
    };
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    const existingToken = request.cookies?.[REFRESH_COOKIE_NAME];

    if (existingToken) {
      await deleteRefreshToken(fastify, existingToken);
    }

    clearRefreshCookie(reply);

    return { success: true };
  });
};

export default registerAuthRoutes;
