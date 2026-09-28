import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  UploadIntentStatus,
  UploadPurpose as PrismaUploadPurpose,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import {
  MATERIAL_CONTENT_TYPES,
  UploadPurpose,
  VIDEO_CONTENT_TYPES,
} from "../../storage/storage.types";
import type { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";

@Injectable()
export class AdminUploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async createIntent(userId: string, dto: CreateUploadIntentDto) {
    await this.expireStaleIntents();

    const uploadTtlSeconds = Number(
      this.config.get<string>("MINIO_PRESIGNED_UPLOAD_TTL_SECONDS") ?? "900",
    );
    const expiresAt = new Date(Date.now() + uploadTtlSeconds * 1000);

    const presigned = await this.storage.createPresignedUpload(
      dto.purpose,
      dto.fileName,
      dto.contentType,
      dto.fileSize,
      dto.courseId,
      dto.lessonId,
    );

    const intent = await this.prisma.uploadIntent.create({
      data: {
        userId,
        purpose:
          dto.purpose === "video"
            ? PrismaUploadPurpose.VIDEO
            : PrismaUploadPurpose.MATERIAL,
        objectKey: presigned.objectKey,
        fileName: dto.fileName,
        contentType: dto.contentType,
        fileSize: dto.fileSize,
        courseId: dto.courseId,
        lessonId: dto.lessonId,
        expiresAt,
      },
    });

    return {
      intentId: intent.id,
      ...presigned,
    };
  }

  async assertConfirmedIntent(
    userId: string,
    objectKey: string,
    purpose: UploadPurpose,
  ): Promise<void> {
    const intent = await this.prisma.uploadIntent.findFirst({
      where: {
        userId,
        objectKey,
        purpose:
          purpose === "video"
            ? PrismaUploadPurpose.VIDEO
            : PrismaUploadPurpose.MATERIAL,
        status: UploadIntentStatus.CONFIRMED,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!intent) {
      throw new BadRequestException(
        `Upload intent for object ${objectKey} was not confirmed`,
      );
    }

    if (intent.expiresAt < new Date()) {
      throw new BadRequestException(
        `Upload intent for object ${objectKey} has expired`,
      );
    }

    const stat = await this.storage.statObject(objectKey);

    if (stat.size !== intent.fileSize) {
      throw new BadRequestException("fileSize does not match uploaded object");
    }

    this.validateStoredContentType(purpose, stat.contentType);
  }

  async confirmIntent(userId: string, objectKey: string): Promise<void> {
    const intent = await this.prisma.uploadIntent.findFirst({
      where: {
        userId,
        objectKey,
        status: UploadIntentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!intent) {
      throw new NotFoundException(`Upload intent for ${objectKey} not found`);
    }

    if (intent.expiresAt < new Date()) {
      await this.prisma.uploadIntent.update({
        where: { id: intent.id },
        data: { status: UploadIntentStatus.EXPIRED },
      });
      throw new BadRequestException(
        `Upload intent for ${objectKey} has expired`,
      );
    }

    const purpose: UploadPurpose =
      intent.purpose === PrismaUploadPurpose.VIDEO ? "video" : "material";
    const stat = await this.storage.statObject(objectKey);

    if (stat.size !== intent.fileSize) {
      throw new BadRequestException(
        "Uploaded object size does not match intent",
      );
    }

    this.validateStoredContentType(
      purpose,
      stat.contentType ?? intent.contentType,
    );

    await this.prisma.uploadIntent.update({
      where: { id: intent.id },
      data: { status: UploadIntentStatus.CONFIRMED },
    });
  }

  async expireStaleIntents(): Promise<number> {
    const result = await this.prisma.uploadIntent.updateMany({
      where: {
        status: UploadIntentStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: UploadIntentStatus.EXPIRED },
    });

    return result.count;
  }

  private validateStoredContentType(
    purpose: UploadPurpose,
    contentType: string | null,
  ): void {
    if (!contentType) {
      throw new BadRequestException("Uploaded object is missing content type");
    }

    if (purpose === "video") {
      if (
        !VIDEO_CONTENT_TYPES.includes(
          contentType as (typeof VIDEO_CONTENT_TYPES)[number],
        )
      ) {
        throw new BadRequestException("Unsupported video content type");
      }
      return;
    }

    if (
      !MATERIAL_CONTENT_TYPES.includes(
        contentType as (typeof MATERIAL_CONTENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported material content type");
    }
  }
}
