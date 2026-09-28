import { Injectable } from "@nestjs/common";
import {
  CourseEnrollmentStatus,
  LearningEventType,
} from "../generated/prisma/client";
import {
  calculateStreak,
  formatDateKey,
  resolveDateRange,
} from "../common/analytics/analytics.utils";
import { DateRangeQueryDto } from "../common/analytics/date-range.dto";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getUserOverview(userId: string, query: DateRangeQueryDto) {
    const { from, to, timezone } = resolveDateRange(
      query.from,
      query.to,
      query.timezone,
    );

    const [
      enrollments,
      lessonProgress,
      testAttempts,
      learningEvents,
      subscription,
    ] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where: { userId },
        select: { status: true, progress: true },
      }),
      this.prisma.userLessonProgress.findMany({
        where: { userId },
        select: { completed: true, watchedSeconds: true },
      }),
      this.prisma.testAttempt.findMany({
        where: {
          userId,
          completedAt: { gte: from, lte: to },
        },
        select: { score: true, passed: true },
      }),
      this.prisma.learningEvent.findMany({
        where: {
          userId,
          createdAt: { gte: from, lte: to },
          type: {
            in: [
              LearningEventType.LESSON_PROGRESS,
              LearningEventType.LESSON_COMPLETED,
              LearningEventType.TEST_STARTED,
              LearningEventType.TEST_SUBMITTED,
            ],
          },
        },
        select: { createdAt: true, watchedDeltaSeconds: true },
        orderBy: { createdAt: "asc" },
      }),
      this.subscriptionsService.getCurrentSubscription(userId),
    ]);

    const activeCourses = enrollments.filter(
      (item) => item.status === CourseEnrollmentStatus.ACTIVE,
    ).length;
    const completedCourses = enrollments.filter(
      (item) => item.status === CourseEnrollmentStatus.COMPLETED,
    ).length;
    const completedLessons = lessonProgress.filter(
      (item) => item.completed,
    ).length;
    const watchedSecondsTotal = lessonProgress.reduce(
      (sum, item) => sum + item.watchedSeconds,
      0,
    );

    const scores = testAttempts
      .map((attempt) => attempt.score)
      .filter((score): score is number => score != null);
    const passedAttempts = testAttempts.filter((attempt) => attempt.passed);

    const dailyActivity = new Map<string, number>();
    const activeDayKeys = new Set<string>();

    for (const event of learningEvents) {
      const dayKey = formatDateKey(event.createdAt, timezone);
      activeDayKeys.add(dayKey);
      dailyActivity.set(
        dayKey,
        (dailyActivity.get(dayKey) ?? 0) + event.watchedDeltaSeconds,
      );
    }

    const dailyActivityList = [...dailyActivity.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, watchedSeconds]) => ({ date, watchedSeconds }));

    return {
      period: { from, to, timezone },
      courses: {
        active: activeCourses,
        completed: completedCourses,
        total: enrollments.length,
      },
      lessons: {
        completed: completedLessons,
        totalTracked: lessonProgress.length,
        watchedSecondsTotal,
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
      streakDays: calculateStreak(activeDayKeys, timezone),
      dailyActivity: dailyActivityList,
      subscription,
    };
  }
}
