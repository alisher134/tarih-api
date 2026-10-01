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
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { AdminSubscriptionPlansService } from "./admin-subscription-plans.service";
import {
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from "./dto/subscription-plan.dto";

@Controller("admin/subscription-plans")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSubscriptionPlansController {
  constructor(
    private readonly adminSubscriptionPlansService: AdminSubscriptionPlansService,
  ) {}

  @Post()
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.adminSubscriptionPlansService.create(dto);
  }

  @Get()
  findAll() {
    return this.adminSubscriptionPlansService.findAll();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.adminSubscriptionPlansService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.adminSubscriptionPlansService.remove(id);
  }
}
