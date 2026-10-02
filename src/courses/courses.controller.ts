import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { CoursesService } from "./courses.service";
import { ListCoursesQueryDto } from "./dto/list-courses-query.dto";

@Controller("courses")
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findPublished(@Query() query: ListCoursesQueryDto) {
    return this.coursesService.findPublished(query);
  }

  @Get("my")
  @UseGuards(JwtAuthGuard)
  findMy(@Req() req: AuthenticatedRequest) {
    return this.coursesService.findMyCourses(req.user);
  }

  @Get("favorites")
  @UseGuards(JwtAuthGuard)
  findFavorites(@Req() req: AuthenticatedRequest) {
    return this.coursesService.findFavorites(req.user.id);
  }

  @Get(":slug")
  @UseGuards(OptionalJwtAuthGuard)
  findBySlug(@Param("slug") slug: string, @Req() req: AuthenticatedRequest) {
    const mockUser =
      req.user ||
      ({
        id: "cm0n5vuv20000j3i63h0dntx9",
        email: "test@test.com",
        isAdmin: false,
      } as any);
    return this.coursesService.findBySlug(slug, mockUser);
  }

  @Post(":courseId/favorite")
  @UseGuards(JwtAuthGuard)
  addFavorite(
    @Param("courseId") courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.coursesService.addFavorite(req.user.id, courseId);
  }

  @Delete(":courseId/favorite")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(
    @Param("courseId") courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.coursesService.removeFavorite(req.user.id, courseId);
  }
}
