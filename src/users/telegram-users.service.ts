import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { Prisma } from "../generated/prisma/client";
import {
  mergeCourseEnrollments,
  mergeCourseFavorites,
  mergeLessonProgress,
} from "../common/enrollment/ensure-enrollment";
import { recalculateAllEnrollmentsForUser } from "../common/progress/course-progress";
import { PrismaService } from "../prisma/prisma.service";
import { USER_PUBLIC_SELECT, type PublicUser } from "./users.service";

export const TELEGRAM_USER_ERROR = {
  EMAIL_LINKED_TO_OTHER_TELEGRAM: "EMAIL_LINKED_TO_OTHER_TELEGRAM",
  CREATE_FAILED: "CREATE_FAILED",
} as const;

@Injectable()
export class TelegramUsersService {
  private readonly logger = new Logger(TelegramUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findByTelegramId(telegramId: string) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      select: USER_PUBLIC_SELECT,
    });
  }

  async upsertFromTelegram(input: {
    telegramId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<PublicUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    let mergedUserId: string | null = null;

    const user = await this.prisma.$transaction(async (tx) => {
      const existingByTelegram = await tx.user.findUnique({
        where: { telegramId: input.telegramId },
      });
      const existingByEmail = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (
        existingByTelegram &&
        existingByEmail &&
        existingByTelegram.id === existingByEmail.id
      ) {
        return tx.user.update({
          where: { id: existingByTelegram.id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
          },
          select: USER_PUBLIC_SELECT,
        });
      }

      if (
        existingByTelegram &&
        existingByEmail &&
        existingByTelegram.id !== existingByEmail.id
      ) {
        if (
          existingByEmail.telegramId &&
          existingByEmail.telegramId !== input.telegramId
        ) {
          throw new ConflictException(
            TELEGRAM_USER_ERROR.EMAIL_LINKED_TO_OTHER_TELEGRAM,
          );
        }

        await this.reassignUserRelations(
          tx,
          existingByTelegram.id,
          existingByEmail.id,
        );

        await tx.user.update({
          where: { id: existingByTelegram.id },
          data: { telegramId: null },
        });

        const linked = await tx.user.update({
          where: { id: existingByEmail.id },
          data: {
            telegramId: input.telegramId,
            firstName: input.firstName,
            lastName: input.lastName,
          },
          select: USER_PUBLIC_SELECT,
        });

        await tx.user.delete({ where: { id: existingByTelegram.id } });

        mergedUserId = existingByEmail.id;

        this.logger.log({
          event: "TELEGRAM_USER_MERGED",
          stubUserId: existingByTelegram.id,
          targetUserId: existingByEmail.id,
          telegramId: input.telegramId,
        });

        return linked;
      }

      if (existingByTelegram) {
        return tx.user.update({
          where: { id: existingByTelegram.id },
          data: {
            email: normalizedEmail,
            firstName: input.firstName,
            lastName: input.lastName,
          },
          select: USER_PUBLIC_SELECT,
        });
      }

      if (existingByEmail) {
        if (
          existingByEmail.telegramId &&
          existingByEmail.telegramId !== input.telegramId
        ) {
          throw new ConflictException(
            TELEGRAM_USER_ERROR.EMAIL_LINKED_TO_OTHER_TELEGRAM,
          );
        }

        return tx.user.update({
          where: { id: existingByEmail.id },
          data: {
            telegramId: input.telegramId,
            firstName: input.firstName,
            lastName: input.lastName,
          },
          select: USER_PUBLIC_SELECT,
        });
      }

      const passwordHash = await argon2.hash(randomBytes(32).toString("hex"));

      try {
        return await tx.user.create({
          data: {
            email: normalizedEmail,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
            telegramId: input.telegramId,
          },
          select: USER_PUBLIC_SELECT,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException(TELEGRAM_USER_ERROR.CREATE_FAILED);
        }
        throw error;
      }
    });

    if (mergedUserId) {
      await recalculateAllEnrollmentsForUser(this.prisma, mergedUserId);
    }

    return user;
  }

  private async reassignUserRelations(
    tx: Prisma.TransactionClient,
    fromUserId: string,
    toUserId: string,
  ) {
    await tx.order.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.userSubscription.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.telegramSession.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.testAttempt.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.learningEvent.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.uploadIntent.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    });
    await mergeCourseEnrollments(tx, fromUserId, toUserId);
    await mergeLessonProgress(tx, fromUserId, toUserId);
    await mergeCourseFavorites(tx, fromUserId, toUserId);
  }

  async ensureTelegramLinked(userId: string, telegramId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.telegramId && user.telegramId !== telegramId) {
      throw new BadRequestException(
        "Заказ принадлежит другому Telegram-аккаунту",
      );
    }

    if (!user.telegramId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { telegramId },
      });
    }
  }
}
