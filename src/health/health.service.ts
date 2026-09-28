import { Injectable } from "@nestjs/common";
import {
  HealthCheckService,
  HealthIndicator,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    await this.prisma.$queryRaw`SELECT 1`;
    return this.getStatus(key, true);
  }
}

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly storage: StorageService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    await this.storage.checkHealth();
    return this.getStatus(key, true);
  }
}

@Injectable()
export class AppHealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly storageHealth: StorageHealthIndicator,
  ) {}

  live() {
    return { status: "ok" };
  }

  ready() {
    return this.health.check([
      () => this.prismaHealth.isHealthy("database"),
      () => this.storageHealth.isHealthy("storage"),
    ]);
  }
}
