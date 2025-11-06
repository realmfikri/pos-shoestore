import { Role } from '@prisma/client';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: Role;
    };
    user: {
      sub: string;
      role: Role;
    };
  }
}
