---
description: Naming conventions for NestJS backend
alwaysApply: true
---

# Naming

## Files and folders

- Files and folders: `kebab-case`
- NestJS suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.guard.ts`, `*.filter.ts`, `*.interceptor.ts`, `*.pipe.ts`
- DTOs: `create-user.dto.ts`, `update-user.dto.ts`
- Tests: `*.spec.ts` (unit), `*.e2e-spec.ts` (e2e)

```text
// ❌ BAD
src/UserController.ts
src/user_service.ts
src/dtos/CreateUserDTO.ts

// ✅ GOOD
src/users/users.controller.ts
src/users/users.service.ts
src/users/dto/create-user.dto.ts
```

## Classes, types, variables

- Classes / enums / types: `PascalCase` (`UsersService`, `CreateUserDto`)
- Methods / variables / params: `camelCase` (`findById`, `userId`)
- Booleans: `is` / `has` / `can` / `should` prefix (`isActive`, `hasAccess`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_PAGE_SIZE`)
- Private fields: optional `_` prefix only if already used in the module; prefer plain `camelCase`
- Avoid abbreviations unless domain-standard (`DTO`, `ID`, `URL`)

```typescript
// ❌ BAD
class users_service {}
const Active = true;
const max_pg = 20;

// ✅ GOOD
class UsersService {}
const isActive = true;
const MAX_PAGE_SIZE = 20;
```

## NestJS-specific

- Module: `UsersModule`, file `users.module.ts`
- Controller route prefix: plural kebab-case (`@Controller("users")`)
- Service methods: verb-first (`create`, `findAll`, `findById`, `update`, `remove`)
- DTO classes: action + entity + `Dto` (`CreateUserDto`, `UpdateUserDto`)

```typescript
// ❌ BAD
@Controller("user")
class UserCtrl {
  @Get("getUser/:id")
  getUserById(id: string) {}
}

// ✅ GOOD
@Controller("users")
export class UsersController {
  @Get(":id")
  findById(@Param("id") id: string) {}
}
```

## Prisma schema

- Models: `PascalCase` singular (`User`, `OrderItem`)
- Fields: `camelCase` (`createdAt`, `userId`)
- Enums: `PascalCase` name, `SCREAMING_SNAKE_CASE` values if enum represents fixed states

```prisma
// ❌ BAD
model users {
  user_name String
}

// ✅ GOOD
model User {
  userName String @map("user_name")
  createdAt DateTime @default(now())
}
```

## Module public API

- Prefer direct imports from the feature folder (`./users/users.service`)
- Add `index.ts` barrel only when the module already uses one — do not introduce barrels drive-by
