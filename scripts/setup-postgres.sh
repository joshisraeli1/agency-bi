#!/usr/bin/env bash
set -euo pipefail

# Setup script for PostgreSQL production deployment
# Usage: ./scripts/setup-postgres.sh
#
# Requires:
#   - DATABASE_URL environment variable set to a PostgreSQL connection string
#     e.g. postgresql://user:password@host:5432/agency_bi
#   - Or set in .env.local file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env.local if it exists
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | grep DATABASE_URL | xargs)
fi

# Check DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo ""
  echo "Set it in .env.local or export it:"
  echo "  export DATABASE_URL=\"postgresql://user:password@host:5432/agency_bi\""
  exit 1
fi

if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
  echo "ERROR: DATABASE_URL does not look like a PostgreSQL connection string."
  echo "  Got: $DATABASE_URL"
  echo "  Expected: postgresql://user:password@host:5432/agency_bi"
  exit 1
fi

echo "==> PostgreSQL Setup for Agency BI"
echo "    Database: ${DATABASE_URL%%@*}@***"
echo ""

# Step 1: Copy PostgreSQL schema
echo "==> Copying PostgreSQL schema..."
cp prisma/schema.postgresql.prisma prisma/schema.prisma
echo "    Done."

# Step 2: Generate Prisma client
echo "==> Generating Prisma client..."
npx prisma generate
echo "    Done."

# Step 3: Run migrations
echo "==> Running database migrations..."
npx prisma migrate deploy
echo "    Done."

echo ""
echo "==> PostgreSQL setup complete!"
echo "    Your app is now configured to use PostgreSQL."
echo "    Run 'npm run build && npm start' to start in production mode."
