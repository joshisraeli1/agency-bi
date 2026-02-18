#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL Backup Script for Agency BI
#
# Usage:
#   ./scripts/backup-postgres.sh [DATABASE_URL]
#
# If no DATABASE_URL argument is provided, reads from .env.local
#
# Cron scheduling (daily at 2 AM):
#   0 2 * * * cd /path/to/agency-bi && ./scripts/backup-postgres.sh >> backups/cron.log 2>&1
#
# Retention: keeps last 30 backups, deletes older ones

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
RETENTION_COUNT=30

# Get DATABASE_URL from argument, environment, or .env.local
DB_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ] && [ -f "$PROJECT_DIR/.env.local" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DB_URL" ]; then
  echo "ERROR: No DATABASE_URL provided."
  echo "Usage: $0 [DATABASE_URL]"
  echo "Or set DATABASE_URL in .env.local"
  exit 1
fi

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "ERROR: DATABASE_URL is not a PostgreSQL connection string."
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/agency_bi_${TIMESTAMP}.sql.gz"

echo "==> Backing up Agency BI database..."
echo "    Timestamp: $TIMESTAMP"
echo "    Output: $BACKUP_FILE"

# Run pg_dump and compress
pg_dump "$DB_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"

# Get file size
BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "    Size: $BACKUP_SIZE"
echo "    Backup complete."

# Cleanup old backups (keep last N)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/agency_bi_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt "$RETENTION_COUNT" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - RETENTION_COUNT))
  echo "==> Cleaning up old backups (removing $DELETE_COUNT)..."
  ls -1t "$BACKUP_DIR"/agency_bi_*.sql.gz | tail -n "$DELETE_COUNT" | xargs rm -f
  echo "    Done. $RETENTION_COUNT backups retained."
fi

echo "==> Backup finished: $BACKUP_FILE"
