import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../utils/password';

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

    const token = await reply.jwtSign({
      sub: user.id,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  });
};

export default registerAuthRoutes;
