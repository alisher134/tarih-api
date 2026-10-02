import { Injectable, NotFoundException } from "@nestjs/common";
import { CourseStatus } from "../../generated/prisma/client";
import { API_ERROR_CODE } from "../errors/api-error-codes";
import { ForbiddenApiException } from "../errors/forbidden-api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import type { PublicUser } from "../../users/users.service";

@Injectable()
export class CourseAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async assertCourseContentAccess(
    user: PublicUser,
    courseId: string,
  ): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true },
    });

    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    if (user.isAdmin) {
      return;
    }

    if (course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    if (await this.subscriptionsService.hasActiveSubscription(user.id)) {
      return;
    }

    throw new ForbiddenApiException(
      API_ERROR_CODE.ACTIVE_SUBSCRIPTION_REQUIRED,
      "Active subscription required",
    );
  }

  async assertLessonPlaybackAccess(
    user: PublicUser,
    lessonId: string,
  ): Promise<{ lessonId: string; courseId: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        courseId: true,
        order: true,
        course: {
          select: { status: true },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (user.isAdmin) {
      return { lessonId: lesson.id, courseId: lesson.courseId };
    }

    if (lesson.course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (!(await this.subscriptionsService.hasActiveSubscription(user.id))) {
      throw new ForbiddenApiException(
        API_ERROR_CODE.ACTIVE_SUBSCRIPTION_REQUIRED,
        "Active subscription required",
      );
    }

    const previousLessons = await this.prisma.lesson.findMany({
      where: { courseId: lesson.courseId, order: { lt: lesson.order } },
      select: { id: true, test: { select: { id: true } } },
    });

    if (previousLessons.length > 0) {
      const lessonIds = previousLessons.map((l) => l.id);
      const testIds = previousLessons
        .map((l) => l.test?.id)
        .filter((id): id is string => Boolean(id));

      const progressRows = await this.prisma.userLessonProgress.findMany({
        where: { userId: user.id, lessonId: { in: lessonIds } },
        select: { lessonId: true, completed: true },
      });
      const completedMap = new Map(
        progressRows.map((r) => [r.lessonId, r.completed]),
      );

      let passedTestIds = new Set<string>();
      if (testIds.length > 0) {
        const attempts = await this.prisma.testAttempt.findMany({
          where: {
            userId: user.id,
            testId: { in: testIds },
            passed: true,
            completedAt: { not: null },
          },
          select: { testId: true },
        });
        passedTestIds = new Set(attempts.map((a) => a.testId));
      }

      for (const prev of previousLessons) {
        const isVideoCompleted = completedMap.get(prev.id) === true;
        const isTestCompleted = prev.test
          ? passedTestIds.has(prev.test.id)
          : true;

        if (!isVideoCompleted || !isTestCompleted) {
          throw new ForbiddenApiException(
            API_ERROR_CODE.LESSON_NOT_COMPLETED,
            "Previous lesson must be completed",
          );
        }
      }
    }

    return { lessonId: lesson.id, courseId: lesson.courseId };
  }

  async assertMaterialDownloadAccess(
    user: PublicUser,
    materialId: string,
  ): Promise<void> {
    const material = await this.prisma.lessonMaterial.findUnique({
      where: { id: materialId },
      select: { lessonId: true },
    });

    if (!material) {
      throw new NotFoundException(`Material ${materialId} not found`);
    }

    await this.assertLessonPlaybackAccess(user, material.lessonId);
  }
}
