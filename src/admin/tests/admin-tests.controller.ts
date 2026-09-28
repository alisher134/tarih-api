import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { AdminTestsService } from "./admin-tests.service";
import {
  CreateLessonTestDto,
  CreateQuestionDto,
  UpdateLessonTestDto,
  UpdateQuestionDto,
} from "./dto/test.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTestsController {
  constructor(private readonly adminTestsService: AdminTestsService) {}

  @Post("lessons/:lessonId/test")
  createTest(
    @Param("lessonId") lessonId: string,
    @Body() dto: CreateLessonTestDto,
  ) {
    return this.adminTestsService.createTest(lessonId, dto);
  }

  @Patch("tests/:testId")
  updateTest(
    @Param("testId") testId: string,
    @Body() dto: UpdateLessonTestDto,
  ) {
    return this.adminTestsService.updateTest(testId, dto);
  }

  @Delete("tests/:testId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTest(@Param("testId") testId: string) {
    return this.adminTestsService.removeTest(testId);
  }

  @Post("tests/:testId/questions")
  createQuestion(
    @Param("testId") testId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.adminTestsService.createQuestion(testId, dto);
  }

  @Patch("questions/:questionId")
  updateQuestion(
    @Param("questionId") questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.adminTestsService.updateQuestion(questionId, dto);
  }

  @Delete("questions/:questionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeQuestion(@Param("questionId") questionId: string) {
    return this.adminTestsService.removeQuestion(questionId);
  }
}
