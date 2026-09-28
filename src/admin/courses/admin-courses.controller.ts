import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { AdminCoursesService } from "./admin-courses.service";
import {
  CreateCourseDto,
  ListAdminCoursesQueryDto,
  UpdateCourseDto,
} from "./dto/course.dto";

@Controller("admin/courses")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCoursesController {
  constructor(private readonly adminCoursesService: AdminCoursesService) {}

  @Get()
  findAll(@Query() query: ListAdminCoursesQueryDto) {
    return this.adminCoursesService.findAll(query);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.adminCoursesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.adminCoursesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCourseDto) {
    return this.adminCoursesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.adminCoursesService.remove(id);
  }
}
