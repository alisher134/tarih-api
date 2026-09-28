import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { HealthController } from "./health.controller";
import {
  AppHealthService,
  PrismaHealthIndicator,
  StorageHealthIndicator,
} from "./health.service";

@Module({
  imports: [TerminusModule, PrismaModule, StorageModule],
  controllers: [HealthController],
  providers: [AppHealthService, PrismaHealthIndicator, StorageHealthIndicator],
})
export class HealthModule {}
