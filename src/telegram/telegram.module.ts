import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { TelegramApiService } from "./telegram-api.service";
import { TelegramSessionService } from "./telegram-session.service";
import { TelegramUpdateService } from "./telegram-update.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";
import { TelegramWebhookSetupService } from "./telegram-webhook-setup.service";

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    UsersModule,
    SubscriptionsModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [
    TelegramApiService,
    TelegramSessionService,
    TelegramUpdateService,
    TelegramWebhookSetupService,
  ],
})
export class TelegramBotModule {}
