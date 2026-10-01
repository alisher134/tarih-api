import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TelegramSessionState } from "../generated/prisma/client";
import { formatPriceKzt } from "../common/orders/order-number.utils";
import { OrdersService } from "../orders/orders.service";
import { PaymentsService } from "../payments/payments.service";
import { StorageService } from "../storage/storage.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { TelegramUsersService } from "../users/telegram-users.service";
import { TelegramApiService } from "./telegram-api.service";
import {
  type BotLanguage,
  getMenuAction,
  resolveLanguage,
} from "./telegram.i18n";
import {
  getBotMessages,
  getOrderReceiptErrorMessage,
  getRejectReason,
  getTelegramUserErrorMessage,
  managerMessages,
  type RejectReasonCode,
} from "./telegram.messages";
import { TelegramSessionService } from "./telegram-session.service";
import {
  TELEGRAM_CALLBACK,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramSessionData,
  type TelegramUpdate,
} from "./telegram.types";
import {
  inferReceiptExtension,
  isValidEmail,
  parseFullName,
  parsePlanSlugFromStart,
} from "./telegram.validation";

@Injectable()
export class TelegramUpdateService implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdateService.name);
  private readonly managerChatId: string;
  private readonly paymentCardNumber: string;
  private readonly paymentCardOwner: string;

  constructor(
    private readonly telegramApi: TelegramApiService,
    private readonly sessionService: TelegramSessionService,
    private readonly telegramUsersService: TelegramUsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly storageService: StorageService,
    config: ConfigService,
  ) {
    this.managerChatId = config.get<string>("TELEGRAM_MANAGER_CHAT_ID") ?? "";
    this.paymentCardNumber =
      config.get<string>("TELEGRAM_PAYMENT_CARD_NUMBER") ?? "";
    this.paymentCardOwner =
      config.get<string>("TELEGRAM_PAYMENT_CARD_OWNER") ?? "";
  }

  onModuleInit() {
    if (!this.telegramApi.isEnabled()) {
      this.logger.warn("Telegram bot token is not configured");
    }
  }

  async handleUpdate(update: TelegramUpdate | undefined): Promise<void> {
    if (!update) {
      return;
    }

    try {
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
        return;
      }

      if (update.message) {
        await this.handleMessage(update.message);
      }
    } catch (error) {
      this.logger.error({
        event: "TELEGRAM_UPDATE_ERROR",
        updateId: update.update_id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  private getLanguage(data: TelegramSessionData): BotLanguage {
    return resolveLanguage(data.language);
  }

  private async getLanguageForTelegramId(
    telegramId: string,
  ): Promise<BotLanguage> {
    const session = await this.sessionService.getSession(telegramId);
    return this.getLanguage(
      this.sessionService.getSessionData(session ?? { data: {} }),
    );
  }

  private async handleMessage(message: TelegramMessage) {
    const telegramId = String(message.from?.id ?? message.chat.id);
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (text?.startsWith("/start")) {
      const startPayload = text.split(/\s+/)[1]?.trim();
      const session = await this.sessionService.getSession(telegramId);
      const data = this.sessionService.getSessionData(session ?? { data: {} });

      if (!data.language) {
        await this.sessionService.updateSession(telegramId, {
          state: TelegramSessionState.START,
          data: { startPayload },
        });
        await this.sendLanguageSelection(chatId);
        return;
      }

      await this.sessionService.resetToStart(telegramId);

      if (
        await this.handleStartPayload(telegramId, chatId, startPayload, data)
      ) {
        return;
      }

      await this.sendMainMenu(chatId, this.getLanguage(data));
      return;
    }

    const session = await this.sessionService.getSession(telegramId);
    const state = session?.state ?? TelegramSessionState.START;
    const data = this.sessionService.getSessionData(session ?? { data: {} });
    const lang = this.getLanguage(data);

    if (!data.language) {
      await this.sendLanguageSelection(chatId);
      return;
    }

    if (message.photo?.length || message.document) {
      await this.handleReceiptMessage(telegramId, chatId, message, state, data);
      return;
    }

    if (!text) {
      return;
    }

    switch (state) {
      case TelegramSessionState.WAITING_EMAIL:
        await this.handleEmailInput(telegramId, chatId, text, lang);
        return;
      case TelegramSessionState.WAITING_NAME:
        await this.handleNameInput(telegramId, chatId, text, lang);
        return;
      default: {
        const action = getMenuAction(text);
        if (action === "buy") {
          await this.startPurchaseFlow(telegramId, chatId, lang);
          return;
        }
        if (action === "subs") {
          await this.sendMySubscriptions(telegramId, chatId, lang);
          return;
        }
        if (action === "orders") {
          await this.sendMyOrders(telegramId, chatId, lang);
          return;
        }
        if (action === "help") {
          await this.sendHelp(chatId, lang);
          return;
        }
        if (action === "language") {
          await this.sendLanguageSelection(chatId);
          return;
        }
        await this.sendMainMenu(chatId, lang);
      }
    }
  }

  private async handleCallbackQuery(callback: TelegramCallbackQuery) {
    const telegramId = String(callback.from.id);
    const chatId = callback.message?.chat.id;
    const data = callback.data ?? "";

    if (!chatId) {
      await this.telegramApi.answerCallbackQuery(callback.id);
      return;
    }

    if (data.startsWith("mgr:")) {
      await this.handleManagerCallback(callback, data);
      return;
    }

    if (
      data === TELEGRAM_CALLBACK.langRu ||
      data === TELEGRAM_CALLBACK.langKk
    ) {
      const language: BotLanguage =
        data === TELEGRAM_CALLBACK.langKk ? "kk" : "ru";
      const session = await this.sessionService.getSession(telegramId);
      const sessionData = this.sessionService.getSessionData(
        session ?? { data: {} },
      );
      const startPayload = sessionData.startPayload;

      await this.telegramApi.answerCallbackQuery(callback.id);
      await this.sessionService.updateSession(telegramId, {
        state: TelegramSessionState.START,
        data: { language },
      });
      const messages = getBotMessages(language);
      await this.telegramApi.sendMessage(chatId, messages.languageChanged);

      if (
        await this.handleStartPayload(
          telegramId,
          chatId,
          startPayload,
          sessionData,
          language,
        )
      ) {
        return;
      }

      await this.sendMainMenu(chatId, language);
      return;
    }

    const session = await this.sessionService.getSession(telegramId);
    const sessionData = this.sessionService.getSessionData(
      session ?? { data: {} },
    );
    const lang = this.getLanguage(sessionData);
    const messages = getBotMessages(lang);

    await this.telegramApi.answerCallbackQuery(callback.id);

    if (data === TELEGRAM_CALLBACK.menuBuy) {
      await this.startPurchaseFlow(telegramId, chatId, lang);
      return;
    }

    if (data === TELEGRAM_CALLBACK.menuSubs) {
      await this.sendMySubscriptions(telegramId, chatId, lang);
      return;
    }

    if (data === TELEGRAM_CALLBACK.menuOrders) {
      await this.sendMyOrders(telegramId, chatId, lang);
      return;
    }

    if (data === TELEGRAM_CALLBACK.menuHelp) {
      await this.sendHelp(chatId, lang);
      return;
    }

    if (data.startsWith("plan:")) {
      const planId = data.slice("plan:".length);
      await this.handlePlanSelection(telegramId, chatId, planId, lang);
      return;
    }

    if (data === TELEGRAM_CALLBACK.confirmYes) {
      await this.handleConfirmData(telegramId, chatId, lang);
      return;
    }

    if (data === TELEGRAM_CALLBACK.confirmEdit) {
      await this.telegramApi.sendMessage(chatId, messages.whatToEdit, {
        inline_keyboard: [
          [
            {
              text: messages.editEmail,
              callback_data: TELEGRAM_CALLBACK.confirmEditEmail,
            },
          ],
          [
            {
              text: messages.editName,
              callback_data: TELEGRAM_CALLBACK.confirmEditName,
            },
          ],
          [
            {
              text: messages.editPlan,
              callback_data: TELEGRAM_CALLBACK.confirmEditPlan,
            },
          ],
        ],
      });
      return;
    }

    if (data === TELEGRAM_CALLBACK.confirmEditEmail) {
      await this.sessionService.updateSession(telegramId, {
        state: TelegramSessionState.WAITING_EMAIL,
      });
      await this.telegramApi.sendMessage(chatId, messages.askEmail);
      return;
    }

    if (data === TELEGRAM_CALLBACK.confirmEditName) {
      await this.sessionService.updateSession(telegramId, {
        state: TelegramSessionState.WAITING_NAME,
      });
      await this.telegramApi.sendMessage(chatId, messages.askName);
      return;
    }

    if (data === TELEGRAM_CALLBACK.confirmEditPlan) {
      await this.sendPlanSelection(telegramId, chatId, lang);
      return;
    }
  }

  private async handleManagerCallback(
    callback: TelegramCallbackQuery,
    data: string,
  ) {
    const managerId = String(callback.from.id);
    const chatId = callback.message?.chat.id;

    if (!chatId || String(chatId) !== this.managerChatId) {
      await this.telegramApi.answerCallbackQuery(
        callback.id,
        managerMessages.noAccess,
        true,
      );
      return;
    }

    if (data.startsWith("mgr:confirm:")) {
      const orderId = data.slice("mgr:confirm:".length);
      await this.telegramApi.answerCallbackQuery(
        callback.id,
        managerMessages.confirming,
      );

      const result = await this.paymentsService.confirmPayment(
        orderId,
        managerId,
      );

      const order = result.order;
      const subscription = order.subscription;
      const expiresAt = subscription?.expiresAt;

      await this.telegramApi.sendMessage(
        chatId,
        result.alreadyConfirmed
          ? managerMessages.alreadyConfirmed(order.orderNumber)
          : managerMessages.confirmed(order.orderNumber),
      );

      if (order.user.telegramId) {
        const userLang = await this.getLanguageForTelegramId(
          order.user.telegramId,
        );
        const userMessages = getBotMessages(userLang);
        await this.telegramApi.sendMessage(
          order.user.telegramId,
          userMessages.paymentConfirmed({
            orderNumber: order.orderNumber,
            planTitle: order.plan.titleRu,
            expiresAt,
          }),
        );
      }

      if (order.user.telegramId) {
        await this.sessionService.updateSession(order.user.telegramId, {
          state: TelegramSessionState.COMPLETED,
          data: { orderId: order.id },
        });
      }

      return;
    }

    if (data.startsWith("mgr:reject:")) {
      const orderId = data.slice("mgr:reject:".length);
      await this.telegramApi.answerCallbackQuery(callback.id);

      await this.telegramApi.sendMessage(
        chatId,
        managerMessages.chooseRejectReason,
        {
          inline_keyboard: [
            [
              {
                text: managerMessages.rejectReasons.amount_mismatch,
                callback_data: `mgr:reason:${orderId}:amount_mismatch`,
              },
            ],
            [
              {
                text: managerMessages.rejectReasons.not_found,
                callback_data: `mgr:reason:${orderId}:not_found`,
              },
            ],
            [
              {
                text: managerMessages.rejectReasons.invalid,
                callback_data: `mgr:reason:${orderId}:invalid`,
              },
            ],
            [
              {
                text: managerMessages.rejectReasons.other,
                callback_data: `mgr:reason:${orderId}:other`,
              },
            ],
          ],
        },
      );
      return;
    }

    if (data.startsWith("mgr:reason:")) {
      const payload = data.slice("mgr:reason:".length);
      const separatorIndex = payload.indexOf(":");
      const orderId = payload.slice(0, separatorIndex);
      const reasonCode = payload.slice(separatorIndex + 1) as RejectReasonCode;
      const reasonForDb = getRejectReason("ru", reasonCode);

      await this.telegramApi.answerCallbackQuery(
        callback.id,
        managerMessages.rejecting,
      );

      const result = await this.paymentsService.rejectPayment(
        orderId,
        reasonForDb,
        managerId,
      );

      await this.telegramApi.sendMessage(
        chatId,
        result.alreadyRejected
          ? managerMessages.alreadyRejected(result.order.orderNumber)
          : managerMessages.rejected(result.order.orderNumber),
      );

      if (result.order.user.telegramId) {
        const userLang = await this.getLanguageForTelegramId(
          result.order.user.telegramId,
        );
        const userMessages = getBotMessages(userLang);
        await this.telegramApi.sendMessage(
          result.order.user.telegramId,
          userMessages.paymentRejected({
            orderNumber: result.order.orderNumber,
            reason: getRejectReason(userLang, reasonCode),
          }),
        );

        await this.sessionService.resetToStart(result.order.user.telegramId);
      }
    }
  }

  private async sendLanguageSelection(chatId: number) {
    const messages = getBotMessages("ru");
    await this.telegramApi.sendMessage(chatId, messages.chooseLanguage, {
      inline_keyboard: [
        [
          {
            text: "🇷🇺 Русский",
            callback_data: TELEGRAM_CALLBACK.langRu,
          },
        ],
        [
          {
            text: "🇰🇿 Қазақша",
            callback_data: TELEGRAM_CALLBACK.langKk,
          },
        ],
      ],
    });
  }

  private async sendMainMenu(chatId: number, lang: BotLanguage) {
    const messages = getBotMessages(lang);
    await this.telegramApi.sendMessage(chatId, messages.mainMenu, {
      keyboard: [
        [{ text: messages.keyboard.buy }],
        [{ text: messages.keyboard.subs }, { text: messages.keyboard.orders }],
        [
          { text: messages.keyboard.help },
          { text: messages.keyboard.language },
        ],
      ],
      resize_keyboard: true,
    });
  }

  private async handleStartPayload(
    telegramId: string,
    chatId: number,
    startPayload: string | undefined,
    sessionData: TelegramSessionData,
    lang?: BotLanguage,
  ): Promise<boolean> {
    const language = lang ?? this.getLanguage(sessionData);

    if (startPayload === "purchase") {
      await this.startPurchaseFlow(telegramId, chatId, language);
      return true;
    }

    const planSlug = parsePlanSlugFromStart(startPayload);
    if (!planSlug) {
      return false;
    }

    const plan = await this.subscriptionsService.findActivePlanBySlug(planSlug);
    const messages = getBotMessages(language);

    if (!plan) {
      await this.telegramApi.sendMessage(chatId, messages.planUnavailable);
      await this.sendMainMenu(chatId, language);
      return true;
    }

    await this.startPurchaseFlow(telegramId, chatId, language, plan.id);
    return true;
  }

  private async startPurchaseFlow(
    telegramId: string,
    chatId: number,
    lang: BotLanguage,
    planId?: string,
  ) {
    const messages = getBotMessages(lang);
    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.WAITING_EMAIL,
      data: {
        language: lang,
        ...(planId ? { planId } : {}),
      },
    });
    await this.telegramApi.sendMessage(chatId, messages.askEmail);
  }

  private async handleEmailInput(
    telegramId: string,
    chatId: number,
    email: string,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    if (!isValidEmail(email)) {
      await this.telegramApi.sendMessage(chatId, messages.invalidEmail);
      return;
    }

    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.WAITING_NAME,
      data: { email: email.toLowerCase(), language: lang },
    });
    await this.telegramApi.sendMessage(chatId, messages.askName);
  }

  private async handleNameInput(
    telegramId: string,
    chatId: number,
    fullName: string,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const parsed = parseFullName(fullName);
    if (!parsed) {
      await this.telegramApi.sendMessage(chatId, messages.invalidName);
      return;
    }

    const session = await this.sessionService.getSession(telegramId);
    const sessionData = this.sessionService.getSessionData(
      session ?? { data: {} },
    );

    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.SELECTING_PLAN,
      data: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        language: lang,
      },
    });

    if (sessionData.planId) {
      await this.handlePlanSelection(
        telegramId,
        chatId,
        sessionData.planId,
        lang,
      );
      return;
    }

    await this.sendPlanSelection(telegramId, chatId, lang);
  }

  private async sendPlanSelection(
    telegramId: string,
    chatId: number,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const plans = await this.subscriptionsService.findActivePlans();

    if (plans.length === 0) {
      await this.telegramApi.sendMessage(chatId, messages.noPlans);
      return;
    }

    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.SELECTING_PLAN,
      data: { language: lang },
    });

    const lines = plans.map(
      (plan) => `${plan.titleRu} · ${formatPriceKzt(plan.priceKzt)}`,
    );

    await this.telegramApi.sendMessage(
      chatId,
      [messages.choosePlan, "", ...lines].join("\n"),
      {
        inline_keyboard: plans.map((plan) => [
          {
            text: `${plan.titleRu} — ${formatPriceKzt(plan.priceKzt)}`,
            callback_data: `plan:${plan.id}`,
          },
        ]),
      },
    );
  }

  private async handlePlanSelection(
    telegramId: string,
    chatId: number,
    planId: string,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const session = await this.sessionService.getSession(telegramId);
    const data = this.sessionService.getSessionData(session ?? { data: {} });
    const plans = await this.subscriptionsService.findActivePlans();
    const plan = plans.find((item) => item.id === planId);

    if (!plan) {
      await this.telegramApi.sendMessage(chatId, messages.planUnavailable);
      await this.sendPlanSelection(telegramId, chatId, lang);
      return;
    }

    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.CONFIRMING_DATA,
      data: { planId: plan.id, language: lang },
    });

    await this.telegramApi.sendMessage(
      chatId,
      messages.confirmData({
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        email: data.email ?? "",
        planTitle: plan.titleRu,
        durationMonths: plan.durationMonths,
        priceKzt: plan.priceKzt,
      }),
      {
        inline_keyboard: [
          [
            {
              text: messages.confirmYes,
              callback_data: TELEGRAM_CALLBACK.confirmYes,
            },
          ],
          [
            {
              text: messages.confirmEdit,
              callback_data: TELEGRAM_CALLBACK.confirmEdit,
            },
          ],
        ],
      },
    );
  }

  private async handleConfirmData(
    telegramId: string,
    chatId: number,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const session = await this.sessionService.getSession(telegramId);
    const data = this.sessionService.getSessionData(session ?? { data: {} });

    if (!data.email || !data.firstName || !data.lastName || !data.planId) {
      await this.telegramApi.sendMessage(chatId, messages.missingData);
      await this.startPurchaseFlow(telegramId, chatId, lang);
      return;
    }

    const user = await this.telegramUsersService
      .upsertFromTelegram({
        telegramId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      })
      .catch(async (error) => {
        if (error instanceof ConflictException) {
          await this.telegramApi.sendMessage(
            chatId,
            getTelegramUserErrorMessage(lang, String(error.message)),
          );
          return null;
        }
        throw error;
      });

    if (!user) {
      return;
    }

    const order = await this.ordersService.createOrder(user.id, data.planId);

    await this.sessionService.updateSession(telegramId, {
      userId: user.id,
      state: TelegramSessionState.WAITING_RECEIPT,
      data: { orderId: order.id, language: lang },
    });

    await this.telegramApi.sendMessage(chatId, messages.orderCreated);

    await this.telegramApi.sendMessage(
      chatId,
      messages.paymentDetails({
        planTitle: order.plan.titleRu,
        amount: order.amount,
        cardNumber: this.paymentCardNumber,
        cardOwner: this.paymentCardOwner,
        orderNumber: order.orderNumber,
      }),
    );
  }

  private async handleReceiptMessage(
    telegramId: string,
    chatId: number,
    message: TelegramMessage,
    state: TelegramSessionState,
    data: TelegramSessionData,
  ) {
    const lang = this.getLanguage(data);
    const messages = getBotMessages(lang);

    if (
      state !== TelegramSessionState.WAITING_RECEIPT &&
      state !== TelegramSessionState.AWAITING_PAYMENT &&
      state !== TelegramSessionState.PAYMENT_REVIEW
    ) {
      await this.telegramApi.sendMessage(chatId, messages.sendReceiptHint);
      return;
    }

    const user = await this.telegramUsersService.findByTelegramId(telegramId);
    if (!user) {
      await this.telegramApi.sendMessage(chatId, messages.createOrderFirst);
      return;
    }

    const orderId = data.orderId;
    if (!orderId) {
      await this.telegramApi.sendMessage(chatId, messages.createOrderFirst);
      return;
    }

    const order = await this.ordersService.findByIdForUser(orderId, user.id);

    if (order.user.telegramId && order.user.telegramId !== telegramId) {
      await this.telegramApi.sendMessage(chatId, messages.orderNotAccessible);
      return;
    }

    try {
      this.ordersService.assertOrderAwaitingReceipt(order);
    } catch (error) {
      const messageText =
        error instanceof BadRequestException
          ? getOrderReceiptErrorMessage(lang, String(error.message))
          : messages.orderUnavailable;
      await this.telegramApi.sendMessage(chatId, messageText);
      return;
    }

    const fileId =
      message.photo?.[message.photo.length - 1]?.file_id ??
      message.document?.file_id;

    if (!fileId) {
      await this.telegramApi.sendMessage(chatId, messages.sendReceiptHint);
      return;
    }

    const receiptKind = message.document ? "document" : "photo";

    let receiptObjectKey: string | null = null;

    try {
      const file = await this.telegramApi.getFile(fileId);
      if (file.file_path) {
        const buffer = await this.telegramApi.downloadFile(file.file_path);
        const extension = inferReceiptExtension(
          message.document?.file_name,
          message.document?.mime_type,
        );
        receiptObjectKey = this.storageService.buildReceiptObjectKey(
          order.orderNumber,
          extension,
        );
        const contentType =
          message.document?.mime_type ??
          (message.photo ? "image/jpeg" : "application/octet-stream");
        await this.storageService.putObject(
          receiptObjectKey,
          buffer,
          contentType,
        );
      }
    } catch (error) {
      this.logger.error({
        event: "RECEIPT_STORAGE_ERROR",
        orderId: order.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    const result = await this.paymentsService.submitReceipt({
      orderId: order.id,
      receiptTelegramFileId: fileId,
      receiptObjectKey,
    });

    if (result.alreadySubmitted) {
      await this.telegramApi.sendMessage(chatId, messages.receiptAlreadySent);
      return;
    }

    await this.sessionService.updateSession(telegramId, {
      state: TelegramSessionState.PAYMENT_REVIEW,
      data: { orderId: order.id, language: lang },
    });

    await this.telegramApi.sendMessage(chatId, messages.receiptAccepted);

    await this.notifyManager(
      await this.ordersService.findByOrderNumber(result.order.orderNumber),
      fileId,
      receiptKind,
    );
  }

  private async notifyManager(
    order: {
      orderNumber: string;
      amount: number;
      plan: { titleRu: string; durationMonths: number };
      user: {
        firstName: string;
        lastName: string;
        email: string;
        telegramId: string | null;
      };
      id: string;
    },
    receiptFileId: string,
    receiptKind: "photo" | "document",
  ) {
    if (!this.managerChatId) {
      this.logger.warn({
        event: "MANAGER_NOTIFICATION_SKIPPED",
        reason: "TELEGRAM_MANAGER_CHAT_ID is not configured",
        orderId: order.id,
      });
      return;
    }

    const text = managerMessages.payment({
      orderNumber: order.orderNumber,
      userName: `${order.user.firstName} ${order.user.lastName}`,
      email: order.user.email,
      telegramId: order.user.telegramId,
      planTitle: order.plan.titleRu,
      durationMonths: order.plan.durationMonths,
      amount: order.amount,
    });

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: managerMessages.confirmButton,
            callback_data: `mgr:confirm:${order.id}`,
          },
          {
            text: managerMessages.rejectButton,
            callback_data: `mgr:reject:${order.id}`,
          },
        ],
      ],
    };

    try {
      if (receiptKind === "document") {
        await this.telegramApi.sendDocument(
          this.managerChatId,
          receiptFileId,
          text,
          replyMarkup,
        );
        return;
      }

      await this.telegramApi.sendPhoto(
        this.managerChatId,
        receiptFileId,
        text,
        replyMarkup,
      );
    } catch (error) {
      this.logger.error({
        event: "MANAGER_RECEIPT_DELIVERY_FAILED",
        orderId: order.id,
        receiptKind,
        error: error instanceof Error ? error.message : "unknown",
      });

      try {
        if (receiptKind === "photo") {
          await this.telegramApi.sendDocument(
            this.managerChatId,
            receiptFileId,
            text,
            replyMarkup,
          );
          return;
        }

        await this.telegramApi.sendPhoto(
          this.managerChatId,
          receiptFileId,
          text,
          replyMarkup,
        );
      } catch (fallbackError) {
        this.logger.error({
          event: "MANAGER_RECEIPT_FALLBACK_FAILED",
          orderId: order.id,
          error:
            fallbackError instanceof Error ? fallbackError.message : "unknown",
        });

        await this.telegramApi.sendMessage(
          this.managerChatId,
          `${text}\n\n${managerMessages.receiptAttachFailed}`,
          replyMarkup,
        );
      }
    }
  }

  private async sendMySubscriptions(
    telegramId: string,
    chatId: number,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const user = await this.telegramUsersService.findByTelegramId(telegramId);
    if (!user) {
      await this.telegramApi.sendMessage(chatId, messages.noSubscription);
      return;
    }

    const current = await this.subscriptionsService.getCurrentSubscription(
      user.id,
    );

    if (!current.subscription) {
      await this.telegramApi.sendMessage(chatId, messages.noActiveSubscription);
      return;
    }

    await this.telegramApi.sendMessage(
      chatId,
      messages.mySubscription({
        planTitle: current.subscription.plan.titleRu,
        isActive: current.isActive,
        expiresAt: current.subscription.expiresAt,
      }),
    );
  }

  private async sendMyOrders(
    telegramId: string,
    chatId: number,
    lang: BotLanguage,
  ) {
    const messages = getBotMessages(lang);
    const user = await this.telegramUsersService.findByTelegramId(telegramId);
    if (!user) {
      await this.telegramApi.sendMessage(chatId, messages.noOrders);
      return;
    }

    const orders = await this.ordersService.findUserOrders(user.id);
    if (orders.length === 0) {
      await this.telegramApi.sendMessage(chatId, messages.noOrders);
      return;
    }

    const lines = orders.slice(0, 10).map((order) =>
      messages.myOrderLine({
        orderNumber: order.orderNumber,
        planTitle: order.plan.titleRu,
        status: order.status,
      }),
    );

    await this.telegramApi.sendMessage(
      chatId,
      [messages.myOrdersHeader, "", ...lines].join("\n"),
    );
  }

  private async sendHelp(chatId: number, lang: BotLanguage) {
    const messages = getBotMessages(lang);
    await this.telegramApi.sendMessage(chatId, messages.help);
  }
}
