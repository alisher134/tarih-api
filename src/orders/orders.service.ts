import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderStatus } from "../generated/prisma/client";
import { generateOrderNumber } from "../common/orders/order-number.utils";
import { PrismaService } from "../prisma/prisma.service";

export const ORDER_RECEIPT_ERROR = {
  EXPIRED: "ORDER_EXPIRED",
  PAID: "ORDER_PAID",
  REJECTED: "ORDER_REJECTED",
  UNAVAILABLE: "ORDER_UNAVAILABLE",
} as const;

const ORDER_INCLUDE = {
  plan: {
    select: {
      id: true,
      slug: true,
      titleRu: true,
      description: true,
      durationMonths: true,
      priceKzt: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      telegramId: true,
    },
  },
  payment: true,
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly expirationMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.expirationMinutes = Number(
      config.get<string>("PAYMENT_ORDER_EXPIRATION_MINUTES") ?? "1440",
    );
  }

  async createOrder(userId: string, planId: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan ${planId} not found`);
    }

    const pendingOrder = await this.getActiveAwaitingPaymentOrder(userId);
    if (pendingOrder) {
      this.logger.log({
        event: "ORDER_REUSED",
        orderId: pendingOrder.id,
        orderNumber: pendingOrder.orderNumber,
        userId,
      });
      return pendingOrder;
    }

    const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000);

    let orderNumber = generateOrderNumber();
    let attempts = 0;

    while (attempts < 5) {
      const existing = await this.prisma.order.findUnique({
        where: { orderNumber },
        select: { id: true },
      });

      if (!existing) {
        break;
      }

      orderNumber = generateOrderNumber();
      attempts += 1;
    }

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        planId: plan.id,
        amount: plan.priceKzt,
        status: OrderStatus.AWAITING_PAYMENT,
        expiresAt,
      },
      include: ORDER_INCLUDE,
    });

    this.logger.log({
      event: "ORDER_CREATED",
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId,
      planId: plan.id,
    });

    return order;
  }

  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    return order;
  }

  async findByIdForUser(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return order;
  }

  async findUserOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
    });
  }

  async getActiveAwaitingPaymentOrder(userId: string) {
    const now = new Date();
    return this.prisma.order.findFirst({
      where: {
        userId,
        status: {
          in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.PAYMENT_REVIEW],
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
    });
  }

  assertOrderAwaitingReceipt(order: {
    status: OrderStatus;
    expiresAt: Date | null;
  }) {
    if (order.status === OrderStatus.EXPIRED) {
      throw new BadRequestException(ORDER_RECEIPT_ERROR.EXPIRED);
    }

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException(ORDER_RECEIPT_ERROR.PAID);
    }

    if (order.status === OrderStatus.REJECTED) {
      throw new BadRequestException(ORDER_RECEIPT_ERROR.REJECTED);
    }

    if (
      order.expiresAt &&
      order.expiresAt.getTime() <= Date.now() &&
      order.status === OrderStatus.AWAITING_PAYMENT
    ) {
      throw new BadRequestException(ORDER_RECEIPT_ERROR.EXPIRED);
    }

    if (
      order.status !== OrderStatus.AWAITING_PAYMENT &&
      order.status !== OrderStatus.PAYMENT_REVIEW
    ) {
      throw new BadRequestException(ORDER_RECEIPT_ERROR.UNAVAILABLE);
    }
  }

  async expireStaleOrders(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.order.updateMany({
      where: {
        status: OrderStatus.AWAITING_PAYMENT,
        expiresAt: { lte: now },
      },
      data: { status: OrderStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log({
        event: "ORDER_EXPIRED",
        count: result.count,
      });
    }

    return result.count;
  }
}
