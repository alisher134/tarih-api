---
description: Unit and e2e testing conventions
globs: "{**/*.spec.ts,test/**}"
alwaysApply: false
---

# Testing

Scripts: `npm test` (unit), `npm run test:e2e`, `npm run test:cov`.

## Unit tests — mock dependencies

Test services in isolation; mock `PrismaService` or repositories.

```typescript
// ❌ BAD — hits real DB in unit test
describe("UsersService", () => {
  it("creates user", async () => {
    const service = new UsersService(new PrismaService());
    await service.create({ email: "a@b.com" });
  });
});

// ✅ GOOD
describe("UsersService", () => {
  let service: UsersService;
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it("creates user", async () => {
    prisma.user.create.mockResolvedValue({ id: "1", email: "a@b.com" });
    await expect(service.create({ email: "a@b.com" })).resolves.toMatchObject({
      email: "a@b.com",
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "a@b.com" },
    });
  });
});
```

## Test behavior, not implementation

```typescript
// ❌ BAD — asserts internal call order without checking outcome
expect(prisma.user.findUnique).toHaveBeenCalledBefore(prisma.user.create);

// ✅ GOOD — asserts thrown exception and message
await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
```

## E2E tests

- Live in `test/*.e2e-spec.ts`
- Spin up full `AppModule` (or test module with real wiring)
- Use `supertest` against `app.getHttpServer()`
- Always `await app.close()` in `afterEach` / `afterAll`

```typescript
// ❌ BAD — no teardown, leaking handles
it("GET /users", () => {
  return request(app.getHttpServer()).get("/users").expect(200);
});

// ✅ GOOD
afterEach(async () => {
  await app.close();
});

it("GET /users", () => {
  return request(app.getHttpServer()).get("/users").expect(200);
});
```

## When to add tests

- Add unit tests when implementing non-trivial service logic (branching, error mapping, transactions)
- Add e2e tests for new HTTP endpoints
- Do not add tests that only assert mocks were called with no behavior check
- Do not add tests unless requested **or** they cover meaningful behavior you just implemented

## Test naming

```typescript
// ❌ BAD
it("works", () => {});
it("test create", () => {});

// ✅ GOOD
it("throws NotFoundException when user does not exist", () => {});
it("returns 201 and created user on POST /users", () => {});
```
