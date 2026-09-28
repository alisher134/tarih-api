---
description: TypeScript standards for this repo (strict is off)
globs: "**/*.ts"
alwaysApply: false
---

# TypeScript

`tsconfig.json` has `strict: false` — `tsc` will **not** catch `null`/`undefined` on optional fields. Guard yourself. Do not turn `strict` on as a drive-by change.

## Formatting (prettier.config.mjs)

- Double quotes, semicolons, `printWidth: 80`, `trailingComma: "all"`, 2-space indent
- Run `npm run format` or let ESLint fix on save — do not fight the formatter

```typescript
// ❌ BAD
import { Injectable } from "@nestjs/common";
const x = { a: 1, b: 2 };

// ✅ GOOD
import { Injectable } from "@nestjs/common";
const x = { a: 1, b: 2 };
```

## Null and optional fields

```typescript
type Price = { amount: number } | null;

// ❌ BAD — crashes at runtime when price is null
function formatPrice(price: Price): string {
  return String(price.amount);
}

// ✅ GOOD
function formatPrice(price: Price): string {
  if (price == null) return "";
  return String(price.amount);
}

// ❌ BAD — optional DTO field used blindly
async create(dto: CreateUserDto) {
  return this.prisma.user.create({ data: { email: dto.email.toLowerCase() } });
}

// ✅ GOOD
async create(dto: CreateUserDto) {
  if (!dto.email) throw new BadRequestException("email is required");
  return this.prisma.user.create({ data: { email: dto.email.toLowerCase() } });
}
```

## any vs unknown

```typescript
// ❌ BAD — new any
function parseBody(body: any) {
  return body.id;
}

// ✅ GOOD
function parseBody(body: unknown): string {
  if (typeof body !== "object" || body == null || !("id" in body)) {
    throw new BadRequestException("Invalid body");
  }
  const id = (body as { id: unknown }).id;
  if (typeof id !== "string") throw new BadRequestException("Invalid id");
  return id;
}
```

Do not add new `any`. Existing `any` on boundaries is tolerated; do not globally rewrite it.

## type vs interface

- Prefer `type` for data shapes and unions
- Use `interface` when you need `extends` or declaration merging

```typescript
// ✅ GOOD
type CreateUserDto = {
  email: string;
  name?: string;
};

type UserRole = "admin" | "user";
```

## Where types live

- Domain types live in the feature module (`users/dto/`, `users/types.ts`), not scattered in controllers
- Do not duplicate Prisma model shapes — import from `generated/prisma` or map explicitly

```typescript
// ❌ BAD — duplicate shape diverging from DB
type User = { id: string; mail: string };

// ✅ GOOD
import { User } from "../generated/prisma/client";
// or a dedicated response DTO when API shape differs from DB
```

## Suppressions

```typescript
// ❌ BAD
// @ts-ignore
const x = maybeNull.value;

// ✅ GOOD — narrow, or comment why suppression is unavoidable
if (maybeNull == null) throw new Error("expected value");
const x = maybeNull.value;
```

## Async

- Never leave floating promises in NestJS lifecycle hooks or handlers
- ESLint warns on `@typescript-eslint/no-floating-promises` — fix or await explicitly

```typescript
// ❌ BAD
onModuleInit() {
  this.$connect();
}

// ✅ GOOD
async onModuleInit() {
  await this.$connect();
}
```
