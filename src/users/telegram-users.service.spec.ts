import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import {
  TELEGRAM_USER_ERROR,
  TelegramUsersService,
} from "./telegram-users.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

describe("TelegramUsersService", () => {
  let service: TelegramUsersService;

  const tx = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    order: { updateMany: jest.fn() },
    userSubscription: { updateMany: jest.fn() },
    telegramSession: { updateMany: jest.fn() },
    testAttempt: { updateMany: jest.fn() },
    learningEvent: { updateMany: jest.fn() },
    uploadIntent: { updateMany: jest.fn() },
    passwordResetToken: { updateMany: jest.fn() },
    courseEnrollment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userLessonProgress: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    courseFavorite: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    user: tx.user,
    courseEnrollment: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    lesson: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userLessonProgress: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    testAttempt: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramUsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TelegramUsersService);
  });

  it("merges telegram stub into existing email account", async () => {
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: "stub-user",
        telegramId: "tg-1",
        email: "old@example.com",
      })
      .mockResolvedValueOnce({
        id: "web-user",
        telegramId: null,
        email: "web@example.com",
      });

    tx.user.update
      .mockResolvedValueOnce({ id: "stub-user", telegramId: null })
      .mockResolvedValueOnce({
        id: "web-user",
        email: "web@example.com",
        firstName: "Ali",
        lastName: "Test",
        telegramId: "tg-1",
      });

    tx.user.delete.mockResolvedValue({ id: "stub-user" });
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    tx.userSubscription.updateMany.mockResolvedValue({ count: 0 });
    tx.telegramSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertFromTelegram({
      telegramId: "tg-1",
      email: "web@example.com",
      firstName: "Ali",
      lastName: "Test",
    });

    expect(result.id).toBe("web-user");
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { userId: "stub-user" },
      data: { userId: "web-user" },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "stub-user" } });
  });

  it("throws when email belongs to another telegram account", async () => {
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: "stub-user",
        telegramId: "tg-1",
        email: "old@example.com",
      })
      .mockResolvedValueOnce({
        id: "web-user",
        telegramId: "tg-2",
        email: "web@example.com",
      });

    await expect(
      service.upsertFromTelegram({
        telegramId: "tg-1",
        email: "web@example.com",
        firstName: "Ali",
        lastName: "Test",
      }),
    ).rejects.toThrow(
      new ConflictException(TELEGRAM_USER_ERROR.EMAIL_LINKED_TO_OTHER_TELEGRAM),
    );
  });
});
