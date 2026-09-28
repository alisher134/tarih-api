import { OrderStatus } from "../generated/prisma/client";
import { formatPriceKzt } from "../common/orders/order-number.utils";
import {
  type BotLanguage,
  formatDate,
  formatDurationMonths,
  KEYBOARD_LABELS,
} from "./telegram.i18n";

export type RejectReasonCode =
  "amount_mismatch" | "not_found" | "invalid" | "other";

const REJECT_REASONS: Record<BotLanguage, Record<RejectReasonCode, string>> = {
  ru: {
    amount_mismatch: "сумма не совпала",
    not_found: "платёж не нашли",
    invalid: "чек не подошёл",
    other: "другая причина",
  },
  kk: {
    amount_mismatch: "сома сәйкес келмеді",
    not_found: "төлем табылмады",
    invalid: "чек жарамсыз",
    other: "басқа себеп",
  },
};

const ORDER_STATUS_LABELS: Record<BotLanguage, Record<OrderStatus, string>> = {
  ru: {
    PENDING_CONFIRMATION: "ожидает подтверждения",
    AWAITING_PAYMENT: "ждём оплату",
    PAYMENT_REVIEW: "проверяем чек",
    PAID: "оплачен",
    REJECTED: "отклонён",
    EXPIRED: "истёк",
  },
  kk: {
    PENDING_CONFIRMATION: "растауды күтуде",
    AWAITING_PAYMENT: "төлемді күтуде",
    PAYMENT_REVIEW: "чекті тексеруде",
    PAID: "төленді",
    REJECTED: "қабылданбады",
    EXPIRED: "мерзімі өтті",
  },
};

export function getRejectReason(
  lang: BotLanguage,
  code: RejectReasonCode,
): string {
  return REJECT_REASONS[lang][code] ?? REJECT_REASONS[lang].other;
}

function formatOrderStatus(lang: BotLanguage, status: OrderStatus): string {
  return ORDER_STATUS_LABELS[lang][status] ?? status;
}

