import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedApiException } from "../../common/errors/unauthorized-api.exception";
import { UsersService } from "../../users/users.service";
import { JwtStrategy } from "./jwt.strategy";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("@nestjs/passport", () => ({
  PassportStrategy: () =>
    class MockPassportStrategy {
      constructor() {}
    },
}));

jest.mock("passport-jwt", () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(),
  },
  Strategy: class Strategy {},
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

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  const usersService = {
    findAuthById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === "JWT_ACCESS_SECRET") {
                return "access-secret";
              }
              throw new Error(`Unexpected config key: ${key}`);
            },
          },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    jest.clearAllMocks();
  });

  it("returns the public user when the token subject exists", async () => {
    usersService.findAuthById.mockResolvedValue(authUser);

    await expect(
      strategy.validate({ sub: "user-1", email: "a@b.com", tokenVersion: 0 }),
    ).resolves.toEqual({
      id: "user-1",
      email: "a@b.com",
      firstName: "Alisher",
      lastName: "Test",
      isAdmin: false,
      createdAt: authUser.createdAt,
      updatedAt: authUser.updatedAt,
    });
    expect(usersService.findAuthById).toHaveBeenCalledWith("user-1");
  });

  it("throws UnauthorizedException when the user does not exist", async () => {
    usersService.findAuthById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: "missing", email: "a@b.com", tokenVersion: 0 }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when token version does not match", async () => {
    usersService.findAuthById.mockResolvedValue({
      ...authUser,
      tokenVersion: 2,
    });

    await expect(
      strategy.validate({ sub: "user-1", email: "a@b.com", tokenVersion: 0 }),
    ).rejects.toThrow(UnauthorizedApiException);
  });
});
