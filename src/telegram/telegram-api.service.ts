import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import type {
  TelegramInlineKeyboardMarkup,
  TelegramReplyKeyboardMarkup,
} from "./telegram.types";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    const token = config.get<string>("TELEGRAM_BOT_TOKEN");
    this.enabled = Boolean(token);
    this.baseUrl = token
      ? `https://api.telegram.org/bot${token}`
      : "https://api.telegram.org/botdisabled";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.post("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    replyMarkup?:
      | TelegramInlineKeyboardMarkup
      | TelegramReplyKeyboardMarkup
      | { remove_keyboard: true },
  ): Promise<void> {
    await this.post("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    });
  }

  async sendPhoto(
    chatId: string | number,
    photo: string,
    caption?: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
  ): Promise<void> {
    await this.post("sendPhoto", {
      chat_id: chatId,
      photo,
      caption,
      reply_markup: replyMarkup,
    });
  }

  async sendDocument(
    chatId: string | number,
    document: string,
    caption?: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
  ): Promise<void> {
    await this.post("sendDocument", {
      chat_id: chatId,
      document,
      caption,
      reply_markup: replyMarkup,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
  ): Promise<void> {
    await this.post("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    const response = await this.post<TelegramFile>("getFile", {
      file_id: fileId,
    });
    return response.result as TelegramFile;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const token = this.baseUrl.split("/bot")[1];
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const response = await firstValueFrom(
      this.http.get<ArrayBuffer>(url, { responseType: "arraybuffer" }),
    );
    return Buffer.from(response.data);
  }

  private async post<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<TelegramApiResponse<T>> {
    if (!this.enabled) {
      this.logger.warn(`Telegram API disabled, skipped ${method}`);
      return { ok: false, description: "Telegram bot disabled" };
    }

    try {
      const response = await firstValueFrom(
        this.http.post<TelegramApiResponse<T>>(
          `${this.baseUrl}/${method}`,
          body,
        ),
      );

      if (!response.data.ok) {
        this.logger.error({
          event: "TELEGRAM_API_ERROR",
          method,
          description: response.data.description,
        });
        throw new Error(
          response.data.description ?? `Telegram ${method} failed`,
        );
      }

      return response.data;
    } catch (error) {
      const description = this.extractErrorDescription(error);
      this.logger.error({
        event: "TELEGRAM_API_ERROR",
        method,
        description,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }

  private extractErrorDescription(error: unknown): string | undefined {
    if (
      typeof error === "object" &&
      error != null &&
      "response" in error &&
      typeof error.response === "object" &&
      error.response != null &&
      "data" in error.response &&
      typeof error.response.data === "object" &&
      error.response.data != null &&
      "description" in error.response.data &&
      typeof error.response.data.description === "string"
    ) {
      return error.response.data.description;
    }

    return undefined;
  }
}
