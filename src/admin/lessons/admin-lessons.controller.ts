import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../../auth/types";
import { AdminGuard } from "../guards/admin.guard";
import { AdminLessonsService } from "./admin-lessons.service";
import {
  CreateLessonDto,
  CreateLessonMaterialDto,
  UpdateLessonDto,
  UpdateLessonMaterialDto,
} from "./dto/lesson.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLessonsController {
  constructor(private readonly adminLessonsService: AdminLessonsService) {}

  @Post("courses/:courseId/lessons")
  createLesson(
    @Param("courseId") courseId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLessonDto,
  ) {
    return this.adminLessonsService.createLesson(courseId, req.user.id, dto);
  }

  @Patch("lessons/:lessonId")
  updateLesson(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.adminLessonsService.updateLesson(lessonId, req.user.id, dto);
  }

  @Delete("lessons/:lessonId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLesson(@Param("lessonId") lessonId: string) {
    return this.adminLessonsService.removeLesson(lessonId);
  }

  @Post("lessons/:lessonId/materials")
  createMaterial(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLessonMaterialDto,
  ) {
    return this.adminLessonsService.createMaterial(lessonId, req.user.id, dto);
  }

  @Patch("materials/:materialId")
  updateMaterial(
    @Param("materialId") materialId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateLessonMaterialDto,
  ) {
    return this.adminLessonsService.updateMaterial(
      materialId,
      req.user.id,
      dto,
    );
  }

  @Delete("materials/:materialId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMaterial(@Param("materialId") materialId: string) {
    return this.adminLessonsService.removeMaterial(materialId);
  }
}
