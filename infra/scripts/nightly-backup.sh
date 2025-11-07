#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/pos-shoestore/backup.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Backup env file not found: $ENV_FILE" >&2
  exit 1
fi

# shellcheck source=/etc/pos-shoestore/backup.env
source "$ENV_FILE"

: "${PGDATABASE:?PGDATABASE must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGHOST:?PGHOST must be set}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE must be set (e.g. offsite:shoestore-backups)}"
: "${RCLONE_MINIO_REMOTE:?RCLONE_MINIO_REMOTE must be set (e.g. minio:shoestore)}"

BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/pos-shoestore}
RETENTION_DAYS=${RETENTION_DAYS:-14}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

mkdir -p "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/minio"

export PGHOST PGUSER PGPORT PGPASSWORD PGDATABASE
PGDUMP_PATH="$BACKUP_ROOT/postgres/${PGDATABASE}-${TIMESTAMP}.sql"

# Dump PostgreSQL database (custom format compressed by gzip)
pg_dump --format=custom --file="$PGDUMP_PATH" --no-owner --no-privileges

gzip "$PGDUMP_PATH"
PGDUMP_ARCHIVE="${PGDUMP_PATH}.gz"

# Sync MinIO bucket(s) to local staging directory via rclone S3 gateway
MINIO_STAGE="$BACKUP_ROOT/minio/${TIMESTAMP}"
mkdir -p "$MINIO_STAGE"

rclone sync "$RCLONE_MINIO_REMOTE" "$MINIO_STAGE" --s3-no-check-bucket --fast-list --links

tar -C "$MINIO_STAGE" -czf "$BACKUP_ROOT/minio/minio-${TIMESTAMP}.tar.gz" .
rm -rf "$MINIO_STAGE"

# Copy artifacts to offsite remote
rclone copy "$PGDUMP_ARCHIVE" "$RCLONE_REMOTE/postgres/" --s3-no-check-bucket
rclone copy "$BACKUP_ROOT/minio/minio-${TIMESTAMP}.tar.gz" "$RCLONE_REMOTE/minio/" --s3-no-check-bucket

# Rotate local backups
find "$BACKUP_ROOT/postgres" -type f -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_ROOT/minio" -type f -mtime +"$RETENTION_DAYS" -delete

printf 'Backup complete: %s\n' "$TIMESTAMP"
