import {
  formatDurationMonths,
  formatPriceKzt,
  generateOrderNumber,
} from "./order-number.utils";

describe("order-number.utils", () => {
  it("generates order numbers with ORD prefix", () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber).toMatch(/^ORD-[0-9A-Z]{6}$/);
  });

  it("formats kzt prices", () => {
    expect(formatPriceKzt(5000)).toContain("5");
    expect(formatPriceKzt(5000)).toContain("₸");
  });

  it("formats month durations in Russian", () => {
    expect(formatDurationMonths(1)).toBe("1 месяц");
    expect(formatDurationMonths(3)).toBe("3 месяца");
    expect(formatDurationMonths(12)).toBe("12 месяцев");
  });
});
