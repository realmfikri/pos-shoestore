declare module '@prisma/client' {
  export const Role: {
    readonly OWNER: 'OWNER';
    readonly MANAGER: 'MANAGER';
    readonly EMPLOYEE: 'EMPLOYEE';
  };

  export type Role = (typeof Role)[keyof typeof Role];

  export type User = {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
  };

  export interface PrismaClientOptions {
    log?: Array<'query' | 'info' | 'warn' | 'error'>;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);

    user: {
      findUnique(args: { where: { email?: string; id?: string } }): Promise<User | null>;
      upsert(args: {
        where: { email: string };
        update: Partial<User>;
        create: Partial<User> & { email: string; passwordHash: string; firstName: string; lastName: string; role: Role };
      }): Promise<User>;
    };

    $disconnect(): Promise<void>;
  }
}