export function getBotMessages(lang: BotLanguage) {
  const labels = KEYBOARD_LABELS[lang];

  return {
    chooseLanguage:
      lang === "kk" ? "Тілді таңдаңыз:" : "Выберите язык / Тілді таңдаңыз:",

    mainMenu:
      lang === "kk"
        ? "Сәлем! Мұнда жазылым рәсімдеп, тапсырыстарыңызды көре аласыз."
        : "Привет! Здесь можно оформить подписку и посмотреть свои заказы.",

    languageChanged: lang === "kk" ? "Тіл өзгертілді." : "Язык изменён.",

    askEmail:
      lang === "kk"
        ? "Email жазыңыз — аккаунт сонда байланысады."
        : "Напишите email — на него привяжем аккаунт.",

    invalidEmail:
      lang === "kk"
        ? "Email дұрыс емес сияқты. Қайта көріңіз."
        : "Похоже, email неверный. Попробуйте ещё раз.",

    askName:
      lang === "kk"
        ? "Енді аты-жөніңізді жазыңыз — бос орынмен."
        : "Теперь имя и фамилию — через пробел.",

    invalidName:
      lang === "kk"
        ? "Аты мен тегін жазыңыз, мысалы: Алишер Иванов"
        : "Нужны имя и фамилия, например: Алишер Иванов",

    noPlans:
      lang === "kk"
        ? "Қазір тарифтер жоқ. Кейінірек кіріңіз."
        : "Сейчас тарифов нет. Загляните позже.",

    choosePlan: lang === "kk" ? "Қай тарифты аламыз?" : "Какой тариф берём?",

    planUnavailable:
      lang === "kk"
        ? "Бұл тариф қолжетімсіз. Басқасын таңдаңыз."
        : "Этот тариф уже недоступен. Выберите другой.",

    whatToEdit: lang === "kk" ? "Не өзгертеміз?" : "Что поправить?",

    editEmail: lang === "kk" ? "Email" : "Email",
    editName: lang === "kk" ? "Аты-жөні" : "Имя и фамилию",
    editPlan: lang === "kk" ? "Тариф" : "Тариф",
    confirmYes: lang === "kk" ? "Иә, дұрыс" : "Да, всё верно",
    confirmEdit: lang === "kk" ? "Өзгерту" : "Изменить",

    confirmData(input: {
      firstName: string;
      lastName: string;
      email: string;
      planTitle: string;
      durationMonths: number;
      priceKzt: number;
    }) {
      const footer =
        lang === "kk"
          ? "Растағаннан кейін бұл тапсырыс үшін деректерді өзгерту мүмкін емес."
          : "После подтверждения данные для этого заказа поменять нельзя.";

      return [
        lang === "kk" ? "Барлығы дұрыс па?" : "Всё верно?",
        "",
        `${input.firstName} ${input.lastName}`,
        input.email,
        "",
        `${input.planTitle} · ${formatDurationMonths(input.durationMonths, lang)}`,
        formatPriceKzt(input.priceKzt),
        "",
        footer,
      ].join("\n");
    },

    missingData:
      lang === "kk"
        ? "Бір нәрсе дұрыс болмады — қайта бастаймыз."
        : "Что-то пошло не так — начнём оформление заново.",

    emailLinkedToOtherTelegram:
      lang === "kk"
        ? "Бұл email басқа Telegram-аккаунтқа байланған. Басқа email қолданыңыз."
        : "Этот email уже привязан к другому Telegram. Используйте другой email.",

    accountLinkFailed:
      lang === "kk"
        ? "Аккаунтты қосу сәтсіз аяқталды. Қайта көріңіз немесе басқа email жазыңыз."
        : "Не получилось привязать аккаунт. Попробуйте ещё раз или укажите другой email.",

    orderCreated:
      lang === "kk"
        ? "Тапсырыс құрылды, төлемді күтеміз."
        : "Заказ создан, ждём оплату.",

    paymentDetails(input: {
      planTitle: string;
      amount: number;
      cardNumber: string;
      cardOwner: string;
      orderNumber: string;
    }) {
      const intro =
        lang === "kk"
          ? `${formatPriceKzt(input.amount)} соманы картаға аударыңыз:`
          : `Переведите ${formatPriceKzt(input.amount)} на карту:`;
      const orderLabel =
        lang === "kk"
          ? `Тапсырыс нөмірі: ${input.orderNumber}`
          : `Номер заказа: ${input.orderNumber}`;
      const outro =
        lang === "kk"
          ? "Төлегеннен кейін скрин немесе PDF жіберіңіз."
          : "Когда оплатите — пришлите сюда скрин или PDF.";

      return [
        intro,
        "",
        input.cardNumber,
        input.cardOwner,
        "",
        orderLabel,
        "",
        outro,
      ].join("\n");
    },

    sendReceiptHint:
      lang === "kk"
        ? "Чекті фото немесе файлмен жіберіңіз (PDF болады)."
        : "Пришлите чек фото или файлом (PDF тоже ок).",

    createOrderFirst:
      lang === "kk"
        ? `Алдымен тапсырыс рәсімдеңіз — «${labels.buy}».`
        : `Сначала оформите заказ — кнопка «${labels.buy}».`,

    orderNotAccessible:
      lang === "kk"
        ? "Бұл тапсырыс сізге тиесілі емес."
        : "Этот заказ вам не доступен.",

    orderUnavailable:
      lang === "kk"
        ? "Бұл тапсырыс бойынша әрекет қазір мүмкін емес."
        : "С этим заказом сейчас ничего сделать нельзя.",

    orderExpired:
      lang === "kk"
        ? "Тапсырыс мерзімі өтті. «Жазылым алу» арқылы жаңасын рәсімдеңіз."
        : "Срок заказа вышел. Оформите новый через «Купить подписку».",

    orderPaid:
      lang === "kk" ? "Бұл тапсырыс төленген." : "Этот заказ уже оплачен.",

    orderRejected:
      lang === "kk"
        ? "Тапсырыс қабылданбады. Жаңасын рәсімдеп, чекті қайта жіберіңіз."
        : "Заказ отклонили. Оформите новый и пришлите чек снова.",

    receiptAlreadySent:
      lang === "kk"
        ? "Чек тексеруде. Біраз күтіңіз."
        : "Чек уже на проверке. Подождите немного.",

    receiptAccepted:
      lang === "kk"
        ? "Чек алынды. Тексергеннен кейін хабарлаймыз."
        : "Принял чек. Как проверим — напишем.",

    noSubscription:
      lang === "kk"
        ? `Жазылым жоқ. «${labels.buy}» арқылы рәсімдеуге болады.`
        : `Подписки пока нет. Можно оформить через «${labels.buy}».`,

    noActiveSubscription:
      lang === "kk" ? "Белсенді жазылым жоқ." : "Активной подписки нет.",

    mySubscription(input: {
      planTitle: string;
      isActive: boolean;
      expiresAt: Date;
    }) {
      const status = input.isActive
        ? lang === "kk"
          ? "белсенді"
          : "активна"
        : lang === "kk"
          ? "белсенді емес"
          : "не активна";
      const until =
        lang === "kk"
          ? `${formatDate(input.expiresAt, lang)} дейін`
          : `до ${formatDate(input.expiresAt, lang)}`;

      return [input.planTitle, status, until].join("\n");
    },

    noOrders: lang === "kk" ? "Тапсырыстар әлі жоқ." : "Заказов пока нет.",

    myOrdersHeader: lang === "kk" ? "Сіздің тапсырыстарыңыз:" : "Ваши заказы:",

    myOrderLine(input: {
      orderNumber: string;
      planTitle: string;
      status: OrderStatus;
    }) {
      return `${input.orderNumber} · ${input.planTitle} · ${formatOrderStatus(lang, input.status)}`;
    },

    help:
      lang === "kk"
        ? [
            "Жазылым қалай алуға болады:",
            "",
            `1. «${labels.buy}»`,
            "2. Email және аты-жөні",
            "3. Тариф таңдау және деректерді тексеру",
            "4. Төлем және чек жіберу",
            "",
            "Тексергеннен кейін жазылым автоматты түрде қосылады.",
          ].join("\n")
        : [
            "Как купить подписку:",
            "",
            `1. «${labels.buy}»`,
            "2. Email и имя",
            "3. Тариф и проверка данных",
            "4. Оплата по реквизитам и чек сюда",
            "",
            "После проверки подписка включится сама.",
          ].join("\n"),

    paymentConfirmed(input: {
      orderNumber: string;
      planTitle: string;
      expiresAt?: Date;
    }) {
      const lines =
        lang === "kk"
          ? [
              "Төлем өтті ✓",
              "",
              `Тапсырыс ${input.orderNumber}`,
              `${input.planTitle} жазылымы қосылды`,
            ]
          : [
              "Оплата прошла ✓",
              "",
              `Заказ ${input.orderNumber}`,
              `Подписка ${input.planTitle} активна`,
            ];

      if (input.expiresAt) {
        const until =
          lang === "kk"
            ? `${formatDate(input.expiresAt, lang)} дейін жарамды`
            : `Действует до ${formatDate(input.expiresAt, lang)}`;
        lines.push("", until);
      }

      lines.push("", lang === "kk" ? "Рахмет!" : "Спасибо!");
      return lines.join("\n");
    },

    paymentRejected(input: { orderNumber: string; reason: string }) {
      return lang === "kk"
        ? [
            `${input.orderNumber} тапсырысы бойынша төлем расталмады.`,
            "",
            `Себебі: ${input.reason}`,
            "",
            "Қате деп ойласаңыз — жаңа тапсырыс рәсімдеп, чекті қайта жіберіңіз.",
          ].join("\n")
        : [
            `Оплату по заказу ${input.orderNumber} не подтвердили.`,
            "",
            `Причина: ${input.reason}`,
            "",
            "Если это ошибка — оформите новый заказ и пришлите чек снова.",
          ].join("\n");
    },

    keyboard: labels,
  };
}

