#!/bin/sh
# Runs pending migrations, then verifies the RLS invariant (every tenant-scoped
# table ENABLEd + FORCEd + policy). If verification fails, reverts exactly the
# migrations this run just applied, so a broken RLS setup never stays committed.
set -e

data_source="./src/db/data-source.ts"

pending=$(NO_COLOR=1 typeorm-ts-node-commonjs migration:show -d "$data_source" | grep -c '^\[ \] ' || true)

typeorm-ts-node-commonjs migration:run -d "$data_source"

if pnpm db:verify-rls; then
  exit 0
fi

echo "RLS verification failed — reverting $pending newly applied migration(s)." >&2
i=0
while [ "$i" -lt "$pending" ]; do
  typeorm-ts-node-commonjs migration:revert -d "$data_source"
  i=$((i + 1))
done

exit 1
