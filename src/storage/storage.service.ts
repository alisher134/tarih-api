import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import * as Minio from "minio";
import {
  MATERIAL_CONTENT_TYPES,
  PresignedDownloadResult,
  PresignedUploadResult,
  StoredObjectStat,
  UploadPurpose,
  VIDEO_CONTENT_TYPES,
} from "./storage.types";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly uploadTtlSeconds: number;
  private readonly downloadTtlSeconds: number;
  private readonly maxVideoSizeBytes: number;
  private readonly maxFileSizeBytes: number;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.getOrThrow<string>("MINIO_ENDPOINT");
    const port = Number(config.getOrThrow<string>("MINIO_PORT"));
    const useSSL = config.get<string>("MINIO_USE_SSL") === "true";

    this.bucket = config.getOrThrow<string>("MINIO_BUCKET");
    this.uploadTtlSeconds = Number(
      config.get<string>("MINIO_PRESIGNED_UPLOAD_TTL_SECONDS") ?? "900",
    );
    this.downloadTtlSeconds = Number(
      config.get<string>("MINIO_PRESIGNED_DOWNLOAD_TTL_SECONDS") ?? "3600",
    );
    this.maxVideoSizeBytes =
      Number(config.get<string>("UPLOAD_MAX_VIDEO_SIZE_MB") ?? "500") *
      1024 *
      1024;
    this.maxFileSizeBytes =
      Number(config.get<string>("UPLOAD_MAX_FILE_SIZE_MB") ?? "50") *
      1024 *
      1024;

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey:
        config.get<string>("MINIO_ACCESS_KEY") ??
        config.getOrThrow<string>("MINIO_ROOT_USER"),
      secretKey:
        config.get<string>("MINIO_SECRET_KEY") ??
        config.getOrThrow<string>("MINIO_ROOT_PASSWORD"),
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket: ${this.bucket}`);
    }
  }

  async checkHealth(): Promise<void> {
    await this.client.bucketExists(this.bucket);
  }

  buildObjectKey(
    purpose: UploadPurpose,
    fileName: string,
    courseId?: string,
    lessonId?: string,
  ): string {
    const extension = this.sanitizeExtension(fileName);
    const uniqueName = `${randomUUID()}${extension}`;

    if (purpose === "video") {
      if (!courseId || !lessonId) {
        return `uploads/videos/${uniqueName}`;
      }
      return `courses/${courseId}/lessons/${lessonId}/video/${uniqueName}`;
    }

    if (!courseId || !lessonId) {
      return `uploads/materials/${uniqueName}`;
    }
    return `courses/${courseId}/lessons/${lessonId}/materials/${uniqueName}`;
  }

  async createPresignedUpload(
    purpose: UploadPurpose,
    fileName: string,
    contentType: string,
    fileSize: number,
    courseId?: string,
    lessonId?: string,
  ): Promise<PresignedUploadResult> {
    this.validateUploadRequest(purpose, contentType, fileSize);

    const objectKey = this.buildObjectKey(
      purpose,
      fileName,
      courseId,
      lessonId,
    );
    const uploadUrl = await this.client.presignedPutObject(
      this.bucket,
      objectKey,
      this.uploadTtlSeconds,
    );

    return {
      objectKey,
      uploadUrl,
      expiresIn: this.uploadTtlSeconds,
    };
  }

  async createPresignedDownload(
    objectKey: string,
  ): Promise<PresignedDownloadResult> {
    const downloadUrl = await this.client.presignedGetObject(
      this.bucket,
      objectKey,
      this.downloadTtlSeconds,
    );

    return {
      downloadUrl,
      expiresIn: this.downloadTtlSeconds,
    };
  }

  async statObject(objectKey: string): Promise<StoredObjectStat> {
    try {
      const stat = await this.client.statObject(this.bucket, objectKey);
      const metaData = stat.metaData as Record<string, string> | undefined;
      const contentType = metaData?.["content-type"];
      return {
        objectKey,
        size: stat.size,
        contentType: typeof contentType === "string" ? contentType : null,
      };
    } catch {
      throw new BadRequestException(
        `Object ${objectKey} was not found in storage`,
      );
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    if (objectKeys.length === 0) {
      return;
    }

    await Promise.all(objectKeys.map((key) => this.deleteObject(key)));
  }

  buildReceiptObjectKey(orderNumber: string, extension: string): string {
    const safeExtension = extension.startsWith(".")
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    return `payments/receipts/${orderNumber}/${randomUUID()}${safeExtension}`;
  }

  async putObject(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, body, body.length, {
      "Content-Type": contentType,
    });
  }

  private validateUploadRequest(
    purpose: UploadPurpose,
    contentType: string,
    fileSize: number,
  ) {
    if (fileSize <= 0) {
      throw new BadRequestException("fileSize must be greater than zero");
    }

    if (purpose === "video") {
      if (fileSize > this.maxVideoSizeBytes) {
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

    if (fileSize > this.maxFileSizeBytes) {
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

  private sanitizeExtension(fileName: string): string {
    const extension = extname(fileName).toLowerCase();
    if (!extension || extension.length > 10) {
      return "";
    }
    if (!/^\.[a-z0-9]+$/.test(extension)) {
      return "";
    }
    return extension;
  }
}
