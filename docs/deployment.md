# Deployment & Operations Guide

This document describes how the POS Shoestore stack is deployed on the Axioo Hype 5 server that exposes services via Cloudflare Tunnel.

## Stack summary

| Component | Runtime | Listen address |
| --- | --- | --- |
| Frontend (static) | Vite build served by Nginx | `127.0.0.1:3000` |
| Backend API | Fastify + Node 20 | `0.0.0.0:4000` |
| MinIO API | MinIO server (Go) | `127.0.0.1:9000` (API) / `127.0.0.1:9001` (console) |
| PostgreSQL | PostgreSQL 16 | `127.0.0.1:5432` |
| Cloudflare Tunnel | cloudflared 2025.11.1 | Connects the three hostnames to the local ports |

All external traffic reaches the machine through the Cloudflare tunnel:

- `https://citrasepatu.muhamadfikri.com` → `http://127.0.0.1:3000`
- `https://api.citrasepatu.muhamadfikri.com` → `http://127.0.0.1:4000`
- `https://minio.citrasepatu.muhamadfikri.com` → `http://127.0.0.1:9001`

## Directory layout

```
/opt/pos-shoestore
├── backend        # Fastify API, compiled TypeScript in dist/
├── frontend       # Vite build output in frontend/dist
└── shared         # Reserved for future shared assets/backups

/home/workstation06/services
├── postgres-data  # Custom pg cluster (pg_createcluster 16 main)
├── minio-data     # MinIO object storage directory
└── env            # Environment files (minio.env, etc)
```

## Environment files

### Backend

`/opt/pos-shoestore/backend/.env.production`

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://citrasepatu:CitraSepatu_2025!db@localhost:5432/citrasepatu
JWT_SECRET=Z3JxN2t5Zl9DaXRyYVNlcGF0dV8yMDI1X19qc3Zz
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin_citra
MINIO_SECRET_KEY="CitraMinio_2025!storage"
MINIO_BUCKET=citrasepatu-uploads
PUBLIC_APP_URL=https://citrasepatu.muhamadfikri.com
PUBLIC_API_URL=https://api.citrasepatu.muhamadfikri.com
STORE_NAME="Citra Sepatu"
STORE_ADDRESS="Jakarta"
STORE_PHONE="+62-21-0000-0000"
REDIS_ENABLED=false
MEDIA_SIGNED_URL_EXPIRY_SECONDS=900
MEDIA_OPTIMIZATION_ENABLED=false
MEDIA_KEEP_ORIGINAL=true
MEDIA_OPTIMIZED_PREFIX=optimized/
REPORT_CACHE_TTL_SECONDS=300
```

### Frontend

`/home/workstation06/pos-shoestore/frontend/.env.production` (copied before building)

```
VITE_APP_BASE_URL=https://citrasepatu.muhamadfikri.com
VITE_API_BASE_URL=https://api.citrasepatu.muhamadfikri.com
```

### MinIO server

`/home/workstation06/services/env/minio.env`

```
MINIO_ROOT_USER=minioadmin_citra
MINIO_ROOT_PASSWORD="CitraMinio_2025!storage"
MINIO_VOLUMES=/home/workstation06/services/minio-data
MINIO_SERVER_URL=https://minio.citrasepatu.muhamadfikri.com
MINIO_BROWSER_REDIRECT_URL=https://minio.citrasepatu.muhamadfikri.com/console
```

### Cloudflare tunnel token

`/etc/default/cloudflared`

```
CLOUDFLARE_TUNNEL_TOKEN=...token from Zero Trust...
```

## Systemd services

| Unit | Purpose | Key paths |
| --- | --- | --- |
| `pos-api.service` | Runs Fastify API (`node dist/server.js`) | `/etc/systemd/system/pos-api.service` |
| `nginx.service` | Serves frontend static files on 127.0.0.1:3000 | `/etc/nginx/sites-available/pos-frontend` |
| `minio.service` | MinIO object storage (runs as root) | `/etc/systemd/system/minio.service` |
| `cloudflared.service` | Cloudflare Tunnel connector | `/etc/systemd/system/cloudflared.service` |
| `postgresql@16-main.service` | PostgreSQL cluster bound to `/home/workstation06/services/postgres-data` | Managed by apt |

Common commands:

```
sudo systemctl status pos-api
sudo journalctl -u pos-api -f
sudo systemctl restart pos-api
```

## Cloudflare Tunnel config

`/etc/cloudflared/config.yml`

```
tunnel: 7c8c1f6d-ca4c-4184-a36e-6611290c86b3
ingress:
  - hostname: citrasepatu.muhamadfikri.com
    service: http://127.0.0.1:3000
  - hostname: api.citrasepatu.muhamadfikri.com
    service: http://127.0.0.1:4000
  - hostname: minio.citrasepatu.muhamadfikri.com
    service: http://127.0.0.1:9001
  - service: http_status:404