export function getTelegramUserErrorMessage(
  lang: BotLanguage,
  code: string,
): string {
  const messages = getBotMessages(lang);

  switch (code) {
    case "EMAIL_LINKED_TO_OTHER_TELEGRAM":
      return messages.emailLinkedToOtherTelegram;
    case "CREATE_FAILED":
      return messages.accountLinkFailed;
    default:
      return messages.accountLinkFailed;
  }
}

export function getOrderReceiptErrorMessage(
  lang: BotLanguage,
  code: string,
): string {
  const messages = getBotMessages(lang);

  switch (code) {
    case "ORDER_EXPIRED":
      return messages.orderExpired;
    case "ORDER_PAID":
      return messages.orderPaid;
    case "ORDER_REJECTED":
      return messages.orderRejected;
    case "ORDER_UNAVAILABLE":
      return messages.orderUnavailable;
    default:
      return messages.orderUnavailable;
  }
}

export const managerMessages = {
  noAccess: "Нет доступа",
  confirming: "Секунду…",
  rejecting: "Отклоняю…",
  alreadyConfirmed: (orderNumber: string) =>
    `Заказ ${orderNumber} уже был подтверждён.`,
  confirmed: (orderNumber: string) => `Готово, ${orderNumber} оплачен.`,
  chooseRejectReason: "Почему отклоняем?",
  alreadyRejected: (orderNumber: string) =>
    `Заказ ${orderNumber} уже был отклонён.`,
  rejected: (orderNumber: string) => `Отклонил ${orderNumber}.`,
  receiptAttachFailed:
    "Чек не прикрепился автоматически — посмотрите заказ в системе.",
  confirmButton: "Подтвердить",
  rejectButton: "Отклонить",
  rejectReasons: {
    amount_mismatch: "Сумма не совпала",
    not_found: "Платёж не нашли",
    invalid: "Чек не подошёл",
    other: "Другое",
  },
  payment(input: {
    orderNumber: string;
    userName: string;
    email: string;
    telegramId: string | null;
    planTitle: string;
    durationMonths: number;
    amount: number;
  }) {
    return [
      `Новая оплата · ${input.orderNumber}`,
      "",
      input.userName,
      input.email,
      input.telegramId ? `tg: ${input.telegramId}` : "",
      "",
      `${input.planTitle}, ${formatDurationMonths(input.durationMonths, "ru")}`,
      formatPriceKzt(input.amount),
    ]
      .filter(Boolean)
      .join("\n");
  },
};
