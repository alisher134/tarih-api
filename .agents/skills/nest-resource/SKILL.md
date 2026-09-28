---
name: nest-resource
description: >-
  Use this skill when scaffolding or implementing new NestJS feature modules, controllers,
  services, DTOs, or API endpoints in this repository according to architectural standards.
---

# NestJS Feature Resource Skill

Use this workflow whenever creating or refactoring a NestJS feature module (e.g. `courses`, `lessons`, `users`, `payments`).

## Standard Feature Directory Layout

Every feature in `src/` should adhere to:

```text
src/<feature>/
├── dto/
│   ├── create-<feature>.dto.ts
│   └── update-<feature>.dto.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.module.ts
└── <feature>.service.spec.ts
```

## Step-by-Step Implementation Procedure

### 1. Scaffold or Create the Module

To generate standard files via Nest CLI:

```bash
npx nest g resource <feature> --no-spec
```

Or manually create files following the project structure above.

### 2. Implement DTOs with Validation

Use `class-validator` and `class-transformer`:

```typescript
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

### 3. Implement the Service Layer

- Inject `PrismaService` from `src/prisma/prisma.service`.
- Keep all business logic and database queries here.
- Throw built-in NestJS exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`).
- Use early returns to keep control flow flat.

### 4. Implement the Controller Layer

- Keep controllers thin: validate/parse parameters and delegate directly to the service.
- Use plural kebab-case route prefix: `@Controller("items")`.
- Decorate endpoints with Swagger annotations (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) if enabled.

### 5. Wire into AppModule

- Register `<Feature>Module` in `src/app.module.ts`.
- Only export `<Feature>Service` in `<Feature>Module` if other feature modules need to inject it.

## Quality Checklist

- [ ] All file names are in `kebab-case` with correct suffixes (`.controller.ts`, `.service.ts`, `.module.ts`).
- [ ] Controller methods are thin (no direct Prisma calls in controllers).
- [ ] DTO inputs have validation decorators.
- [ ] No `any` types added; proper response types or interfaces used.
- [ ] Unit test `<feature>.service.spec.ts` covers the primary happy path and error cases.
- [ ] Run `npm run lint` and `npm test` to verify.
