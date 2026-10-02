import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { StartPracticeDto } from "./dto/start-practice.dto";
import { SubmitPracticeDto } from "./dto/submit-practice.dto";
import { PracticeService } from "./practice.service";

@Controller("practice")
@UseGuards(JwtAuthGuard)
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Get("topics")
  getAvailableTopics(@Req() req: AuthenticatedRequest) {
    return this.practiceService.getAvailableTopics(req.user);
  }

  @Post("session/start")
  startPracticeSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StartPracticeDto,
  ) {
    return this.practiceService.startPracticeSession(req.user, dto);
  }

  @Post("session/submit")
  submitPracticeSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitPracticeDto,
  ) {
    return this.practiceService.submitPracticeSession(req.user, dto);
  }

  @Get("history")
  getPracticeHistory(@Req() req: AuthenticatedRequest) {
    return this.practiceService.getPracticeHistory(req.user);
  }

  @Get("history/unified")
  getUnifiedHistory(@Req() req: AuthenticatedRequest) {
    return this.practiceService.getUnifiedHistory(req.user);
  }
}
