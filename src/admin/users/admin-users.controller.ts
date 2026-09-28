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
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../../auth/types";
import { AdminGuard } from "../guards/admin.guard";
import { AdminUsersService } from "./admin-users.service";
import { CreateAdminUserDto } from "./dto/create-admin-user.dto";
import { ListAdminUsersQueryDto } from "./dto/list-admin-users-query.dto";
import { ResetAdminUserPasswordDto } from "./dto/reset-admin-user-password.dto";
import { UpdateAdminUserDto } from "./dto/update-admin-user.dto";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  findAll(@Query() query: ListAdminUsersQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.adminUsersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto) {
    return this.adminUsersService.create(dto);
  }

  @Patch(":id/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetAdminUserPasswordDto,
  ) {
    return this.adminUsersService.resetPassword(id, dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAdminUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminUsersService.update(id, dto, req.user.id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.adminUsersService.remove(id, req.user.id);
  }
}
