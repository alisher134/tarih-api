import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { TelegramUpdateService } from "./telegram-update.service";
import type { TelegramUpdate } from "./telegram.types";

@Controller("telegram")
@SkipThrottle()
export class TelegramWebhookController {
  private readonly webhookSecret: string;

  constructor(
    private readonly updateService: TelegramUpdateService,
    config: ConfigService,
  ) {
    this.webhookSecret = config.get<string>("TELEGRAM_WEBHOOK_SECRET") ?? "";
  }

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Headers("x-telegram-bot-api-secret-token") secretToken: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    if (!this.webhookSecret) {
      throw new UnauthorizedException(
        "Telegram webhook secret is not configured",
      );
    }

    if (secretToken !== this.webhookSecret) {
      throw new UnauthorizedException("Invalid Telegram webhook secret");
    }

    await this.updateService.handleUpdate(update);
    return { ok: true };
  }
}
