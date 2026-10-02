#!/bin/sh
set -e

# Run database migrations if not explicitly skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "==> Running database migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
  echo "==> Migrations completed successfully."
fi

# Run database seed (in production, only seeds admin user)
if [ "$SKIP_SEED" != "true" ]; then
  echo "==> Running database seed..."
  npx prisma db seed
  echo "==> Seed completed successfully."
fi

exec "$@"
