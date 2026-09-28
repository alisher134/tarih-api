import {
  inferReceiptExtension,
  isValidEmail,
  parseFullName,
  parsePlanSlugFromStart,
} from "./telegram.validation";

describe("telegram.validation", () => {
  it("validates email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
  });

  it("parses full names", () => {
    expect(parseFullName("Алишер Иванов")).toEqual({
      firstName: "Алишер",
      lastName: "Иванов",
    });
    expect(parseFullName("Али")).toBeNull();
  });

  it("parses plan slug from telegram start payload", () => {
    expect(parsePlanSlugFromStart("plan_1-month")).toBe("1-month");
    expect(parsePlanSlugFromStart("purchase")).toBeNull();
    expect(parsePlanSlugFromStart("plan_")).toBeNull();
  });

  it("infers receipt extensions", () => {
    expect(inferReceiptExtension("receipt.pdf", "application/pdf")).toBe(
      ".pdf",
    );
    expect(inferReceiptExtension(undefined, "image/jpeg")).toBe(".jpg");
  });
});
