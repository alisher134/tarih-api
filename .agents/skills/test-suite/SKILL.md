---
name: test-suite
description: >-
  Use this skill when running unit tests, writing service specs with mocked Prisma dependencies,
  implementing e2e endpoint tests, checking test coverage, or fixing broken tests in this repository.
---

# Test Suite Skill

Use this workflow to write, execute, and debug unit and end-to-end tests for `tarih-api`.

## Test Commands

```bash
# Run all unit tests
npm test

# Run tests in watch mode during active development
npm run test:watch

# Run tests with code coverage report
npm run test:cov

# Run specific test file
npx jest src/users/users.service.spec.ts

# Run end-to-end tests (requires active database)
npm run test:e2e
```

## Unit Testing Conventions

1. **File Location**: Next to the file being tested (e.g. `src/users/users.service.spec.ts`).
2. **Mocking Prisma**: Never connect to a real database in unit tests. Mock `PrismaService` methods:
   ```typescript
   import { Test, TestingModule } from "@nestjs/testing";
   import { UsersService } from "./users.service";
   import { PrismaService } from "../prisma/prisma.service";

   describe("UsersService", () => {
     let service: UsersService;
     const mockPrisma = {
       user: {
         findUnique: jest.fn(),
         create: jest.fn(),
       },
     };

     beforeEach(async () => {
       const module: TestingModule = await Test.createTestingModule({
         providers: [
           UsersService,
           { provide: PrismaService, useValue: mockPrisma },
         ],
       }).compile();

       service = module.get<UsersService>(UsersService);
       jest.clearAllMocks();
     });

     it("should return user by id", async () => {
       mockPrisma.user.findUnique.mockResolvedValue({
         id: "1",
         email: "test@example.com",
       });
       const result = await service.findById("1");
       expect(result).toEqual({ id: "1", email: "test@example.com" });
       expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
         where: { id: "1" },
       });
     });
   });
   ```
3. **Test Behavior**: Verify returned values and thrown exceptions (`rejects.toThrow(NotFoundException)`), not just whether internal functions were called.

## End-to-End (E2E) Testing Conventions

1. **Location**: Inside `test/` directory with `*.e2e-spec.ts` suffix.
2. **Lifecycle Cleanup**: Always close the application instance in `afterAll` or `afterEach` to prevent open handle leaks:
   ```typescript
   afterAll(async () => {
     await app.close();
   });
   ```
3. **Supertest**: Use `request(app.getHttpServer())` to assert status codes, headers, and payload structures.