```

Token rotations only require editing `/etc/default/cloudflared` and `sudo systemctl restart cloudflared`.

## Nginx frontend site

`/etc/nginx/sites-available/pos-frontend`

```
server {
    listen 127.0.0.1:3000;
    server_name citrasepatu.muhamadfikri.com;

    root /opt/pos-shoestore/frontend/dist;
    index index.html;

    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable with `sudo ln -sf /etc/nginx/sites-available/pos-frontend /etc/nginx/sites-enabled/pos-frontend` and reload nginx.

## Manual deployment workflow

1. **Build locally**
   ```bash
   pnpm --dir backend install --frozen-lockfile
   pnpm --dir backend build
   pnpm --dir frontend install --frozen-lockfile
   pnpm --dir frontend build
   ```
2. **Sync to server**
   ```bash
   rsync -az --delete backend/ workstation06@server:/opt/pos-shoestore/backend/
   rsync -az --delete frontend/dist/ workstation06@server:/opt/pos-shoestore/frontend/dist/
   ```
3. **Install deps + generate Prisma** (on server)
   ```bash
   cd /opt/pos-shoestore/backend
   pnpm install --prod --frozen-lockfile
   pnpm install --frozen-lockfile              # temporary for prisma CLI
   pnpm exec prisma generate
   pnpm prune --prod
   pnpm rebuild sharp --config.allow-builds=sharp
   ```
4. **Restart services**
   ```bash
   sudo systemctl restart pos-api
   sudo systemctl reload nginx
   ```

> Note: hitting `http://127.0.0.1:4000/healthz` from a normal user session can time out because of local policies; use `sudo curl` if needed.

## Verification checklist

```
sudo curl -s http://127.0.0.1:4000/healthz         # → {"status":"ok"}
sudo curl -s http://127.0.0.1:4000/readyz          # → {"status":"ready"}
sudo curl -I http://127.0.0.1:3000                 # → 200 OK
cloudflared status (journal)                      # tunnel registered
sudo ss -tulpn | grep 4000                        # backend listening
sudo ss -tulpn | grep 3000                        # nginx frontend
sudo ss -tulpn | grep 9000                        # MinIO API
```

## Maintenance notes

- **MinIO bucket:** `citrasepatu-uploads`. Manage via `mc` or the console (`https://minio.citrasepatu.muhamadfikri.com`).
- **Backups:** PostgreSQL cluster is under `/home/workstation06/services/postgres-data`; schedule dumps + MinIO sync (see `infra/scripts/nightly-backup.sh`).
- **Logs:**
  - API: `sudo journalctl -u pos-api -f`
  - nginx access/error: `/var/log/nginx/`
  - cloudflared: `sudo journalctl -u cloudflared -f`
  - minio: `sudo journalctl -u minio -f`
- **Ports:** Everything stays on loopback. No firewall changes are required while using Cloudflare Tunnel.
- **Rolling updates:** Stop API, deploy, start API. Nginx serves static files instantly after rsync + reload.

