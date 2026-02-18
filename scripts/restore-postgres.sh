#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL Restore Script for Agency BI
#
# Usage:
#   ./scripts/restore-postgres.sh <backup-file> [DATABASE_URL]
#
# If no DATABASE_URL argument is provided, reads from .env.local
#
# Supports both .sql.gz (compressed) and .sql (uncompressed) formats

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "ERROR: No backup file specified."
  echo "Usage: $0 <backup-file> [DATABASE_URL]"
  echo ""
  echo "Available backups:"
  ls -lht "$PROJECT_DIR/backups"/agency_bi_*.sql.gz 2>/dev/null || echo "  No backups found in backups/"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Get DATABASE_URL from argument, environment, or .env.local
DB_URL="${2:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ] && [ -f "$PROJECT_DIR/.env.local" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DB_URL" ]; then
  echo "ERROR: No DATABASE_URL provided."
  echo "Usage: $0 <backup-file> [DATABASE_URL]"
  exit 1
fi

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "ERROR: DATABASE_URL is not a PostgreSQL connection string."
  exit 1
fi

echo "==> Agency BI Database Restore"
echo "    Backup: $BACKUP_FILE"
echo "    Database: ${DB_URL%%@*}@***"
echo ""
echo "WARNING: This will overwrite all data in the target database."
read -p "Are you sure you want to continue? (y/N): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "==> Restoring database..."

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql "$DB_URL" --quiet
else
  psql "$DB_URL" --quiet < "$BACKUP_FILE"
fi

echo "==> Restore complete."
