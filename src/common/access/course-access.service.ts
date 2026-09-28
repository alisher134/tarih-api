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

    if (await this.subscriptionsService.hasActiveSubscription(user.id)) {
      return { lessonId: lesson.id, courseId: lesson.courseId };
    }

    throw new ForbiddenApiException(
      API_ERROR_CODE.ACTIVE_SUBSCRIPTION_REQUIRED,
      "Active subscription required",
    );
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
