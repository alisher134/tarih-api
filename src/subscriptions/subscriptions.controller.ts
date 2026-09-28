import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types";
import { PurchaseLinkQueryDto } from "./dto/purchase-link-query.dto";
import { SubscriptionsService } from "./subscriptions.service";

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("subscription-plans")
  findPlans() {
    return this.subscriptionsService.findActivePlans();
  }

  @Get("subscriptions/me")
  @UseGuards(JwtAuthGuard)
  getMySubscription(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getCurrentSubscription(req.user.id);
  }

  @Get("subscriptions/purchase-link")
  @UseGuards(JwtAuthGuard)
  getPurchaseLink(@Query() query: PurchaseLinkQueryDto) {
    return this.subscriptionsService.getPurchaseLink(query.planId);
  }
}
