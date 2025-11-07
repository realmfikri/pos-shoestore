# Infrastructure & Operations Guide

This document covers the production deployment of the POS Shoestore stack on a Biznet VPS. It assumes an Ubuntu 22.04+ server with root access the first time, and focuses on hardening (firewall + least privilege), reverse proxying with Nginx + Let's Encrypt, background services, CI/CD, backups, and monitoring.

---

## 1. Server baseline

1. **Create an operator user** and disable direct root SSH once sudo is confirmed:
   ```bash
   adduser deploy
   usermod -aG sudo deploy
   mkdir -p /home/deploy/.ssh
   cp /root/.ssh/authorized_keys /home/deploy/.ssh/
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   ```
2. **Harden SSH** (`/etc/ssh/sshd_config`):
   ```conf
   PermitRootLogin no
   PasswordAuthentication no
   AllowUsers deploy
   ```
   Reload with `sudo systemctl reload sshd`.
3. **Install core packages**:
   ```bash
   sudo apt update
   sudo apt install -y build-essential curl git ufw unzip wget jq acl logrotate python3-certbot-nginx nginx
   ```
4. **Install Node.js (runtime + pnpm)** for backend/SSR frontend:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo corepack enable
   sudo corepack prepare pnpm@10 --activate
   ```
5. **Install PostgreSQL 16** and create database role with least privilege:
   ```bash
   sudo apt install -y postgresql-16 postgresql-client-16
   sudo -u postgres psql <<'SQL'
   CREATE ROLE pos_owner LOGIN PASSWORD 'REPLACE_ME_STRONG';
   CREATE DATABASE pos_shoestore OWNER pos_owner;
   \c pos_shoestore
   GRANT CONNECT ON DATABASE pos_shoestore TO pos_owner;
   SQL
   ```
   Restrict to localhost by ensuring `listen_addresses = '127.0.0.1'` in `/etc/postgresql/16/main/postgresql.conf` and keep `pg_hba.conf` to `local`/`host 127.0.0.1/32` only.
6. **Install MinIO (server mode)**:
   ```bash
   wget https://dl.min.io/server/minio/release/linux-amd64/minio
   sudo install minio /usr/local/bin/minio
   sudo useradd --system --create-home --shell /usr/sbin/nologin minio
   sudo mkdir -p /var/lib/minio/data /etc/minio
   sudo chown -R minio:minio /var/lib/minio /etc/minio
   sudo install -m 600 /dev/null /etc/minio/minio.env
   sudo bash -c 'cat <<EOF >/etc/minio/minio.env
   MINIO_ROOT_USER=REPLACE_ME_SUPER
   MINIO_ROOT_PASSWORD=REPLACE_ME_SUPER_SECRET
   MINIO_VOLUMES="/var/lib/minio/data"
   MINIO_OPTS="--console-address :9001"
   EOF'
   ```

---

## 2. Firewall & network security

Enable UFW and expose only required ports:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
MinIO should not be publicly reachable. Bind service to `127.0.0.1` or a private interface (`--address 127.0.0.1:9000 --console-address 127.0.0.1:9001`) and only expose through the Nginx reverse proxy with access control.

Use Linux ACLs to restrict directories:
```bash
sudo mkdir -p /opt/pos-shoestore
sudo chown deploy:deploy /opt/pos-shoestore
sudo setfacl -m u:pos-api:rwx /opt/pos-shoestore/backend
sudo setfacl -m u:pos-frontend:rwx /opt/pos-shoestore/frontend
```
Create dedicated system users (`useradd --system --home /opt/pos-shoestore/backend --shell /usr/sbin/nologin pos-api`, etc.) and reference them in the systemd unit files.

---

## 3. Reverse proxy (Nginx)

Sample site configs live in [`infra/nginx`](./nginx). Copy each file into `/etc/nginx/sites-available/` and symlink to `sites-enabled/`.

* `api.muhamadfikri.com.conf`: proxies Fastify backend running on `127.0.0.1:4000`.
* `app.muhamadfikri.com.conf`: serves the frontend (static assets or SSR upstream on `127.0.0.1:4173`).
* `minio.muhamadfikri.com.conf`: internal-only MinIO console/API, gated with HTTP basic auth and IP allow-list.

After placing the files, run `sudo nginx -t` and `sudo systemctl reload nginx`.

### Let's Encrypt

Use Certbot with the Nginx plugin once DNS is pointed to the VPS IP:
```bash
sudo certbot --nginx -d api.muhamadfikri.com -d app.muhamadfikri.com -d minio.muhamadfikri.com --email ops@muhamadfikri.com --agree-tos --redirect
```
This injects TLS blocks into each server config. For the private MinIO hostname you may prefer the `--preferred-challenges dns` option if the site is not publicly reachable.

Renewals run automatically via `certbot.timer`. To test: `sudo certbot renew --dry-run`.

---

## 4. Systemd services

Unit files are under [`infra/systemd`](./systemd). Copy them to `/etc/systemd/system/`, adjust `EnvironmentFile` paths, and reload the daemon (`sudo systemctl daemon-reload`).

* [`pos-api.service`](./systemd/pos-api.service) – runs the Fastify API on port 4000 under the `pos-api` user.
* [`pos-frontend.service`](./systemd/pos-frontend.service) – runs the frontend (SSR server or static file server command) under `pos-frontend`.
* [`minio.service`](./systemd/minio.service) – runs MinIO bound to localhost with private credentials in `/etc/minio/minio.env`.

Enable services to start at boot:
```bash
sudo systemctl enable pos-api.service pos-frontend.service minio.service
```

### Restart procedures

```bash
sudo systemctl restart pos-api.service
sudo systemctl status pos-api.service

