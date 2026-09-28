import { Injectable } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StoredObjectStat,
  UploadPurpose,
} from "../../src/storage/storage.types";

@Injectable()
export class MockStorageService {
  private readonly objects = new Map<string, StoredObjectStat>();

  seedObject(
    objectKey: string,
    size = 1024,
    contentType = "application/octet-stream",
  ) {
    this.objects.set(objectKey, {
      objectKey,
      size,
      contentType,
    });
  }

  buildObjectKey(
    purpose: UploadPurpose,
    fileName: string,
    courseId?: string,
    lessonId?: string,
  ): string {
    if (purpose === "video" && courseId && lessonId) {
      return `courses/${courseId}/lessons/${lessonId}/video/test.mp4`;
    }
    return `uploads/${purpose}/${fileName}`;
  }

  createPresignedUpload(
    purpose: UploadPurpose,
    fileName: string,
    contentType: string,
    fileSize: number,
    courseId?: string,
    lessonId?: string,
  ): Promise<PresignedUploadResult> {
    const objectKey = this.buildObjectKey(
      purpose,
      fileName,
      courseId,
      lessonId,
    );
    this.seedObject(objectKey, fileSize, contentType);
    return Promise.resolve({
      objectKey,
      uploadUrl: `http://localhost:9000/${objectKey}`,
      expiresIn: 900,
    });
  }

  createPresignedDownload(objectKey: string): Promise<PresignedDownloadResult> {
    return Promise.resolve({
      downloadUrl: `http://localhost:9000/${objectKey}`,
      expiresIn: 3600,
    });
  }

  statObject(objectKey: string): Promise<StoredObjectStat> {
    const stat = this.objects.get(objectKey);
    if (!stat) {
      throw new BadRequestException(
        `Object ${objectKey} was not found in storage`,
      );
    }
    return Promise.resolve(stat);
  }

  deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    return Promise.resolve();
  }

  deleteObjects(objectKeys: string[]): Promise<void> {
    for (const objectKey of objectKeys) {
      this.objects.delete(objectKey);
    }
    return Promise.resolve();
  }

  buildReceiptObjectKey(orderNumber: string, extension: string): string {
    return `payments/receipts/${orderNumber}/test${extension}`;
  }

  putObject(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    this.seedObject(objectKey, body.length, contentType);
    return Promise.resolve();
  }

  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  onModuleInit(): Promise<void> {
    return Promise.resolve();
  }
}
