import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { AppHealthService } from "./health.service";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: AppHealthService) {}

  @Get("live")
  live() {
    return this.healthService.live();
  }

  @Get("ready")
  ready() {
    return this.healthService.ready();
  }
}
