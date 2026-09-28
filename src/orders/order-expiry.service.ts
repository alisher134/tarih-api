import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { OrdersService } from "./orders.service";

const EXPIRY_CHECK_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class OrderExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly ordersService: OrdersService) {}

  onModuleInit() {
    void this.expireOrders();
    this.timer = setInterval(() => {
      void this.expireOrders();
    }, EXPIRY_CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async expireOrders() {
    try {
      await this.ordersService.expireStaleOrders();
    } catch (error) {
      this.logger.error("Failed to expire stale orders", error);
    }
  }
}
