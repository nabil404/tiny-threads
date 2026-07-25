#!/bin/sh
# Generates a TypeORM migration under src/db/migrations/.
# Usage: pnpm db:generate MigrationName [-- extra typeorm flags, e.g. --dr]
set -e

name="${1:?Usage: pnpm db:generate MigrationName}"
shift

typeorm-ts-node-commonjs migration:generate \
  "./src/db/migrations/$name" \
  -d ./src/db/data-source.ts \
  "$@"
