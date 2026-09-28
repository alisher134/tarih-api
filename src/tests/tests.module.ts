import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { TestsController } from "./tests.controller";
import { TestsService } from "./tests.service";

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionsModule],
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
