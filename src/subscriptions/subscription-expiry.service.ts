import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { UserSubscriptionStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class SubscriptionExpiryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionExpiryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.expireSubscriptions();
    this.timer = setInterval(() => {
      void this.expireSubscriptions();
    }, EXPIRY_CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async expireSubscriptions(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.userSubscription.updateMany({
      where: {
        status: UserSubscriptionStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: UserSubscriptionStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} subscription(s) as expired`);
    }

    return result.count;
  }
}
