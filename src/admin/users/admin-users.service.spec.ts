import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { USER_PUBLIC_SELECT } from "../../users/users.service";
import { AdminUsersService } from "./admin-users.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("argon2", () => ({
  hash: jest.fn((password: string) => Promise.resolve(`hash:${password}`)),
}));

const publicUser = {
  id: "1",
  email: "a@b.com",
  firstName: "Alisher",
  lastName: "Test",
  isAdmin: false,
  tokenVersion: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const adminUser = {
  ...publicUser,
  id: "admin-1",
  email: "admin@b.com",
  isAdmin: true,
};

describe("AdminUsersService", () => {
  let service: AdminUsersService;
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AdminUsersService);
    jest.clearAllMocks();
  });

  it("returns paginated users", async () => {
    prisma.user.findMany.mockResolvedValue([publicUser]);
    prisma.user.count.mockResolvedValue(1);

    await expect(service.findAll({ page: 1, limit: 20 })).resolves.toEqual({
      data: [publicUser],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {},
      select: USER_PUBLIC_SELECT,
      skip: 0,
      take: 20,
      orderBy: { createdAt: "desc" },
    });
  });

  it("throws NotFoundException when user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById("missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("creates a user with admin flag", async () => {
    prisma.user.create.mockResolvedValue(adminUser);

    await expect(
      service.create({
        email: "admin@b.com",
        password: "password1",
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
      }),
    ).resolves.toEqual(adminUser);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "admin@b.com",
        passwordHash: "hash:password1",
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
      },
      select: USER_PUBLIC_SELECT,
    });
  });

  it("throws ConflictException when email already exists", async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      service.create({
        email: "a@b.com",
        password: "password1",
        firstName: "Alisher",
        lastName: "Test",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("updates a user", async () => {
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.user.update.mockResolvedValue({
      ...publicUser,
      firstName: "Updated",
    });

    await expect(
      service.update("1", { firstName: "Updated" }, "admin-1"),
    ).resolves.toMatchObject({ firstName: "Updated" });
  });

  it("throws BadRequestException when demoting the last admin", async () => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.update("admin-1", { isAdmin: false }, "admin-2"),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when admin removes own admin role", async () => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.update("admin-1", { isAdmin: false }, "admin-1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when deleting own account", async () => {
    await expect(service.remove("admin-1", "admin-1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException when deleting the last admin", async () => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    prisma.user.count.mockResolvedValue(0);

    await expect(service.remove("admin-1", "admin-2")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("deletes a non-admin user", async () => {
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.user.delete.mockResolvedValue(publicUser);

    await expect(service.remove("1", "admin-1")).resolves.toBeUndefined();
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "1" } });
  });

  it("resets a user password", async () => {
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.user.update.mockResolvedValue(publicUser);

    await expect(
      service.resetPassword("1", { newPassword: "newpass12" }),
    ).resolves.toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: {
        passwordHash: "hash:newpass12",
        tokenVersion: { increment: 1 },
      },
    });
  });
});
