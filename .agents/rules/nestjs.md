---
description: NestJS module, controller, service patterns
globs: "src/**/*.ts"
alwaysApply: false
---

# NestJS

Stack: NestJS 11, ConfigModule (global), Prisma via `PrismaModule`.

## Feature module structure

```text
src/users/
  dto/
    create-user.dto.ts
    update-user.dto.ts
  users.controller.ts
  users.service.ts
  users.module.ts
  users.service.spec.ts
```

Generate with `nest g resource users` when adding a full CRUD feature.

## Layer responsibilities

```typescript
// ❌ BAD — business logic and DB access in controller
@Controller("users")
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException();
    return this.prisma.user.create({ data: dto });
  }
}

// ✅ GOOD — thin controller, logic in service
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

## Dependency injection

```typescript
// ❌ BAD — manual instantiation, no DI
export class UsersService {
  private prisma = new PrismaService();
}

// ❌ BAD — import PrismaModule in every feature instead of once globally
// (PrismaModule is already imported in AppModule — export PrismaService from there
//  or import PrismaModule in each feature module that needs DB access)

// ✅ GOOD
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
}
```

Register providers in the feature module; export service only if other modules need it.

## DTOs and validation

When adding validation, use `class-validator` + `ValidationPipe` globally or per-route.

```typescript
// ❌ BAD — untyped body, manual parsing everywhere
@Post()
create(@Body() body: Record<string, string>) {
  if (!body.email?.includes("@")) throw new BadRequestException();
}

// ✅ GOOD
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
```

## HTTP status and exceptions

Use NestJS built-in exceptions; do not return `{ error: "..." }` with 200.

```typescript
// ❌ BAD
@Get(":id")
async findById(@Param("id") id: string) {
  const user = await this.usersService.findById(id);
  if (!user) return { error: "Not found" };
  return user;
}

// ✅ GOOD — service throws, controller stays thin
@Get(":id")
findById(@Param("id") id: string) {
  return this.usersService.findById(id);
}

// in service:
async findById(id: string) {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundException(`User ${id} not found`);
  return user;
}
```

| Case                 | Exception               |
| -------------------- | ----------------------- |
| Invalid input        | `BadRequestException`   |
| Not found            | `NotFoundException`     |
| Duplicate / conflict | `ConflictException`     |
| Auth missing         | `UnauthorizedException` |
| Forbidden            | `ForbiddenException`    |

## Config and env

- Read env via `ConfigService` or validated bootstrap — not scattered `process.env` in services
- Required vars must fail fast at startup (see `PrismaService` constructor pattern)

```typescript
// ❌ BAD — silent undefined in every method
const port = process.env.PORT;

// ✅ GOOD in main.ts (already used)
await app.listen(process.env.PORT ?? 8080);

// ✅ GOOD in services when ConfigModule is wired
constructor(private readonly config: ConfigService) {
  const apiKey = this.config.getOrThrow<string>("API_KEY");
}
```

## Module wiring

```typescript
// ✅ GOOD
@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // only if other modules need UsersService
})
export class UsersModule {}
```

Import feature modules in `AppModule`; keep `AppModule` as composition root only.
