import { BadRequestException } from "@nestjs/common";
import {
  CourseEnrollmentStatus,
  CourseStatus,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export async function ensureCourseEnrollment(
  prisma: PrismaService,
  userId: string,
  courseId: string,
): Promise<{ id: string; isNew: boolean }> {
  const existing = await prisma.courseEnrollment.findUnique({
    where: {
      userId_courseId: { userId, courseId },
    },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });

  if (!course || course.status !== CourseStatus.PUBLISHED) {
    throw new BadRequestException(
      `Course ${courseId} is not available for enrollment`,
    );
  }

  try {
    const enrollment = await prisma.courseEnrollment.create({
      data: {
        userId,
        courseId,
        lastActivityAt: new Date(),
      },
    });

    return { id: enrollment.id, isNew: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const retry = await prisma.courseEnrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId, courseId } },
        select: { id: true },
      });
      return { id: retry.id, isNew: false };
    }

    throw error;
  }
}

export async function touchEnrollmentActivity(
  prisma: PrismaService,
  userId: string,
  courseId: string,
): Promise<void> {
  await prisma.courseEnrollment.updateMany({
    where: { userId, courseId },
    data: { lastActivityAt: new Date() },
  });
}

export async function mergeCourseEnrollments(
  tx: Prisma.TransactionClient,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const stubEnrollments = await tx.courseEnrollment.findMany({
    where: { userId: fromUserId },
  });

  for (const enrollment of stubEnrollments) {
    const existing = await tx.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: toUserId,
          courseId: enrollment.courseId,
        },
      },
    });

    if (existing) {
      await tx.courseEnrollment.update({
        where: { id: existing.id },
        data: {
          progress: Math.max(existing.progress, enrollment.progress),
          lastActivityAt:
            existing.lastActivityAt > enrollment.lastActivityAt
              ? existing.lastActivityAt
              : enrollment.lastActivityAt,
          status:
            existing.status === CourseEnrollmentStatus.COMPLETED ||
            enrollment.status === CourseEnrollmentStatus.COMPLETED
              ? CourseEnrollmentStatus.COMPLETED
              : existing.status,
          completedAt: existing.completedAt ?? enrollment.completedAt,
        },
      });
      await tx.courseEnrollment.delete({ where: { id: enrollment.id } });
      continue;
    }

    await tx.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { userId: toUserId },
    });
  }
}

export async function mergeLessonProgress(
  tx: Prisma.TransactionClient,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const stubProgress = await tx.userLessonProgress.findMany({
    where: { userId: fromUserId },
  });

  for (const progress of stubProgress) {
    const existing = await tx.userLessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: toUserId,
          lessonId: progress.lessonId,
        },
      },
    });

    if (existing) {
      await tx.userLessonProgress.update({
        where: { id: existing.id },
        data: {
          watchedSeconds: Math.max(
            existing.watchedSeconds,
            progress.watchedSeconds,
          ),
          completed: existing.completed || progress.completed,
          completedAt: existing.completedAt ?? progress.completedAt,
        },
      });
      await tx.userLessonProgress.delete({ where: { id: progress.id } });
      continue;
    }

    await tx.userLessonProgress.update({
      where: { id: progress.id },
      data: { userId: toUserId },
    });
  }
}

export async function mergeCourseFavorites(
  tx: Prisma.TransactionClient,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const stubFavorites = await tx.courseFavorite.findMany({
    where: { userId: fromUserId },
  });

  for (const favorite of stubFavorites) {
    const existing = await tx.courseFavorite.findUnique({
      where: {
        userId_courseId: {
          userId: toUserId,
          courseId: favorite.courseId,
        },
      },
    });

    if (existing) {
      await tx.courseFavorite.delete({ where: { id: favorite.id } });
      continue;
    }

    await tx.courseFavorite.update({
      where: { id: favorite.id },
      data: { userId: toUserId },
    });
  }
}
