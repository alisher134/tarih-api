import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CourseStatus } from "../../generated/prisma/client";
import { recalculateAllCourseEnrollmentsProgress } from "../../common/progress/course-progress";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageCleanupService } from "../../storage/storage-cleanup.service";
import { AdminUploadsService } from "../uploads/admin-uploads.service";
import type {
  CreateLessonDto,
  CreateLessonMaterialDto,
  UpdateLessonDto,
  UpdateLessonMaterialDto,
} from "./dto/lesson.dto";

@Injectable()
export class AdminLessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageCleanup: StorageCleanupService,
    private readonly adminUploadsService: AdminUploadsService,
  ) {}

  async createLesson(courseId: string, userId: string, dto: CreateLessonDto) {
    await this.ensureCourseExists(courseId);
    await this.adminUploadsService.assertConfirmedIntent(
      userId,
      dto.videoObjectKey,
      "video",
    );

    const lesson = await this.prisma.lesson.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description ?? "",
        videoObjectKey: dto.videoObjectKey,
        videoDuration: dto.videoDuration,
        order: dto.order ?? 0,
      },
    });

    await this.recalcIfPublishedCourse(courseId);

    return lesson;
  }

  async updateLesson(lessonId: string, userId: string, dto: UpdateLessonDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("At least one field must be provided");
    }

    const lesson = await this.findLesson(lessonId);
    let previousVideoKey: string | null = null;

    if (dto.videoObjectKey !== undefined) {
      await this.adminUploadsService.assertConfirmedIntent(
        userId,
        dto.videoObjectKey,
        "video",
      );
      previousVideoKey = lesson.videoObjectKey;
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.videoObjectKey !== undefined
          ? { videoObjectKey: dto.videoObjectKey }
          : {}),
        ...(dto.videoDuration !== undefined
          ? { videoDuration: dto.videoDuration }
          : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });

    if (previousVideoKey && previousVideoKey !== updated.videoObjectKey) {
      this.storageCleanup.scheduleDelete([previousVideoKey]);
    }

    return updated;
  }

  async removeLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { materials: true },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    const objectKeys = [
      lesson.videoObjectKey,
      ...lesson.materials.map((material) => material.fileObjectKey),
    ];

    const courseId = lesson.courseId;

    await this.prisma.lesson.delete({ where: { id: lessonId } });
    this.storageCleanup.scheduleDelete(objectKeys);

    await this.recalcIfPublishedCourse(courseId);
  }

  async createMaterial(
    lessonId: string,
    userId: string,
    dto: CreateLessonMaterialDto,
  ) {
    await this.findLesson(lessonId);
    await this.adminUploadsService.assertConfirmedIntent(
      userId,
      dto.fileObjectKey,
      "material",
    );

    return this.prisma.lessonMaterial.create({
      data: {
        lessonId,
        title: dto.title,
        type: dto.type,
        fileObjectKey: dto.fileObjectKey,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        order: dto.order ?? 0,
      },
    });
  }

  async updateMaterial(
    materialId: string,
    userId: string,
    dto: UpdateLessonMaterialDto,
  ) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("At least one field must be provided");
    }

    const material = await this.findMaterial(materialId);
    let previousFileKey: string | null = null;

    if (dto.fileObjectKey !== undefined) {
      await this.adminUploadsService.assertConfirmedIntent(
        userId,
        dto.fileObjectKey,
        "material",
      );
      previousFileKey = material.fileObjectKey;
    }

    const updated = await this.prisma.lessonMaterial.update({
      where: { id: materialId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.fileObjectKey !== undefined
          ? { fileObjectKey: dto.fileObjectKey }
          : {}),
        ...(dto.fileName !== undefined ? { fileName: dto.fileName } : {}),
        ...(dto.fileSize !== undefined ? { fileSize: dto.fileSize } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });

    if (previousFileKey && previousFileKey !== updated.fileObjectKey) {
      this.storageCleanup.scheduleDelete([previousFileKey]);
    }

    return updated;
  }

  async removeMaterial(materialId: string) {
    const material = await this.findMaterial(materialId);
    await this.prisma.lessonMaterial.delete({ where: { id: materialId } });
    this.storageCleanup.scheduleDelete([material.fileObjectKey]);
  }

  private async recalcIfPublishedCourse(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { status: true },
    });

    if (course?.status !== CourseStatus.PUBLISHED) {
      return;
    }

    await recalculateAllCourseEnrollmentsProgress(this.prisma, courseId);
  }

  private async ensureCourseExists(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }
  }

  private async findLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    return lesson;
  }

  private async findMaterial(materialId: string) {
    const material = await this.prisma.lessonMaterial.findUnique({
      where: { id: materialId },
    });

    if (!material) {
      throw new NotFoundException(`Material ${materialId} not found`);
    }

    return material;
  }
}
