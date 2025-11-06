# POS Shoestore Backend

This service is a Fastify + TypeScript API that provides authentication and health monitoring endpoints for the POS Shoestore platform.

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the example environment file and adjust the values for your environment:

   ```bash
   cp .env.example .env
   ```

   Required variables:

   - `DATABASE_URL` – PostgreSQL connection string used by Prisma.
   - `JWT_SECRET` – Secret used to sign JSON Web Tokens. Use at least 32 characters.

   Optional variables:

   - `PORT` – Port Fastify listens on (defaults to `3000`).
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_FIRST_NAME`, `SEED_OWNER_LAST_NAME` – Override seed data for the owner account.

3. Apply database migrations, generate the Prisma client, and seed the database:

   ```bash
   pnpm prisma:migrate
   pnpm prisma:generate
   pnpm prisma:seed
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

## Available scripts

- `pnpm dev` – Start the server in watch mode using `tsx`.
- `pnpm build` – Type-check and compile TypeScript to `dist/`.
- `pnpm start` – Run the compiled server.
- `pnpm lint` – Run ESLint on the `src` directory.
- `pnpm format` – Format source files with Prettier.
- `pnpm prisma:migrate` – Apply Prisma migrations in development.
- `pnpm prisma:generate` – Generate the Prisma client.
- `pnpm prisma:seed` – Seed the database with initial data.

## Endpoints

- `GET /healthz` – Returns `{"status":"ok"}` when the service is healthy.
- `GET /readyz` – Returns `{"status":"ready"}` to indicate readiness.
- `POST /api/auth/login` – Accepts `{ "email": string, "password": string }` and returns a signed JWT along with user details when credentials are valid.
