---
name: prisma-workflow
description: >-
  Use this skill when modifying the database schema, generating the Prisma client,
  running database migrations, seeding test data, or launching Prisma Studio in this project.
---

# Prisma Workflow Skill

Use this workflow whenever modifying the database models, relations, or querying PostgreSQL via Prisma.

## Configuration & Paths

- Schema file: `prisma/schema.prisma`
- Prisma config: `prisma.config.ts`
- Generated client output: `src/generated/prisma` (**never edit manually**)
- Migrations folder: `prisma/migrations/`
- Seed script: `prisma/seed.ts` (run with `npm run db:seed`)

## Standard Procedures

### 1. Modifying the Schema

1. Open and edit `prisma/schema.prisma`.
2. Follow naming conventions:
   - Models: singular `PascalCase` (e.g. `User`, `Lesson`, `Course`).
   - Fields: `camelCase` (e.g. `createdAt`, `userId`).
   - Map differing DB column names using `@map("column_name")` or `@@map("table_name")`.
   - Always ensure mutable entities have `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`.
   - Add indexes `@@index([field])` on columns used in foreign keys, filters, or `orderBy`.

### 2. Creating and Applying Migrations

Run:

```bash
npm run prisma:migrate
```

- Prisma will prompt for a migration name. Choose a concise descriptive name (e.g. `add_user_status` or `create_lessons_table`).
- This command automatically updates the database and invokes `prisma generate`.

### 3. Regenerating Client Only

If you updated the schema and only need to refresh TypeScript definitions without a new migration (or after pulling branch changes):

```bash
npm run prisma:generate
```

### 4. Seeding Data

To populate the database with initial/test fixtures:

```bash
npm run db:seed
```

### 5. Inspecting DB Data (Prisma Studio)

To visually inspect records via web browser:

```bash
npm run prisma:studio
```

## Best Practices in Application Code

- Always inject `PrismaService` from `src/prisma/prisma.service.ts`.
- Catch Prisma exceptions and map them to NestJS HTTP exceptions:
  ```typescript
  import { Prisma } from "../generated/prisma/client";
  import { ConflictException } from "@nestjs/common";

  try {
    return await this.prisma.user.create({ data: dto });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "Record with this unique field already exists",
      );
    }
    throw error;
  }
  ```
- Wrap multi-table dependent operations in `this.prisma.$transaction([...])`.
- Avoid N+1 queries: use `include` or `select` relations instead of looping with individual queries.
