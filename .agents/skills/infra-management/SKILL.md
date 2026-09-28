---
name: infra-management
description: >-
  Use this skill when managing local infrastructure containers (PostgreSQL, MinIO S3 storage, minio-init bucket setup),
  inspecting container logs, starting or stopping services via Docker Compose.
---

# Infrastructure Management Skill

Use this workflow to start, stop, monitor, and debug local Docker services required by the `tarih-api` backend.

## Services Overview

All services are defined in `docker-compose.yml`:

- **`postgres`** (`tarih-postgres`): PostgreSQL 16 (default port `5432`)
- **`minio`** (`tarih-minio`): S3-compatible object storage (API on `9000`, Console on `9001`)
- **`minio-init`** (`tarih-minio-init`): One-shot initialization container running `docker/minio/init.sh` to configure default bucket (`tarih-storage`) and CORS rules.

## Commands

### 1. Start Infrastructure

```bash
# Start all services (postgres + minio + minio-init)
npm run infra:up

# Or start postgres only
npm run db:up

# Or start minio storage only
npm run storage:up
```

### 2. Stop Infrastructure

```bash
# Stop all containers
npm run db:down

# Stop and wipe volume data (CAUTION: wipes database)
docker compose down -v
```

### 3. Check Service Logs & Status

```bash
# Check running container statuses
docker compose ps

# Follow PostgreSQL logs
npm run db:logs

# Follow MinIO logs
npm run storage:logs

# Check minio-init execution status
docker compose logs minio-init
```

## Troubleshooting & Verification

1. **Postgres Connection Refused**:
   - Check if container is healthy: `docker compose ps`
   - Verify environment variable `DATABASE_URL` in `.env`:
     `DATABASE_URL="postgresql://tarih:tarih@localhost:5432/tarih?schema=public"`
   - If port `5432` is occupied by another local Postgres instance, update `POSTGRES_PORT` in `.env` and `DATABASE_URL`.

2. **MinIO Bucket / S3 Upload Errors**:
   - Ensure `minio-init` ran successfully:
     `docker compose logs minio-init`
   - Test MinIO console in browser: `http://localhost:9001` (user: `minioadmin`, pass: `minioadmin`).
   - Check bucket existence and policy configured in `docker/minio/init.sh`.
