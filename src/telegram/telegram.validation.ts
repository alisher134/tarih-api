const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function parsePlanSlugFromStart(startPayload?: string): string | null {
  if (!startPayload?.startsWith("plan_")) {
    return null;
  }

  const slug = startPayload.slice("plan_".length).trim();
  return slug.length > 0 ? slug : null;
}

export function parseFullName(value: string): {
  firstName: string;
  lastName: string;
} | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const [firstName, ...rest] = parts;
  const lastName = rest.join(" ");

  if (firstName.length < 2 || lastName.length < 2) {
    return null;
  }

  return { firstName, lastName };
}

export function formatDate(date: Date, locale = "ru-RU"): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateRu(date: Date): string {
  return formatDate(date, "ru-RU");
}

export function inferReceiptExtension(
  fileName?: string,
  mimeType?: string,
): string {
  if (fileName?.includes(".")) {
    const extension = fileName.slice(fileName.lastIndexOf("."));
    if (/^\.[a-z0-9]+$/i.test(extension)) {
      return extension;
    }
  }

  if (mimeType === "application/pdf") {
    return ".pdf";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  return ".bin";
}
