import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LearningEventsService } from "./learning-events.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LearningEventsService],
  exports: [LearningEventsService],
})
export class LearningEventsModule {}
