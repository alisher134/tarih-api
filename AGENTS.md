# AI Agent Guidelines — tarih-api

Backend API service for Tarih platform built with NestJS 11, Prisma 7, PostgreSQL, and MinIO.

## Project Structure & Stack

- **Framework**: NestJS 11 + Express + TypeScript (`strict: false` in `tsconfig.json`)
- **Database / ORM**: PostgreSQL 16 + Prisma 7 (`prisma/schema.prisma`, generated client in `src/generated/prisma`)
- **Object Storage**: MinIO S3 (`minio` client)
- **Validation**: `class-validator`, `class-transformer`
- **Testing**: Jest (`*.spec.ts` unit tests, `test/**/*.e2e-spec.ts` e2e tests)
- **Formatting & Linting**: Prettier (`prettier.config.mjs`) + ESLint 9 (`eslint.config.mjs`) + Commitlint

---

## Detailed Rules Directory (`.agents/rules/`)

The agent must consult and follow the modular rules in `.agents/rules/`:

1. [general.md](file:///.agents/rules/general.md) — Core coding standards (KISS, DRY, early returns, no placeholders or TODOs, scope discipline).
2. [nestjs.md](file:///.agents/rules/nestjs.md) — Feature module structure, thin controllers, logic in services, dependency injection, DTOs, HTTP exceptions.
3. [prisma.md](file:///.agents/rules/prisma.md) — Schema conventions, never edit `src/generated/prisma`, avoid N+1 queries, transactions, error mapping.
4. [typescript.md](file:///.agents/rules/typescript.md) — Null-checks, no `any`, types vs interfaces, async/await handling.
5. [naming.md](file:///.agents/rules/naming.md) — `kebab-case` files, `PascalCase` classes/types, `camelCase` methods/vars, plural controller routes.
6. [testing.md](file:///.agents/rules/testing.md) — Mocking `PrismaService`, testing behavior not internals, e2e teardown.
7. [git.md](file:///.agents/rules/git.md) — Conventional commits (`type(scope): subject`), no AI co-author trailers, PR guidelines.

---

## Quick Command Reference

```bash
# Infrastructure
npm run infra:up          # Start postgres and minio services
npm run db:up             # Start postgres only
npm run storage:up        # Start minio only
npm run db:logs           # Follow postgres logs

# Database & Prisma
npm run prisma:generate   # Regenerate Prisma Client into src/generated/prisma
npm run prisma:migrate    # Create & apply migration (prisma migrate dev)
npm run prisma:studio     # Open Prisma Studio web UI
npm run db:seed           # Run database seeds

# Development
npm run start:dev         # Start NestJS in watch mode
npm run build             # Build production bundle
npm run lint              # Check lint rules
npm run lint:fix          # Auto-fix lint rules
npm run format            # Run Prettier on codebase

# Testing
npm test                  # Run unit tests
npm run test:watch        # Run unit tests in watch mode
npm run test:cov          # Check test coverage
npm run test:e2e          # Run e2e tests
```

---

## Agent Behavior Mandates

- **Stay Focused**: Never refactor unrelated files, reformat unchanged code, or add unrequested dependencies.
- **Never Edit Generated Code**: Do NOT manually touch files in `src/generated/prisma/**`. Edit `prisma/schema.prisma` and run `npm run prisma:generate`.
- **Run Verification**: After introducing or changing logic, verify with `npm run lint` and `npm test`.
