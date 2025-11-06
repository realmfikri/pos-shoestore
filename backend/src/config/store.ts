import { env } from './env';

export const storeSettings = {
  name: env.STORE_NAME ?? 'POS Shoestore',
  address: env.STORE_ADDRESS ?? '123 Market Street, Springfield',
  phone: env.STORE_PHONE ?? '(555) 123-4567',
} as const;
