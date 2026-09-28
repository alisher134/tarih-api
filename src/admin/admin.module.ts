import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AdminGuard } from "./guards/admin.guard";
import { AdminCoursesController } from "./courses/admin-courses.controller";
import { AdminCoursesService } from "./courses/admin-courses.service";
import { AdminLessonsController } from "./lessons/admin-lessons.controller";
import { AdminLessonsService } from "./lessons/admin-lessons.service";
import { AdminTestsController } from "./tests/admin-tests.controller";
import { AdminTestsService } from "./tests/admin-tests.service";
import { AdminAnalyticsController } from "./analytics/admin-analytics.controller";
import { AdminAnalyticsService } from "./analytics/admin-analytics.service";
import { AdminSubscriptionsController } from "./subscriptions/admin-subscriptions.controller";
import { AdminSubscriptionsService } from "./subscriptions/admin-subscriptions.service";
import { AdminUploadsController } from "./uploads/admin-uploads.controller";
import { AdminUploadsService } from "./uploads/admin-uploads.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminUsersService } from "./users/admin-users.service";

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionsModule],
  controllers: [
    AdminUsersController,
    AdminCoursesController,
    AdminLessonsController,
    AdminTestsController,
    AdminUploadsController,
    AdminSubscriptionsController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminUsersService,
    AdminCoursesService,
    AdminLessonsService,
    AdminTestsService,
    AdminUploadsService,
    AdminSubscriptionsService,
    AdminAnalyticsService,
    AdminGuard,
  ],
})
export class AdminModule {}
