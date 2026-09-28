import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { LearningService } from "./learning.service";

@Controller()
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get("me/learning/continue")
  @UseGuards(JwtAuthGuard)
  getContinueLearning(@Req() req: AuthenticatedRequest) {
    return this.learningService.getContinueLearning(req.user);
  }

  @Get("courses/:courseId/learning-summary")
  @UseGuards(JwtAuthGuard)
  getCourseLearningSummary(
    @Param("courseId") courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.learningService.getCourseLearningSummary(req.user, courseId);
  }
}
