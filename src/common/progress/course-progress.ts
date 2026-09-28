import { CourseEnrollmentStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export async function recalculateAllCourseEnrollmentsProgress(
  prisma: PrismaService,
  courseId: string,
): Promise<void> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    select: { userId: true },
  });

  for (const enrollment of enrollments) {
    await recalculateCourseEnrollmentProgress(
      prisma,
      enrollment.userId,
      courseId,
    );
  }
}

export async function recalculateAllEnrollmentsForUser(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { userId },
    select: { courseId: true },
  });

  for (const enrollment of enrollments) {
    await recalculateCourseEnrollmentProgress(
      prisma,
      userId,
      enrollment.courseId,
    );
  }
}

export async function recalculateCourseEnrollmentProgress(
  prisma: PrismaService,
  userId: string,
  courseId: string,
): Promise<void> {
  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    include: {
      test: {
        select: { id: true },
      },
    },
    orderBy: { order: "asc" },
  });

  if (lessons.length === 0) {
    await prisma.courseEnrollment.updateMany({
      where: { userId, courseId },
      data: {
        progress: 0,
        status: CourseEnrollmentStatus.ACTIVE,
        completedAt: null,
      },
    });
    return;
  }

  const lessonIds = lessons.map((lesson) => lesson.id);
  const progressRows = await prisma.userLessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: lessonIds },
      completed: true,
    },
    select: { lessonId: true },
  });
  const completedLessonIds = new Set(progressRows.map((row) => row.lessonId));

  const testIds = lessons
    .map((lesson) => lesson.test?.id)
    .filter((testId): testId is string => Boolean(testId));

  const passedAttempts =
    testIds.length === 0
      ? []
      : await prisma.testAttempt.findMany({
          where: {
            userId,
            testId: { in: testIds },
            passed: true,
            completedAt: { not: null },
          },
          select: { testId: true },
        });
  const passedTestIds = new Set(
    passedAttempts.map((attempt) => attempt.testId),
  );

  let completedCount = 0;

  for (const lesson of lessons) {
    const lessonCompleted = completedLessonIds.has(lesson.id);
    const testCompleted = lesson.test
      ? passedTestIds.has(lesson.test.id)
      : true;

    if (lessonCompleted && testCompleted) {
      completedCount += 1;
    }
  }

  const progress = Math.round((completedCount / lessons.length) * 100);
  const isCompleted = progress === 100;

  await prisma.courseEnrollment.updateMany({
    where: { userId, courseId },
    data: {
      progress,
      status: isCompleted
        ? CourseEnrollmentStatus.COMPLETED
        : CourseEnrollmentStatus.ACTIVE,
      completedAt: isCompleted ? new Date() : null,
    },
  });
}

export function isLessonCompletedByWatch(
  watchedSeconds: number,
  videoDuration: number,
  thresholdPercent: number,
): boolean {
  if (videoDuration <= 0) {
    return false;
  }

  const thresholdSeconds = Math.ceil((videoDuration * thresholdPercent) / 100);
  return watchedSeconds >= thresholdSeconds;
}
