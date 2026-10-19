#!/bin/sh
# Backend container entrypoint: migrate → seed (optional) → serve.
set -e

echo "[entrypoint] applying database migrations (owner role)…"
npx prisma migrate deploy

if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  echo "[entrypoint] seeding demo data (idempotent)…"
  node dist/scripts/seed.js || echo "[entrypoint] seed skipped (non-fatal)"
fi

echo "[entrypoint] starting API on port ${PORT:-4000}…"
exec node dist/main.js
