import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  UserSubscriptionStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { addMonths } from "../subscriptions/subscription.utils";

const MAX_TRANSACTION_RETRIES = 5;

const ORDER_INCLUDE = {
  plan: {
    select: {
      id: true,
      title: true,
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
  subscription: {
    include: {
      plan: {
        select: {
          id: true,
          title: true,
          durationMonths: true,
          priceKzt: true,
        },
      },
    },
  },
} as const;

export type ConfirmPaymentResult = {
  alreadyConfirmed: boolean;
  order: Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitReceipt(input: {
    orderId: string;
    receiptTelegramFileId: string;
    receiptObjectKey?: string | null;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${input.orderId} not found`);
    }

    if (order.status === OrderStatus.EXPIRED) {
      throw new BadRequestException(
        "Этот заказ уже истёк. Создайте новый заказ для оплаты.",
      );
    }

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException("Заказ уже оплачен.");
    }

    if (
      order.expiresAt &&
      order.expiresAt.getTime() <= Date.now() &&
      order.status === OrderStatus.AWAITING_PAYMENT
    ) {
      throw new BadRequestException(
        "Этот заказ уже истёк. Создайте новый заказ для оплаты.",
      );
    }

    if (
      order.status === OrderStatus.PAYMENT_REVIEW &&
      order.payment?.status === PaymentStatus.UNDER_REVIEW
    ) {
      return {
        alreadySubmitted: true,
        order,
        payment: order.payment,
      };
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const upsertedPayment = await tx.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          receiptTelegramFileId: input.receiptTelegramFileId,
          receiptObjectKey: input.receiptObjectKey ?? null,
          status: PaymentStatus.UNDER_REVIEW,
        },
        update: {
          receiptTelegramFileId: input.receiptTelegramFileId,
          receiptObjectKey: input.receiptObjectKey ?? null,
          status: PaymentStatus.UNDER_REVIEW,
          rejectionReason: null,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_REVIEW },
      });

      return upsertedPayment;
    });

    this.logger.log({
      event: "RECEIPT_RECEIVED",
      orderId: order.id,
      paymentId: payment.id,
    });
    this.logger.log({
      event: "PAYMENT_SUBMITTED_FOR_REVIEW",
      orderId: order.id,
      paymentId: payment.id,
    });

    return {
      alreadySubmitted: false,
      order: await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_INCLUDE,
      }),
      payment,
    };
  }

  async confirmPayment(
    orderId: string,
    confirmedBy: string,
  ): Promise<ConfirmPaymentResult> {
    let retries = 0;

    while (retries < MAX_TRANSACTION_RETRIES) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const order = await tx.order.findUnique({
              where: { id: orderId },
              include: ORDER_INCLUDE,
            });

            if (!order) {
              throw new NotFoundException(`Order ${orderId} not found`);
            }

            if (order.status === OrderStatus.PAID) {
              return { alreadyConfirmed: true, order };
            }

            if (order.status !== OrderStatus.PAYMENT_REVIEW) {
              throw new BadRequestException(
                "Заказ недоступен для подтверждения оплаты",
              );
            }

            if (!order.payment) {
              throw new BadRequestException("Payment not found for order");
            }

            if (order.payment.status === PaymentStatus.CONFIRMED) {
              const paidOrder = await tx.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.PAID },
                include: ORDER_INCLUDE,
              });
              return { alreadyConfirmed: true, order: paidOrder };
            }

            const now = new Date();

            await tx.payment.update({
              where: { id: order.payment.id },
              data: {
                status: PaymentStatus.CONFIRMED,
                confirmedBy,
                confirmedAt: now,
              },
            });

            const subscription = await this.activateSubscriptionForOrder(
              tx,
              order,
              now,
            );

            const paidOrder = await tx.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.PAID,
                paidAt: now,
              },
              include: ORDER_INCLUDE,
            });

            this.logger.log({
              event: "PAYMENT_CONFIRMED",
              orderId: order.id,
              paymentId: order.payment.id,
              confirmedBy,
            });
            this.logger.log({
              event: subscription.extended
                ? "SUBSCRIPTION_EXTENDED"
                : "SUBSCRIPTION_ACTIVATED",
              orderId: order.id,
              subscriptionId: subscription.record.id,
              userId: order.userId,
            });

            return {
              alreadyConfirmed: false,
              order: {
                ...paidOrder,
                subscription: subscription.record,
              },
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          retries < MAX_TRANSACTION_RETRIES - 1
        ) {
          retries += 1;
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException("Не удалось подтвердить оплату");
  }

  async rejectPayment(orderId: string, reason: string, rejectedBy: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException("Заказ уже оплачен");
    }

    if (order.status === OrderStatus.REJECTED) {
      return { alreadyRejected: true, order };
    }

    if (order.status !== OrderStatus.PAYMENT_REVIEW) {
      throw new BadRequestException("Заказ недоступен для отклонения");
    }

    const now = new Date();

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (order.payment) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: {
            status: PaymentStatus.REJECTED,
            rejectionReason: reason,
            confirmedBy: rejectedBy,
            confirmedAt: now,
          },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.REJECTED,
          rejectedAt: now,
          rejectionReason: reason,
        },
        include: ORDER_INCLUDE,
      });
    });

    this.logger.log({
      event: "PAYMENT_REJECTED",
      orderId: order.id,
      rejectedBy,
      reason,
    });

    return { alreadyRejected: false, order: updatedOrder };
  }

  private async activateSubscriptionForOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      userId: string;
      planId: string;
      plan: { durationMonths: number };
    },
    now: Date,
  ) {
    const existingForOrder = await tx.userSubscription.findUnique({
      where: { orderId: order.id },
      include: {
        plan: {
          select: {
            id: true,
            title: true,
            durationMonths: true,
            priceKzt: true,
          },
        },
      },
    });

    if (existingForOrder) {
      return { record: existingForOrder, extended: false };
    }

    const latestActive = await tx.userSubscription.findFirst({
      where: {
        userId: order.userId,
        status: UserSubscriptionStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });

    const startsAt =
      latestActive && latestActive.expiresAt.getTime() > now.getTime()
        ? latestActive.expiresAt
        : now;
    const expiresAt = addMonths(startsAt, order.plan.durationMonths);

    const record = await tx.userSubscription.create({
      data: {
        userId: order.userId,
        planId: order.planId,
        orderId: order.id,
        status: UserSubscriptionStatus.ACTIVE,
        startsAt,
        expiresAt,
      },
      include: {
        plan: {
          select: {
            id: true,
            title: true,
            durationMonths: true,
            priceKzt: true,
          },
        },
      },
    });

    return {
      record,
      extended: latestActive != null && startsAt.getTime() > now.getTime(),
    };
  }
}
