import { BadRequestException } from "@nestjs/common";
import { MAX_ANALYTICS_RANGE_DAYS } from "./date-range.dto";

const MS_PER_DAY = 86_400_000;

export type ResolvedDateRange = {
  from: Date;
  to: Date;
  timezone: string;
};

export function resolveDateRange(
  fromInput?: string,
  toInput?: string,
  timezone = "UTC",
): ResolvedDateRange {
  const to = toInput ? new Date(toInput) : new Date();
  const from = fromInput
    ? new Date(fromInput)
    : new Date(to.getTime() - 30 * MS_PER_DAY);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException("Invalid date range");
  }

  if (from > to) {
    throw new BadRequestException("'from' must be before 'to'");
  }

  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
  if (rangeDays > MAX_ANALYTICS_RANGE_DAYS) {
    throw new BadRequestException(
      `Date range cannot exceed ${MAX_ANALYTICS_RANGE_DAYS} days`,
    );
  }

  return { from, to, timezone };
}

export function formatDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calculateStreak(
  activeDayKeys: Set<string>,
  timezone: string,
  referenceDate = new Date(),
): number {
  let streak = 0;
  const cursor = new Date(referenceDate);

  while (true) {
    const key = formatDateKey(cursor, timezone);
    if (!activeDayKeys.has(key)) {
      break;
    }
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return sorted[mid];
}
