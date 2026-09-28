import { randomBytes } from "node:crypto";

const ORDER_NUMBER_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateOrderNumber(): string {
  const bytes = randomBytes(6);
  let suffix = "";

  for (let index = 0; index < 6; index += 1) {
    suffix +=
      ORDER_NUMBER_ALPHABET[bytes[index] % ORDER_NUMBER_ALPHABET.length];
  }

  return `ORD-${suffix}`;
}

export function formatPriceKzt(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₸`;
}

export function formatDurationMonths(months: number): string {
  if (months === 1) {
    return "1 месяц";
  }
  if (months >= 2 && months <= 4) {
    return `${months} месяца`;
  }
  return `${months} месяцев`;
}
