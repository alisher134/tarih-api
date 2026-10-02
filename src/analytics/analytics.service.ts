import { Injectable } from "@nestjs/common";
import { CourseEnrollmentStatus } from "../generated/prisma/client";
import { resolveDateRange } from "../common/analytics/analytics.utils";
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

    const [enrollments, lessonProgress, subscription] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where: { userId },
        select: { status: true, progress: true },
      }),
      this.prisma.userLessonProgress.findMany({
        where: { userId },
        select: { completed: true },
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
      },
      subscription,
    };
  }
}
