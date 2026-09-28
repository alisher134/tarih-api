export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getRemainingSeconds(expiresAt: Date, now = new Date()): number {
  const diffMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

export function getRemainingDays(expiresAt: Date, now = new Date()): number {
  return Math.ceil(getRemainingSeconds(expiresAt, now) / 86400);
}

export function isSubscriptionActive(
  startsAt: Date,
  expiresAt: Date,
  status: string,
  now = new Date(),
): boolean {
  return (
    status === "ACTIVE" &&
    startsAt.getTime() <= now.getTime() &&
    expiresAt.getTime() > now.getTime()
  );
}

export function isSubscriptionUpcoming(
  startsAt: Date,
  expiresAt: Date,
  status: string,
  now = new Date(),
): boolean {
  return (
    status === "ACTIVE" &&
    startsAt.getTime() > now.getTime() &&
    expiresAt.getTime() > startsAt.getTime()
  );
}
