import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { SaveTestAttemptDraftDto } from "./dto/save-test-attempt-draft.dto";
import { SubmitTestAttemptDto } from "./dto/submit-test-attempt.dto";
import { TestsService } from "./tests.service";

@Controller()
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get("lessons/:lessonId/test")
  @UseGuards(JwtAuthGuard)
  getTestByLesson(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.getTestByLessonId(req.user, lessonId);
  }

  @Get("tests/:testId")
  @UseGuards(JwtAuthGuard)
  getTest(@Param("testId") testId: string, @Req() req: AuthenticatedRequest) {
    return this.testsService.getTestForStudent(req.user, testId);
  }

  @Post("tests/:testId/attempts")
  @UseGuards(JwtAuthGuard)
  startAttempt(
    @Param("testId") testId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.startAttempt(req.user, testId);
  }

  @Get("tests/:testId/attempts/active")
  @UseGuards(JwtAuthGuard)
  getActiveAttempt(
    @Param("testId") testId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.getActiveAttempt(req.user, testId);
  }

  @Get("test-attempts/:attemptId/draft")
  @UseGuards(JwtAuthGuard)
  getAttemptDraft(
    @Param("attemptId") attemptId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.getAttemptDraft(req.user, attemptId);
  }

  @Put("test-attempts/:attemptId/draft")
  @UseGuards(JwtAuthGuard)
  saveAttemptDraft(
    @Param("attemptId") attemptId: string,
    @Body() dto: SaveTestAttemptDraftDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.saveAttemptDraft(req.user, attemptId, dto);
  }

  @Post("test-attempts/:attemptId/submit")
  @UseGuards(JwtAuthGuard)
  submitAttempt(
    @Param("attemptId") attemptId: string,
    @Body() dto: SubmitTestAttemptDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testsService.submitAttempt(req.user, attemptId, dto);
  }
}
