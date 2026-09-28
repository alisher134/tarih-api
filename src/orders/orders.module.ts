import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OrderExpiryService } from "./order-expiry.service";
import { OrdersService } from "./orders.service";

@Module({
  imports: [PrismaModule],
  providers: [OrdersService, OrderExpiryService],
  exports: [OrdersService],
})
export class OrdersModule {}
