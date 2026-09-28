import { BadRequestException } from "@nestjs/common";
import { MATERIAL_CONTENT_TYPES, VIDEO_CONTENT_TYPES } from "./storage.types";

function validateUploadRequest(
  purpose: "video" | "material",
  contentType: string,
  fileSize: number,
  maxVideoSizeBytes: number,
  maxFileSizeBytes: number,
) {
  if (fileSize <= 0) {
    throw new BadRequestException("fileSize must be greater than zero");
  }

  if (purpose === "video") {
    if (fileSize > maxVideoSizeBytes) {
      throw new BadRequestException("Video exceeds maximum allowed size");
    }
    if (
      !VIDEO_CONTENT_TYPES.includes(
        contentType as (typeof VIDEO_CONTENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported video content type");
    }
    return;
  }

  if (fileSize > maxFileSizeBytes) {
    throw new BadRequestException("File exceeds maximum allowed size");
  }
  if (
    !MATERIAL_CONTENT_TYPES.includes(
      contentType as (typeof MATERIAL_CONTENT_TYPES)[number],
    )
  ) {
    throw new BadRequestException("Unsupported material content type");
  }
}

describe("storage validation", () => {
  it("rejects unsupported video content type", () => {
    expect(() =>
      validateUploadRequest(
        "video",
        "text/plain",
        1024,
        500 * 1024 * 1024,
        50 * 1024 * 1024,
      ),
    ).toThrow(BadRequestException);
  });

  it("accepts supported material content type", () => {
    expect(() =>
      validateUploadRequest(
        "material",
        "application/pdf",
        1024,
        500 * 1024 * 1024,
        50 * 1024 * 1024,
      ),
    ).not.toThrow();
  });
});
