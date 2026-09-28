import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { DateRangeQueryDto } from "../../common/analytics/date-range.dto";
import { AdminGuard } from "../guards/admin.guard";
import { AdminAnalyticsService } from "./admin-analytics.service";

@Controller("admin/analytics")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get("overview")
  getOverview(@Query() query: DateRangeQueryDto) {
    return this.adminAnalyticsService.getOverview(query);
  }

  @Get("courses")
  getCourses(@Query() query: DateRangeQueryDto) {
    return this.adminAnalyticsService.getCourses(query);
  }

  @Get("courses/:courseId")
  getCourseDetail(
    @Param("courseId") courseId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.adminAnalyticsService.getCourseDetail(courseId, query);
  }

  @Get("tests/:testId")
  getTestDetail(
    @Param("testId") testId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.adminAnalyticsService.getTestDetail(testId, query);
  }

  @Get("subscriptions")
  getSubscriptions(@Query() query: DateRangeQueryDto) {
    return this.adminAnalyticsService.getSubscriptions(query);
  }
}
