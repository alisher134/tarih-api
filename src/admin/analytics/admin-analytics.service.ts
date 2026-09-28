import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CourseEnrollmentStatus,
  LearningEventType,
  UserSubscriptionStatus,
} from "../../generated/prisma/client";
import {
  formatDateKey,
  median,
  resolveDateRange,
} from "../../common/analytics/analytics.utils";
import { DateRangeQueryDto } from "../../common/analytics/date-range.dto";
import { clampPagination } from "../../common/constants/pagination";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: DateRangeQueryDto) {
    const { from, to, timezone } = resolveDateRange(
      query.from,
      query.to,
      query.timezone,
    );
    const now = new Date();
    const expiringIn7Days = new Date(now.getTime() + 7 * 86_400_000);
    const expiringIn30Days = new Date(now.getTime() + 30 * 86_400_000);

    const [
      newUsers,
      activeUsers,
      activeSubscriptions,
      expiringSubscriptions7,
      expiringSubscriptions30,
      enrollmentsStarted,
      enrollmentsCompleted,
      testAttempts,
      learningEvents,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: from, lte: to }, isAdmin: false },
      }),
      this.prisma.learningEvent.findMany({
        where: { createdAt: { gte: from, lte: to } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now, lte: expiringIn7Days },
        },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now, lte: expiringIn30Days },
        },
      }),
      this.prisma.courseEnrollment.count({
        where: { enrolledAt: { gte: from, lte: to } },
      }),
      this.prisma.courseEnrollment.count({
        where: {
          completedAt: { gte: from, lte: to },
          status: CourseEnrollmentStatus.COMPLETED,
        },
      }),
      this.prisma.testAttempt.findMany({
        where: { completedAt: { gte: from, lte: to } },
        select: { passed: true, score: true },
      }),
      this.prisma.learningEvent.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, userId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const passedAttempts = testAttempts.filter((attempt) => attempt.passed);
    const scores = testAttempts
      .map((attempt) => attempt.score)
      .filter((score): score is number => score != null);

    const dailyUsers = new Map<string, Set<string>>();
    for (const event of learningEvents) {
      const dayKey = formatDateKey(event.createdAt, timezone);
      if (!dailyUsers.has(dayKey)) {
        dailyUsers.set(dayKey, new Set());
      }
      dailyUsers.get(dayKey)!.add(event.userId);
    }

    const dailyActivity = [...dailyUsers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, activeUsers: users.size }));

    return {
      period: { from, to, timezone },
      users: {
        newUsers,
        activeUsers: activeUsers.length,
      },
      subscriptions: {
        active: activeSubscriptions,
        expiringIn7Days: expiringSubscriptions7,
        expiringIn30Days: expiringSubscriptions30,
      },
      learning: {
        enrollmentsStarted,
        enrollmentsCompleted,
      },
      tests: {
        attempts: testAttempts.length,
        passed: passedAttempts.length,
        passRate:
          testAttempts.length === 0
            ? null
            : Math.round((passedAttempts.length / testAttempts.length) * 100),
        averageScore:
          scores.length === 0
            ? null
            : Math.round(
                scores.reduce((sum, score) => sum + score, 0) / scores.length,
              ),
      },
      dailyActivity,
    };
  }

  async getCourses(query: DateRangeQueryDto) {
    const { page, limit } = clampPagination(query.page, query.limit);
    const { from, to } = resolveDateRange(query.from, query.to, query.timezone);

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
        },
      }),
      this.prisma.course.count(),
    ]);

    const data = await Promise.all(
      courses.map(async (course) => {
        const [enrollments, completed, avgProgress, testAttempts] =
          await Promise.all([
            this.prisma.courseEnrollment.count({
              where: {
                courseId: course.id,
                enrolledAt: { gte: from, lte: to },
              },
            }),
            this.prisma.courseEnrollment.count({
              where: {
                courseId: course.id,
                status: CourseEnrollmentStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
              },
            }),
            this.prisma.courseEnrollment.aggregate({
              where: { courseId: course.id },
              _avg: { progress: true },
            }),
            this.prisma.testAttempt.findMany({
              where: {
                completedAt: { gte: from, lte: to },
                test: { lesson: { courseId: course.id } },
              },
              select: { passed: true, score: true },
            }),
          ]);

        const scores = testAttempts
          .map((attempt) => attempt.score)
          .filter((score): score is number => score != null);
        const passedCount = testAttempts.filter((attempt) => attempt.passed);

        return {
          ...course,
          enrollments,
          completed,
          averageProgress: Math.round(avgProgress._avg.progress ?? 0),
          testAttempts: testAttempts.length,
          testPassRate:
            testAttempts.length === 0
              ? null
              : Math.round((passedCount.length / testAttempts.length) * 100),
          averageTestScore:
            scores.length === 0
              ? null
              : Math.round(
                  scores.reduce((sum, score) => sum + score, 0) / scores.length,
                ),
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getCourseDetail(courseId: string, query: DateRangeQueryDto) {
    const { from, to } = resolveDateRange(query.from, query.to, query.timezone);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, slug: true, status: true },
    });

    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        order: true,
        test: { select: { id: true } },
      },
    });

    const [enrolled, started, completedCourse, avgProgress, lessonMetrics] =
      await Promise.all([
        this.prisma.courseEnrollment.count({
          where: { courseId, enrolledAt: { gte: from, lte: to } },
        }),
        this.prisma.learningEvent.findMany({
          where: {
            courseId,
            type: LearningEventType.COURSE_STARTED,
            createdAt: { gte: from, lte: to },
          },
          distinct: ["userId"],
          select: { userId: true },
        }),
        this.prisma.courseEnrollment.count({
          where: {
            courseId,
            status: CourseEnrollmentStatus.COMPLETED,
            completedAt: { gte: from, lte: to },
          },
        }),
        this.prisma.courseEnrollment.aggregate({
          where: { courseId },
          _avg: { progress: true },
        }),
        Promise.all(
          lessons.map(async (lesson) => {
            const [startedCount, completedCount, avgWatch] = await Promise.all([
              this.prisma.userLessonProgress.count({
                where: { lessonId: lesson.id, watchedSeconds: { gt: 0 } },
              }),
              this.prisma.userLessonProgress.count({
                where: { lessonId: lesson.id, completed: true },
              }),
              this.prisma.userLessonProgress.aggregate({
                where: { lessonId: lesson.id },
                _avg: { watchedSeconds: true },
              }),
            ]);

            let testPassRate: number | null = null;
            if (lesson.test) {
              const attempts = await this.prisma.testAttempt.findMany({
                where: {
                  testId: lesson.test.id,
                  completedAt: { gte: from, lte: to },
                },
                select: { passed: true },
              });
              const passed = attempts.filter(
                (attempt) => attempt.passed,
              ).length;
              testPassRate =
                attempts.length === 0
                  ? null
                  : Math.round((passed / attempts.length) * 100);
            }

            return {
              lessonId: lesson.id,
              title: lesson.title,
              order: lesson.order,
              hasTest: lesson.test != null,
              startedCount,
              completedCount,
              averageWatchedSeconds: Math.round(
                avgWatch._avg.watchedSeconds ?? 0,
              ),
              testPassRate,
            };
          }),
        ),
      ]);

    return {
      course,
      funnel: {
        enrolled,
        started: started.length,
        completed: completedCourse,
      },
      averageProgress: Math.round(avgProgress._avg.progress ?? 0),
      lessons: lessonMetrics,
    };
  }

  async getTestDetail(testId: string, query: DateRangeQueryDto) {
    const { from, to } = resolveDateRange(query.from, query.to, query.timezone);

    const test = await this.prisma.lessonTest.findUnique({
      where: { id: testId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            course: { select: { id: true, title: true } },
          },
        },
        questions: {
          orderBy: { order: "asc" },
          select: { id: true, text: true, order: true },
        },
      },
    });

    if (!test) {
      throw new NotFoundException(`Test ${testId} not found`);
    }

    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        testId,
        completedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        userId: true,
        score: true,
        passed: true,
      },
    });

    const uniqueUsers = new Set(attempts.map((attempt) => attempt.userId));
    const scores = attempts
      .map((attempt) => attempt.score)
      .filter((score): score is number => score != null);
    const passedCount = attempts.filter((attempt) => attempt.passed).length;

    const questionStats = await Promise.all(
      test.questions.map(async (question) => {
        const answers = await this.prisma.testAnswer.findMany({
          where: {
            questionId: question.id,
            attempt: {
              testId,
              completedAt: { gte: from, lte: to },
            },
          },
          select: { isCorrect: true },
        });

        const correct = answers.filter((answer) => answer.isCorrect).length;

        return {
          questionId: question.id,
          text: question.text,
          order: question.order,
          answers: answers.length,
          correctRate:
            answers.length === 0
              ? null
              : Math.round((correct / answers.length) * 100),
        };
      }),
    );

    return {
      test: {
        id: test.id,
        title: test.title,
        lesson: test.lesson,
      },
      attempts: attempts.length,
      uniqueUsers: uniqueUsers.size,
      passRate:
        attempts.length === 0
          ? null
          : Math.round((passedCount / attempts.length) * 100),
      averageScore:
        scores.length === 0
          ? null
          : Math.round(
              scores.reduce((sum, score) => sum + score, 0) / scores.length,
            ),
      medianScore: median(scores),
      questions: questionStats,
    };
  }

  async getSubscriptions(query: DateRangeQueryDto) {
    const { from, to } = resolveDateRange(query.from, query.to, query.timezone);
    const now = new Date();
    const expiringIn7Days = new Date(now.getTime() + 7 * 86_400_000);
    const expiringIn30Days = new Date(now.getTime() + 30 * 86_400_000);

    const [
      active,
      cancelled,
      expired,
      grantedInPeriod,
      expiring7,
      expiring30,
      byPlan,
    ] = await Promise.all([
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.CANCELLED,
          cancelledAt: { gte: from, lte: to },
        },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.EXPIRED,
          expiresAt: { gte: from, lte: to },
        },
      }),
      this.prisma.userSubscription.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now, lte: expiringIn7Days },
        },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: UserSubscriptionStatus.ACTIVE,
          expiresAt: { gt: now, lte: expiringIn30Days },
        },
      }),
      this.prisma.userSubscription.groupBy({
        by: ["planId"],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { id: { in: byPlan.map((item) => item.planId) } },
      select: { id: true, slug: true, title: true },
    });
    const planMap = new Map(plans.map((plan) => [plan.id, plan]));

    return {
      period: { from, to },
      totals: {
        active,
        cancelled,
        expired,
        grantedInPeriod,
        expiringIn7Days: expiring7,
        expiringIn30Days: expiring30,
      },
      byPlan: byPlan.map((item) => ({
        plan: planMap.get(item.planId) ?? { id: item.planId },
        count: item._count._all,
      })),
    };
  }
}
