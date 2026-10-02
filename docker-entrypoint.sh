#!/bin/sh
set -e

# Run database migrations if not explicitly skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "==> Running database migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
  echo "==> Migrations completed successfully."
fi

exec "$@"
