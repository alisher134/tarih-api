import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SubscriptionsModule } from "../../subscriptions/subscriptions.module";
import { CourseAccessService } from "./course-access.service";

@Global()
@Module({
  imports: [PrismaModule, SubscriptionsModule],
  providers: [CourseAccessService],
  exports: [CourseAccessService],
})
export class AccessModule {}
