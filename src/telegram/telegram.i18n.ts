export type BotLanguage = "ru" | "kk";

export const BOT_LANGUAGES: BotLanguage[] = ["ru", "kk"];

export const KEYBOARD_LABELS = {
  ru: {
    buy: "Купить подписку",
    subs: "Мои подписки",
    orders: "Мои заказы",
    help: "Помощь",
    language: "Язык",
  },
  kk: {
    buy: "Жазылым алу",
    subs: "Жазылымдарым",
    orders: "Тапсырыстарым",
    help: "Көмек",
    language: "Тіл",
  },
} as const;

export type MenuAction = keyof (typeof KEYBOARD_LABELS)["ru"];

export function resolveLanguage(language?: string): BotLanguage {
  return language === "kk" ? "kk" : "ru";
}

export function getMenuAction(text: string): MenuAction | null {
  for (const lang of BOT_LANGUAGES) {
    const labels = KEYBOARD_LABELS[lang];
    for (const action of Object.keys(labels) as MenuAction[]) {
      if (labels[action] === text) {
        return action;
      }
    }
  }

  return null;
}

export function formatDurationMonths(
  months: number,
  lang: BotLanguage,
): string {
  if (lang === "kk") {
    return `${months} ай`;
  }

  if (months === 1) {
    return "1 месяц";
  }
  if (months >= 2 && months <= 4) {
    return `${months} месяца`;
  }
  return `${months} месяцев`;
}

export function formatDate(date: Date, lang: BotLanguage): string {
  const locale = lang === "kk" ? "kk-KZ" : "ru-RU";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
