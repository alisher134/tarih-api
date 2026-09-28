import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../../auth/types";
import { AdminGuard } from "../guards/admin.guard";
import { AdminSubscriptionsService } from "./admin-subscriptions.service";
import { GrantSubscriptionDto } from "./dto/grant-subscription.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(
    private readonly adminSubscriptionsService: AdminSubscriptionsService,
  ) {}

  @Post("users/:userId/subscriptions")
  grantSubscription(
    @Param("userId") userId: string,
    @Body() dto: GrantSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminSubscriptionsService.grantSubscription(
      userId,
      dto,
      req.user.id,
    );
  }

  @Get("users/:userId/subscriptions")
  findUserSubscriptions(@Param("userId") userId: string) {
    return this.adminSubscriptionsService.findUserSubscriptions(userId);
  }

  @Delete("users/:userId/subscriptions/:subscriptionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelSubscription(
    @Param("userId") userId: string,
    @Param("subscriptionId") subscriptionId: string,
  ) {
    return this.adminSubscriptionsService.cancelSubscription(
      userId,
      subscriptionId,
    );
  }
}
