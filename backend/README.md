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
   - `MINIO_ENDPOINT` – Hostname for your MinIO server.
   - `MINIO_PORT` – Port exposed by MinIO (e.g. `9000`).
   - `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` – Credentials used to sign requests.
   - `MINIO_BUCKET` – Bucket where product and variant media assets are stored.

   Optional variables:

   - `PORT` – Port Fastify listens on (defaults to `3000`).
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_FIRST_NAME`, `SEED_OWNER_LAST_NAME` – Override seed data for the owner account.
   - `MINIO_USE_SSL` – Set to `true` when MinIO is served over HTTPS.
   - `MEDIA_SIGNED_URL_EXPIRY_SECONDS` – Lifetime for generated PUT URLs (defaults to `900`).
   - `MEDIA_OPTIMIZATION_ENABLED` – Enable Sharp-based optimization jobs when set to `true`.
   - `MEDIA_KEEP_ORIGINAL` – Set to `false` to delete originals after optimization completes.
   - `MEDIA_OPTIMIZED_PREFIX` – Prefix used for optimized assets (defaults to `optimized/`).

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
- `POST /api/sales` – Validates a cart, records the sale and corresponding stock ledger entries in a transaction, and returns totals with the stored payment breakdown.
- `GET /api/sales/:id/receipt` – Retrieves a receipt payload containing store settings, sale lines, and aggregated totals.
- `GET /api/variants/:id` – Looks up a variant by identifier, including brand, product, and on-hand quantity details for quick reference.
- `GET /api/scan/:barcode` – Fetches the variant payload that matches a scanned barcode, returning price and availability information.
- `POST /api/media/signed-url` – Generates a temporary PUT URL in MinIO and reserves a media record for a product or variant. Restricted to owners and stockers.
- `POST /api/media/:mediaId/complete` – Finalises an upload, optionally enqueueing an optimization job.
- `GET /api/media` – Lists media linked to a product or variant for review in the back office.

## Media upload workflow

1. Authenticate as an owner or stocker (employee) and call `POST /api/media/signed-url` with the file name, MIME type, and either a product ID or variant ID. The response contains:
   - `uploadUrl` – Temporary signed PUT URL for MinIO.
   - `fileKey` – Object key written to the bucket.
   - `mediaId` – Identifier for the media record.
   - `expiresAt` – ISO timestamp when the signed URL becomes invalid.
2. Upload the file directly from the client to MinIO using the provided URL. Set the `Content-Type` header to match the value supplied when requesting the URL.
3. Notify the backend that the upload is complete by calling `POST /api/media/{mediaId}/complete`. This verifies the object exists, records metadata, and kicks off optional optimization.
4. Use `GET /api/media?productId=...` (or `variantId`) to retrieve the media catalogue for management interfaces. Optimized derivatives are stored using the configured prefix.

### MinIO configuration notes

- **CORS**: Allow `PUT`, `GET`, and `HEAD` methods from your storefront origins. Include `Content-Type`, `Authorization`, and `x-amz-date` headers. Example JSON rule:

  ```json
  [
    {
      "AllowedOrigin": ["https://app.example.com"],
      "AllowedMethod": ["PUT", "GET", "HEAD"],
      "AllowedHeader": ["*"],
      "ExposeHeader": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```

- **Bucket policy / ACL**: Ensure the application credentials used by the backend can `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` within the configured bucket. Public read access is not required when distributing assets via signed URLs or a CDN.
- **Optimization jobs**: When `MEDIA_OPTIMIZATION_ENABLED=true`, uploads are queued for Sharp processing. Images are resized to a maximum dimension of 1280px and saved as WebP under the `MEDIA_OPTIMIZED_PREFIX`. Disable optimization or set `MEDIA_KEEP_ORIGINAL=false` to control retention of source files.
