#!/bin/sh
set -e

echo "Waiting for MinIO at ${MINIO_HOST}..."
until mc alias set local "http://${MINIO_HOST}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" > /dev/null 2>&1; do
  sleep 1
done

echo "MinIO is ready. Ensuring bucket '${MINIO_BUCKET}' exists..."
mc mb --ignore-existing "local/${MINIO_BUCKET}"

echo "MinIO initialization completed successfully."
