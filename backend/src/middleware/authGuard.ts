import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';

export type AuthenticatedRequest = FastifyRequest & {
  user: {
    sub: string;
    role: Role;
  };
};

export const requireRoles = (roles: Role | Role[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: 'Unauthorized' });
      return;
    }

    const user = (request as AuthenticatedRequest).user;

    if (!allowedRoles.includes(user.role)) {
      reply.code(403).send({ message: 'Forbidden' });
      return;
    }
  };
};
