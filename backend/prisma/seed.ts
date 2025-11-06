import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';
const OWNER_FIRST_NAME = process.env.SEED_OWNER_FIRST_NAME ?? 'Store';
const OWNER_LAST_NAME = process.env.SEED_OWNER_LAST_NAME ?? 'Owner';

async function main() {
  const passwordHash = await hashPassword(OWNER_PASSWORD);

  await prisma.user.upsert({
    where: { email: OWNER_EMAIL.toLowerCase() },
    update: {
      passwordHash,
      firstName: OWNER_FIRST_NAME,
      lastName: OWNER_LAST_NAME,
      role: Role.OWNER,
    },
    create: {
      email: OWNER_EMAIL.toLowerCase(),
      passwordHash,
      firstName: OWNER_FIRST_NAME,
      lastName: OWNER_LAST_NAME,
      role: Role.OWNER,
    },
  });

  console.info('Seeded owner account', { email: OWNER_EMAIL.toLowerCase() });

  await prisma.setting.upsert({
    where: { key: 'inventory.low_stock_threshold' },
    update: {
      value: '5',
    },
    create: {
      key: 'inventory.low_stock_threshold',
      value: '5',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.info('Ensured inventory low stock threshold setting');
}

main()
  .catch((error) => {
    console.error('Failed to seed data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