sudo systemctl restart pos-frontend.service
sudo systemctl status pos-frontend.service

sudo systemctl restart minio.service
sudo systemctl status minio.service
```
If configuration files changed (e.g., environment variables), reload the daemon first: `sudo systemctl daemon-reload`.

---

## 5. Deployment layout & environment

Recommended filesystem layout:
```
/opt/pos-shoestore/
  backend/
  frontend/
  shared/
```

Populate `.env.production` files for backend (database DSN, JWT secret, MinIO credentials). Limit read access:
```bash
sudo install -m 640 -o pos-api -g pos-api /opt/pos-shoestore/backend/.env.production
sudo setfacl -m u:deploy:r /opt/pos-shoestore/backend/.env.production
```

Frontend builds (`frontend/dist`) are synchronized to `/var/www/app.muhamadfikri.com` if you choose pure static hosting; for SSR keep the compiled output in `/opt/pos-shoestore/frontend` and proxy via systemd service.

---

## 6. CI/CD (GitHub Actions)

Workflow file: [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).

* **Quality gate:** Lints and tests backend & frontend on every push/PR.
* **Build:** Produces production bundles after the quality gate passes.
* **Deploy:** On `main`, uses SSH + `rsync` to upload the repository to the VPS, installs dependencies, runs Prisma migrations, rebuilds the frontend (optional), and restarts the systemd services.

### Required secrets

| Secret | Purpose |
| --- | --- |
| `SSH_HOST` | VPS hostname/IP |
| `SSH_PORT` | SSH port (default `22`) |
| `SSH_USER` | Deployer user (e.g., `deploy`) |
| `SSH_PRIVATE_KEY` | Private key with access to the VPS |
| `DEPLOY_PATH` | `/opt/pos-shoestore` |
| `ENVIRONMENT` | Optional – e.g., `production` |
| `MINIO_BUCKET` | Optional – bucket to create during deployment |

Ensure the deploy user can `sudo systemctl restart pos-api.service pos-frontend.service` without a password (edit `/etc/sudoers.d/pos-shoestore`).

---

## 7. Backups & offsite sync

Scripts live in [`infra/scripts`](./scripts).

### PostgreSQL dump + MinIO sync (`nightly-backup.sh`)

* Exports a compressed `pg_dump` of `pos_shoestore`.
* Syncs MinIO buckets to remote storage via `rclone` (e.g., Backblaze B2, Google Drive).
* Uses environment file `/etc/pos-shoestore/backup.env` for credentials.

Install rclone:
```bash
curl https://rclone.org/install.sh | sudo bash
rclone config # create remote named "offsite"
```

Place env vars:
```bash
sudo install -m 600 -o root -g root /dev/null /etc/pos-shoestore/backup.env
sudo nano /etc/pos-shoestore/backup.env
# Add lines:
# PGHOST=127.0.0.1
# PGUSER=pos_owner
# PGPASSWORD=...
# PGDATABASE=pos_shoestore
# MINIO_ALIAS=posminio
# MINIO_URL=http://127.0.0.1:9000
# MINIO_ACCESS_KEY=...
# MINIO_SECRET_KEY=...
# RCLONE_REMOTE=offsite:shoestore-backups
```

Make script executable and schedule via cron:
```bash
sudo install -m 750 -o root -g root infra/scripts/nightly-backup.sh /usr/local/sbin/pos-nightly-backup
sudo crontab -e
0 2 * * * /usr/local/sbin/pos-nightly-backup >>/var/log/pos-nightly-backup.log 2>&1
```

Use `logrotate` (`/etc/logrotate.d/pos-nightly-backup`) to keep logs trimmed.

### rclone MinIO alias

Create `/root/.mc/config.json` or `~/.mc/config.json` with limited-access credentials for app buckets only. Avoid using the root access key in scripts; instead create a dedicated MinIO user with policy limited to the bucket.

---

## 8. Monitoring & health checks

* **Uptime Kuma:** Deploy using Docker or install on another VPS. Add monitors:
  * `https://api.muhamadfikri.com/healthz` (Fastify liveness)
  * `https://api.muhamadfikri.com/readyz` (readiness)
  * `https://app.muhamadfikri.com/` (frontend reachability)
* Configure alerts to Telegram/WhatsApp/email as preferred.

Additionally, expose a lightweight node exporter (`prometheus-node-exporter`) or enable VPS provider monitoring for CPU, memory, disk.

---

## 9. Disaster recovery checklist

1. Restore latest `pg_dump` into fresh PostgreSQL instance: `psql -f pos_shoestore-YYYYmmdd.sql.gz`.
2. Restore MinIO bucket from rclone remote: `rclone sync offsite:shoestore-backups/minio/ /var/lib/minio/data/`.
3. Redeploy application from GitHub main using CI or manual `rsync`.
4. Rotate credentials if compromise suspected.

---

## 10. Manual deploy fallback

If CI/CD is unavailable, deploy manually from your workstation:
```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend build
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
rsync -az --delete --exclude="node_modules" ./ deploy@api.muhamadfikri.com:/opt/pos-shoestore
ssh deploy@api.muhamadfikri.com "cd /opt/pos-shoestore && pnpm --dir backend install --frozen-lockfile --prod && pnpm --dir frontend install --frozen-lockfile && pnpm --dir frontend build && sudo systemctl restart pos-api.service pos-frontend.service"
```

Keep secrets in `/etc/pos-shoestore/env/` with `600` permissions and load them via `EnvironmentFile` in the systemd units.
