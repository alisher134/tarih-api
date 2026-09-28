import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionExpiryService } from "./subscription-expiry.service";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionExpiryService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
