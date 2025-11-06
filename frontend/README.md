# Shoehaven POS frontend

This Vite + React + TypeScript application provides the point-of-sale, inventory, receiving, and reporting interfaces for the Shoehaven store network.

## Getting started

```bash
pnpm install
pnpm dev
```

The development server is available at http://localhost:5173 by default. The API base URL is assumed to be served from the same origin via `/api` routes.

### Production build

```bash
pnpm build
```

The build command outputs static assets to `dist/`, ready to be served by Nginx or any static host. A progressive web app service worker is generated automatically.

### Linting

```bash
pnpm lint
```

## Key features

- Authentication context with in-memory JWT storage, refresh fallback, and guarded routes
- Tailwind CSS design system with Shoehaven theme tokens
- TanStack Query data layer for POS, inventory, receiving, and reporting views
- Responsive layouts with Headless UI navigation and breadcrumbs
- Installable PWA experience with service worker and install prompt banner
