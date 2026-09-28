---
description: Prisma schema, migrations, and database access
globs: "{prisma/**,src/**/prisma/**,src/**/*.service.ts}"
alwaysApply: false
---

# Prisma

- Client output: `src/generated/prisma` — **never edit generated files**
- Regenerate: `npm run prisma:generate` (runs on `postinstall`)
- Migrations: `npm run prisma:migrate`
- DB local: `npm run db:up` (docker compose)

## Schema

```prisma
// ❌ BAD — plural model, no updatedAt on mutable entity
model users {
  id Int @id
}

// ✅ GOOD
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- One migration per logical change; name migrations descriptively
- Add indexes for fields used in `where`, `orderBy`, and foreign keys
- Use `@map` / `@@map` when DB column/table names differ from Prisma field names

## Access via PrismaService

Inject `PrismaService` — do not create standalone `PrismaClient` instances.

```typescript
// ❌ BAD
import { PrismaClient } from "../generated/prisma/client";
const prisma = new PrismaClient();

// ✅ GOOD
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany();
  }
}
```

## Queries

```typescript
// ❌ BAD — fetch all then filter in JS
async findActive() {
  const users = await this.prisma.user.findMany();
  return users.filter((u) => u.isActive);
}

// ✅ GOOD — filter in DB
async findActive() {
  return this.prisma.user.findMany({ where: { isActive: true } });
}

// ❌ BAD — N+1 queries
async findOrdersWithItems() {
  const orders = await this.prisma.order.findMany();
  for (const order of orders) {
    order.items = await this.prisma.orderItem.findMany({ where: { orderId: order.id } });
  }
  return orders;
}

// ✅ GOOD
async findOrdersWithItems() {
  return this.prisma.order.findMany({ include: { items: true } });
}
```

## Transactions

Use `$transaction` when multiple writes must succeed or fail together.

```typescript
// ❌ BAD — partial failure leaves inconsistent state
async transfer(fromId: string, toId: string, amount: number) {
  await this.prisma.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
  await this.prisma.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
}

// ✅ GOOD
async transfer(fromId: string, toId: string, amount: number) {
  await this.prisma.$transaction([
    this.prisma.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } }),
    this.prisma.account.update({ where: { id: toId }, data: { balance: { increment: amount } } }),
  ]);
}
```

## Errors

```typescript
// ❌ BAD — leak raw Prisma error to client
async create(dto: CreateUserDto) {
  return this.prisma.user.create({ data: dto });
}

// ✅ GOOD — map known errors
import { Prisma } from "../generated/prisma/client";

async create(dto: CreateUserDto) {
  try {
    return await this.prisma.user.create({ data: dto });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("Email already exists");
    }
    throw error;
  }
}
```

## Select and expose

Do not return password hashes or internal fields to API consumers.

```typescript
// ❌ BAD
return this.prisma.user.findUnique({ where: { id } });

// ✅ GOOD
return this.prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true, createdAt: true },
});
```
