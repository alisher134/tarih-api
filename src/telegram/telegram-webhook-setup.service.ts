import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TelegramApiService } from "./telegram-api.service";

@Injectable()
export class TelegramWebhookSetupService implements OnModuleInit {
  private readonly logger = new Logger(TelegramWebhookSetupService.name);

  constructor(
    private readonly telegramApi: TelegramApiService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const webhookUrl = this.config.get<string>("TELEGRAM_WEBHOOK_URL");
    const webhookSecret = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET");

    if (!this.telegramApi.isEnabled() || !webhookUrl || !webhookSecret) {
      this.logger.warn(
        "Telegram webhook is not configured; skipping registration",
      );
      return;
    }

    try {
      await this.telegramApi.setWebhook(webhookUrl, webhookSecret);
      this.logger.log("Telegram webhook registered");
    } catch (error) {
      this.logger.error("Failed to register Telegram webhook", error);
    }
  }
}
