import { BadRequestException } from "@nestjs/common";
import { calculateStreak, resolveDateRange } from "./analytics.utils";

describe("analytics.utils", () => {
  it("resolves default 30-day range", () => {
    const range = resolveDateRange(undefined, "2026-02-01T00:00:00.000Z");

    expect(range.to.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(range.from < range.to).toBe(true);
  });

  it("rejects invalid range", () => {
    expect(() =>
      resolveDateRange("2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ).toThrow(BadRequestException);
  });

  it("calculates streak from active day keys", () => {
    const activeDays = new Set(["2026-02-03", "2026-02-02", "2026-02-01"]);
    const streak = calculateStreak(
      activeDays,
      "UTC",
      new Date("2026-02-03T12:00:00.000Z"),
    );

    expect(streak).toBe(3);
  });
});
