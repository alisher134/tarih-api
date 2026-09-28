import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { LessonsController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
