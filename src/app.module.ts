import { Module, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { AccessModule } from "./common/access/access.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { AdminAuditInterceptor } from "./common/interceptors/admin-audit.interceptor";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";
import { CoursesModule } from "./courses/courses.module";
import { HealthModule } from "./health/health.module";
import { LearningEventsModule } from "./learning-events/learning-events.module";
import { LearningModule } from "./learning/learning.module";
import { LessonsModule } from "./lessons/lessons.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { TelegramBotModule } from "./telegram/telegram.module";
import { TestsModule } from "./tests/tests.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AccessModule,
    LearningEventsModule,
    StorageModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AdminModule,
    CoursesModule,
    LessonsModule,
    LearningModule,
    AnalyticsModule,
    SubscriptionsModule,
    TelegramBotModule,
    TestsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminAuditInterceptor,
    },
  ],
})
export class AppModule {}
