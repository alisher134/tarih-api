import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
  const guard = new AdminGuard();

  function createContext(user?: { isAdmin: boolean }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  it("allows access for admin users", () => {
    expect(guard.canActivate(createContext({ isAdmin: true }))).toBe(true);
  });

  it("throws ForbiddenException for non-admin users", () => {
    expect(() => guard.canActivate(createContext({ isAdmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when user is missing", () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      ForbiddenException,
    );
  });
});
