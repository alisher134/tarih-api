---
description: Core coding standards — always apply
alwaysApply: true
---

# General

## Principles

- Prefer readability over clever code
- Avoid overengineering; keep solutions simple (KISS)
- Do not duplicate logic — extract only when a second consumer exists (DRY)
- Use early returns to keep control flow flat
- Keep each file focused on one responsibility
- Match neighboring code: same NestJS patterns, same error style, same import style
- Delivered code must not contain TODOs, placeholders, or incomplete implementations
- Ask clarifying questions only when requirements are ambiguous
- Do not expand scope (no extra refactors, docs, or comments unless asked)

## Scope — stay on task

```typescript
// ❌ BAD — user asked to fix one endpoint, agent refactors unrelated modules
async findById(id: string) {
  // also renamed all DTOs, added caching layer, updated README
}

// ✅ GOOD — minimal change that solves the request
async findById(id: string) {
  const item = await this.prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundException(`Item ${id} not found`);
  return item;
}
```

## Early returns — flat control flow

```typescript
// ❌ BAD — nested conditions
async update(id: string, dto: UpdateDto) {
  const item = await this.repo.find(id);
  if (item) {
    if (item.isActive) {
      if (dto.name) {
        return this.repo.save(item);
      }
    }
  }
  throw new BadRequestException();
}

// ✅ GOOD
async update(id: string, dto: UpdateDto) {
  const item = await this.repo.find(id);
  if (!item) throw new NotFoundException();
  if (!item.isActive) throw new BadRequestException("Item is inactive");
  if (!dto.name) throw new BadRequestException("name is required");

  return this.repo.save({ ...item, ...dto });
}
```

## DRY — extract only when reused

```typescript
// ❌ BAD — premature abstraction for one caller
function buildWhereClause(filters: Filters) { /* 40 lines */ }
async findAll(filters: Filters) {
  return this.prisma.user.findMany({ where: buildWhereClause(filters) });
}

// ✅ GOOD — inline while there is a single consumer
async findAll(filters: Filters) {
  return this.prisma.user.findMany({
    where: {
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.isActive != null ? { isActive: filters.isActive } : {}),
    },
  });
}

// ✅ GOOD — extract when second module needs the same logic
// shared/user-query.ts used by UsersService and ReportsService
```

## No placeholders in delivered code

```typescript
// ❌ BAD
async sendEmail() {
  // TODO: implement email provider
  return true;
}

// ✅ GOOD — implement, or throw if truly out of scope and tell the user
async sendEmail(to: string, body: string) {
  await this.mailer.send({ to, body });
}
```

## Match existing project style

```typescript
// ❌ BAD — different quote/import style than the rest of src/
import { Module } from "@nestjs/common";
import { UserService } from "./user.service";

// ✅ GOOD — follow prettier.config.mjs and neighboring files
import { Module } from "@nestjs/common";
import { UserService } from "./user.service";
```

## Agent behavior

- Run lint/tests when you change behavior; fix issues you introduce
- Do not commit unless explicitly asked
- Do not edit `src/generated/**` — regenerate via Prisma
- Do not commit secrets (`.env`, credentials)
- Prefer editing existing files over creating new ones unless structure demands it
