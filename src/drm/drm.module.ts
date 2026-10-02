import { Module } from "@nestjs/common";
import { DrmController } from "./drm.controller";

@Module({
  controllers: [DrmController],
})
export class DrmModule {}
