export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  photo?: Array<{ file_id: string; file_size?: number }>;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
};

export type TelegramReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type TelegramSessionData = {
  language?: "ru" | "kk";
  email?: string;
  firstName?: string;
  lastName?: string;
  planId?: string;
  orderId?: string;
  pendingRejectOrderId?: string;
  startPayload?: string;
};

export const TELEGRAM_CALLBACK = {
  langRu: "lang:ru",
  langKk: "lang:kk",
  menuBuy: "menu:buy",
  menuSubs: "menu:subs",
  menuOrders: "menu:orders",
  menuHelp: "menu:help",
  confirmYes: "confirm:yes",
  confirmEdit: "confirm:edit",
  confirmEditEmail: "confirm:edit:email",
  confirmEditName: "confirm:edit:name",
  confirmEditPlan: "confirm:edit:plan",
} as const;

export type RejectReasonCode =
  "amount_mismatch" | "not_found" | "invalid" | "other";
