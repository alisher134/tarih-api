import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { UpdateLessonProgressDto } from "./dto/update-lesson-progress.dto";
import { LessonsService } from "./lessons.service";

@Controller()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get("lessons/:lessonId/playback-url")
  @UseGuards(JwtAuthGuard)
  getPlaybackUrl(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonsService.getPlaybackUrl(req.user, lessonId);
  }

  @Get("lessons/:lessonId/materials")
  @UseGuards(JwtAuthGuard)
  listMaterials(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonsService.listMaterials(req.user, lessonId);
  }

  @Get("materials/:materialId/download-url")
  @UseGuards(JwtAuthGuard)
  getMaterialDownloadUrl(
    @Param("materialId") materialId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonsService.getMaterialDownloadUrl(req.user, materialId);
  }

  @Patch("lessons/:lessonId/progress")
  @UseGuards(JwtAuthGuard)
  updateProgress(
    @Param("lessonId") lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonsService.updateProgress(req.user, lessonId, dto);
  }

  @Get("lessons/:lessonId/progress")
  @UseGuards(JwtAuthGuard)
  getProgress(
    @Param("lessonId") lessonId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonsService.getProgress(req.user, lessonId);
  }
}
