#!/usr/bin/env bash
# Setup local PostgreSQL for PPC development.
# Usage: ./scripts/setup-local-db.sh
# Requires: Docker (or Postgres running locally with ppcdb created)

set -e
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ppcdb?sslmode=disable}"

echo "Setting up PPC database at $DB_URL"

# Extract connection params for psql (no query string)
PSQL_URL="${DB_URL%%\?*}"

echo "Applying base schema (DB 2.17.26.sql)..."
psql "$PSQL_URL" -f "DB 2.17.26.sql" -v ON_ERROR_STOP=1

echo "Applying pending migrations..."
psql "$PSQL_URL" -f migrations/apply-all-pending.sql -v ON_ERROR_STOP=1

echo "Done. Run: cp .env.local.example .env.local && npm run dev"
