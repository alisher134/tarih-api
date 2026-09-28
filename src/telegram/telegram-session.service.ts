import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TelegramSessionState } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TelegramSessionData } from "./telegram.types";

@Injectable()
export class TelegramSessionService {
  private readonly sessionTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.sessionTtlHours = Number(
      config.get<string>("TELEGRAM_SESSION_TTL_HOURS") ?? "24",
    );
  }

  async getSession(telegramId: string) {
    return this.prisma.telegramSession.findUnique({
      where: { telegramId },
    });
  }

  async upsertSession(input: {
    telegramId: string;
    userId?: string | null;
    state: TelegramSessionState;
    data?: TelegramSessionData;
  }) {
    const expiresAt = new Date(
      Date.now() + this.sessionTtlHours * 60 * 60 * 1000,
    );

    return this.prisma.telegramSession.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        userId: input.userId ?? null,
        state: input.state,
        data: input.data ?? {},
        expiresAt,
      },
      update: {
        userId: input.userId ?? undefined,
        state: input.state,
        data: input.data ?? {},
        expiresAt,
      },
    });
  }

  async updateSession(
    telegramId: string,
    input: {
      userId?: string | null;
      state?: TelegramSessionState;
      data?: TelegramSessionData;
    },
  ) {
    const existing = await this.getSession(telegramId);
    const currentData = (existing?.data ?? {}) as TelegramSessionData;

    return this.upsertSession({
      telegramId,
      userId: input.userId ?? existing?.userId,
      state: input.state ?? existing?.state ?? TelegramSessionState.START,
      data: {
        ...currentData,
        ...input.data,
      },
    });
  }

  getSessionData(session: { data: unknown }): TelegramSessionData {
    if (!session.data || typeof session.data !== "object") {
      return {};
    }

    return session.data;
  }

  async resetToStart(telegramId: string) {
    const existing = await this.getSession(telegramId);
    const currentData = this.getSessionData(existing ?? { data: {} });

    return this.upsertSession({
      telegramId,
      state: TelegramSessionState.START,
      data: { language: currentData.language },
    });
  }
}
