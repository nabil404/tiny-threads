#!/bin/sh
# Proves the schema can be built from nothing. The pretest hooks only ever
# migrate a database that already holds earlier migrations, which is why an
# out-of-order timestamp (R1) was invisible to every other check.
set -eu

PATH="${PATH:-}:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin"

DB="tt_fresh_$$"
BASE_URL="${DATABASE_URL_MIGRATIONS:-postgresql://app_owner:tiny_threads@localhost:5432/postgres}"
BASE="${BASE_URL%/*}"

cleanup() { psql "$BASE/postgres" -c "DROP DATABASE IF EXISTS \"$DB\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$BASE/postgres" -c "CREATE DATABASE \"$DB\" OWNER app_owner"
DATABASE_URL_MIGRATIONS="$BASE/$DB" \
  typeorm-ts-node-commonjs migration:run -d ./src/db/data-source.ts
DATABASE_URL="$BASE/$DB" pnpm db:verify-rls
echo "fresh-database migration + RLS verification OK"
