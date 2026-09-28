import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { DateRangeQueryDto } from "../common/analytics/date-range.dto";
import { AnalyticsService } from "./analytics.service";

@Controller("me/analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  getOverview(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.analyticsService.getUserOverview(req.user.id, query);
  }
}
