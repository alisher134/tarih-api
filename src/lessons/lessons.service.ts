import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CourseAccessService } from "../common/access/course-access.service";
import {
  ensureCourseEnrollment,
  touchEnrollmentActivity,
} from "../common/enrollment/ensure-enrollment";
import {
  isLessonCompletedByWatch,
  recalculateCourseEnrollmentProgress,
} from "../common/progress/course-progress";
import { LearningEventsService } from "../learning-events/learning-events.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { PublicUser } from "../users/users.service";
import type { UpdateLessonProgressDto } from "./dto/update-lesson-progress.dto";

@Injectable()
export class LessonsService {
  private readonly completionThresholdPercent: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly courseAccess: CourseAccessService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly learningEvents: LearningEventsService,
    config: ConfigService,
  ) {
    this.completionThresholdPercent = Number(
      config.get<string>("LESSON_COMPLETION_THRESHOLD_PERCENT") ?? "90",
    );
  }

  async getPlaybackUrl(user: PublicUser, lessonId: string) {
    await this.courseAccess.assertLessonPlaybackAccess(user, lessonId);

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { videoObjectKey: true },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (!lesson.videoObjectKey) {
      throw new NotFoundException(`Lesson ${lessonId} has no video`);
    }

    const presigned = await this.storage.createPresignedDownload(
      lesson.videoObjectKey,
    );

    return {
      lessonId,
      ...presigned,
    };
  }

  async listMaterials(user: PublicUser, lessonId: string) {
    await this.courseAccess.assertLessonPlaybackAccess(user, lessonId);

    return this.prisma.lessonMaterial.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        fileName: true,
        fileSize: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getMaterialDownloadUrl(user: PublicUser, materialId: string) {
    await this.courseAccess.assertMaterialDownloadAccess(user, materialId);

    const material = await this.prisma.lessonMaterial.findUnique({
      where: { id: materialId },
      select: { fileObjectKey: true },
    });

    if (!material) {
      throw new NotFoundException(`Material ${materialId} not found`);
    }

    const presigned = await this.storage.createPresignedDownload(
      material.fileObjectKey,
    );

    return {
      materialId,
      ...presigned,
    };
  }

  async updateProgress(
    user: PublicUser,
    lessonId: string,
    dto: UpdateLessonProgressDto,
  ) {
    const access = await this.courseAccess.assertLessonPlaybackAccess(
      user,
      lessonId,
    );

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        courseId: true,
        videoDuration: true,
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    await this.ensureEnrollmentForProgress(user, lesson.courseId);

    const previousProgress = await this.prisma.userLessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: user.id,
          lessonId,
        },
      },
      select: { watchedSeconds: true, completed: true, completedAt: true },
    });

    const previousWatchedSeconds = previousProgress?.watchedSeconds ?? 0;
    const watchedSeconds = lesson.videoDuration
      ? Math.min(
          Math.max(dto.watchedSeconds, previousWatchedSeconds),
          lesson.videoDuration,
        )
      : Math.max(dto.watchedSeconds, previousWatchedSeconds);
    const watchedDeltaSeconds = Math.max(
      0,
      watchedSeconds - previousWatchedSeconds,
    );

    const completedByThreshold = lesson.videoDuration
      ? isLessonCompletedByWatch(
          watchedSeconds,
          lesson.videoDuration,
          this.completionThresholdPercent,
        )
      : false;
    const completed =
      previousProgress?.completed === true || completedByThreshold;
    const completedAt = completed
      ? (previousProgress?.completedAt ?? new Date())
      : null;

    const progress = await this.prisma.userLessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: user.id,
          lessonId,
        },
      },
      create: {
        userId: user.id,
        lessonId,
        watchedSeconds,
        completed,
        completedAt,
      },
      update: {
        watchedSeconds,
        completed,
        completedAt,
      },
    });

    if (watchedDeltaSeconds > 0) {
      await this.learningEvents.recordLessonProgress(
        user.id,
        lesson.courseId,
        lessonId,
        watchedDeltaSeconds,
      );
    }

    const completionChanged =
      previousProgress?.completed !== progress.completed;

    if (completionChanged && progress.completed) {
      await this.learningEvents.recordLessonCompleted(
        user.id,
        lesson.courseId,
        lessonId,
      );
    }

    await touchEnrollmentActivity(this.prisma, user.id, access.courseId);

    if (completionChanged) {
      await recalculateCourseEnrollmentProgress(
        this.prisma,
        user.id,
        access.courseId,
      );
    }

    return progress;
  }

  async getProgress(user: PublicUser, lessonId: string) {
    await this.courseAccess.assertLessonPlaybackAccess(user, lessonId);

    return this.prisma.userLessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: user.id,
          lessonId,
        },
      },
    });
  }

  private async ensureEnrollmentForProgress(
    user: PublicUser,
    courseId: string,
  ): Promise<void> {
    const existing = await this.prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId },
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    const hasSubscription =
      await this.subscriptionsService.hasActiveSubscription(user.id);

    if (!hasSubscription) {
      return;
    }

    const { isNew } = await ensureCourseEnrollment(
      this.prisma,
      user.id,
      courseId,
    );

    if (isNew) {
      await this.learningEvents.recordCourseStarted(user.id, courseId);
    }
  }
}
