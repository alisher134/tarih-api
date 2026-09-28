import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CourseEnrollmentStatus,
  CourseStatus,
} from "../generated/prisma/client";
import { CourseAccessService } from "../common/access/course-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { PublicUser } from "../users/users.service";
import {
  countCompletedLessons,
  resolveLearningState,
  type LessonProgressMap,
} from "./learning.utils";

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getContinueLearning(user: PublicUser) {
    const hasAccess =
      user.isAdmin ||
      (await this.subscriptionsService.hasActiveSubscription(user.id));

    if (!hasAccess) {
      return null;
    }

    const enrollment = await this.prisma.courseEnrollment.findFirst({
      where: {
        userId: user.id,
        status: CourseEnrollmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED },
      },
      orderBy: { lastActivityAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });

    if (enrollment) {
      const courseContext = await this.loadCourseLearningContext(
        user.id,
        enrollment.courseId,
      );

      if (courseContext.state) {
        return {
          course: {
            id: enrollment.course.id,
            title: enrollment.course.title,
            slug: enrollment.course.slug,
            progress: enrollment.progress,
          },
          lesson: courseContext.state.lesson,
          nextAction: courseContext.state.nextAction,
        };
      }
    }

    const firstCourse = await this.prisma.course.findFirst({
      where: { status: CourseStatus.PUBLISHED },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        slug: true,
      },
    });

    if (!firstCourse) {
      return null;
    }

    const courseContext = await this.loadCourseLearningContext(
      user.id,
      firstCourse.id,
    );

    if (!courseContext.state) {
      return null;
    }

    return {
      course: {
        id: firstCourse.id,
        title: firstCourse.title,
        slug: firstCourse.slug,
        progress: 0,
      },
      lesson: courseContext.state.lesson,
      nextAction: courseContext.state.nextAction,
    };
  }

  async getCourseLearningSummary(user: PublicUser, courseId: string) {
    await this.courseAccess.assertCourseContentAccess(user, courseId);

    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, slug: true, status: true },
    });

    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    const context = await this.loadCourseLearningContext(user.id, courseId);
    const testStats = await this.getCourseTestStats(user.id, courseId);

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
      },
      enrollment: enrollment
        ? {
            progress: enrollment.progress,
            status: enrollment.status,
            enrolledAt: enrollment.enrolledAt,
            lastActivityAt: enrollment.lastActivityAt,
            completedAt: enrollment.completedAt,
          }
        : null,
      lessonsTotal: context.lessons.length,
      lessonsCompleted: context.completedLessons,
      testsTotal: context.testsTotal,
      testsPassed: context.testsPassed,
      watchedSecondsTotal: context.watchedSecondsTotal,
      averageTestScore: testStats.averageScore,
      testPassRate: testStats.passRate,
      currentLesson: context.state?.lesson ?? null,
      nextAction: context.state?.nextAction ?? null,
    };
  }

  private async loadCourseLearningContext(userId: string, courseId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        order: true,
        videoDuration: true,
        test: { select: { id: true } },
      },
    });

    const lessonIds = lessons.map((lesson) => lesson.id);
    const progressRows =
      lessonIds.length === 0
        ? []
        : await this.prisma.userLessonProgress.findMany({
            where: { userId, lessonId: { in: lessonIds } },
            select: {
              lessonId: true,
              watchedSeconds: true,
              completed: true,
            },
          });

    const progressMap: LessonProgressMap = new Map(
      progressRows.map((row) => [
        row.lessonId,
        { watchedSeconds: row.watchedSeconds, completed: row.completed },
      ]),
    );

    const testIds = lessons
      .map((lesson) => lesson.test?.id)
      .filter((testId): testId is string => Boolean(testId));

    const passedAttempts =
      testIds.length === 0
        ? []
        : await this.prisma.testAttempt.findMany({
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

    const completedLessons = countCompletedLessons(
      lessons,
      progressMap,
      passedTestIds,
    );
    const testsTotal = testIds.length;
    const testsPassed = passedTestIds.size;
    const watchedSecondsTotal = progressRows.reduce(
      (sum, row) => sum + row.watchedSeconds,
      0,
    );

    return {
      lessons,
      completedLessons,
      testsTotal,
      testsPassed,
      watchedSecondsTotal,
      state: resolveLearningState(lessons, progressMap, passedTestIds),
    };
  }

  private async getCourseTestStats(userId: string, courseId: string) {
    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        userId,
        completedAt: { not: null },
        test: { lesson: { courseId } },
      },
      select: { score: true, passed: true },
    });

    if (attempts.length === 0) {
      return { averageScore: null, passRate: null };
    }

    const scores = attempts
      .map((attempt) => attempt.score)
      .filter((score): score is number => score != null);
    const passedCount = attempts.filter((attempt) => attempt.passed).length;

    return {
      averageScore:
        scores.length === 0
          ? null
          : Math.round(
              scores.reduce((sum, score) => sum + score, 0) / scores.length,
            ),
      passRate: Math.round((passedCount / attempts.length) * 100),
    };
  }
}
