import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedApiException } from "../common/errors/unauthorized-api.exception";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("@nestjs/jwt", () => ({
  JwtService: class JwtService {},
}));

jest.mock("argon2", () => ({
  hash: jest.fn((password: string) => Promise.resolve(`hash:${password}`)),
  verify: jest.fn((hash: string, password: string) =>
    Promise.resolve(hash === `hash:${password}`),
  ),
}));

const authUser = {
  id: "user-1",
  email: "a@b.com",
  firstName: "Alisher",
  lastName: "Test",
  isAdmin: false,
  tokenVersion: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("AuthService", () => {
  let service: AuthService;
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findAuthById: jest.fn(),
    createPasswordResetToken: jest.fn(),
    resetPasswordWithToken: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(async () => {
    jwtService.signAsync.mockImplementation(
      (_payload: unknown, options?: { secret?: string }) =>
        Promise.resolve(
          options?.secret === "refresh-secret"
            ? "refresh-token"
            : "access-token",
        ),
    );
    usersService.create.mockResolvedValue({
      id: authUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      isAdmin: authUser.isAdmin,
      createdAt: authUser.createdAt,
      updatedAt: authUser.updatedAt,
    });
    usersService.findAuthById.mockResolvedValue(authUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const values: Record<string, string> = {
                JWT_ACCESS_SECRET: "access-secret",
                JWT_ACCESS_EXPIRES_IN: "15m",
                JWT_REFRESH_SECRET: "refresh-secret",
                JWT_REFRESH_EXPIRES_IN: "7d",
              };
              return values[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    jwtService.signAsync.mockImplementation(
      (_payload: unknown, options?: { secret?: string }) =>
        Promise.resolve(
          options?.secret === "refresh-secret"
            ? "refresh-token"
            : "access-token",
        ),
    );
    usersService.findAuthById.mockResolvedValue(authUser);
  });

  it("signs up a user and returns a token pair", async () => {
    const result = await service.signUp({
      email: "a@b.com",
      password: "password1",
      firstName: "Alisher",
      lastName: "Test",
    });

    expect(usersService.create).toHaveBeenCalledWith({
      email: "a@b.com",
      passwordHash: "hash:password1",
      firstName: "Alisher",
      lastName: "Test",
    });
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user.email).toBe("a@b.com");
    expect(result.user).not.toHaveProperty("tokenVersion");
  });

  it("signs in a user and returns a token pair", async () => {
    usersService.findByEmail.mockResolvedValue({
      ...authUser,
      passwordHash: "hash:password1",
    });

    const result = await service.signIn({
      email: "a@b.com",
      password: "password1",
    });

    expect(usersService.findAuthById).toHaveBeenCalledWith("user-1");
    expect(result.accessToken).toBe("access-token");
    expect(result.user.email).toBe("a@b.com");
  });

  it("throws UnauthorizedException when the user does not exist", async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.signIn({ email: "missing@b.com", password: "password1" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when the password does not match", async () => {
    usersService.findByEmail.mockResolvedValue({
      ...authUser,
      passwordHash: "hash:other",
    });

    await expect(
      service.signIn({ email: "a@b.com", password: "password1" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("issues a new token pair from a valid refresh token", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-1",
      email: "a@b.com",
      tokenVersion: 0,
    });

    const result = await service.refresh({ refreshToken: "refresh-token" });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
  });

  it("throws UnauthorizedException when the refresh token is invalid", async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error("invalid token"));

    await expect(
      service.refresh({ refreshToken: "bad-token" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedApiException when token version does not match", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-1",
      email: "a@b.com",
      tokenVersion: 0,
    });
    usersService.findAuthById.mockResolvedValue({
      ...authUser,
      tokenVersion: 1,
    });

    await expect(
      service.refresh({ refreshToken: "refresh-token" }),
    ).rejects.toThrow(UnauthorizedApiException);
  });

  it("throws UnauthorizedException when the refresh token user no longer exists", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "missing",
      email: "a@b.com",
      tokenVersion: 0,
    });
    usersService.findAuthById.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: "refresh-token" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("creates a password reset token without exposing it", async () => {
    usersService.createPasswordResetToken.mockResolvedValue("reset-token");

    await expect(
      service.forgotPassword({ email: "a@b.com" }),
    ).resolves.toBeUndefined();
    expect(usersService.createPasswordResetToken).toHaveBeenCalledWith(
      "a@b.com",
    );
  });
});
