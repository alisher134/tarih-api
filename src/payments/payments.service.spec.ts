import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  OrderStatus,
  PaymentStatus,
  UserSubscriptionStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "./payments.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

describe("PaymentsService", () => {
  let service: PaymentsService;

  const tx = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      update: jest.fn(),
    },
    userSubscription: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const prisma = {
    order: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    payment: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );
  });

  it("returns already submitted when receipt is under review", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: OrderStatus.PAYMENT_REVIEW,
      payment: { id: "payment-1", status: PaymentStatus.UNDER_REVIEW },
    });

    const result = await service.submitReceipt({
      orderId: "order-1",
      receiptTelegramFileId: "file-1",
    });

    expect(result.alreadySubmitted).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("confirms payment idempotently when order is already paid", async () => {
    tx.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-TEST01",
      userId: "user-1",
      planId: "plan-1",
      status: OrderStatus.PAID,
      plan: { durationMonths: 1, title: "Pro" },
      user: { telegramId: "123" },
      payment: { id: "payment-1", status: PaymentStatus.CONFIRMED },
      subscription: null,
    });

    const result = await service.confirmPayment("order-1", "manager-1");

    expect(result.alreadyConfirmed).toBe(true);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.userSubscription.create).not.toHaveBeenCalled();
  });

  it("activates one subscription on first confirm", async () => {
    const paidOrder = {
      id: "order-1",
      orderNumber: "ORD-TEST01",
      userId: "user-1",
      planId: "plan-1",
      status: OrderStatus.PAID,
      paidAt: new Date("2026-09-08T00:00:00.000Z"),
      plan: { durationMonths: 1, title: "Pro" },
      user: { telegramId: "123" },
      payment: { id: "payment-1", status: PaymentStatus.CONFIRMED },
      subscription: {
        id: "sub-1",
        expiresAt: new Date("2026-10-08T00:00:00.000Z"),
        plan: { durationMonths: 1, title: "Pro" },
      },
    };

    tx.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-TEST01",
      userId: "user-1",
      planId: "plan-1",
      status: OrderStatus.PAYMENT_REVIEW,
      paidAt: null,
      plan: { durationMonths: 1, title: "Pro" },
      user: { telegramId: "123" },
      payment: { id: "payment-1", status: PaymentStatus.UNDER_REVIEW },
      subscription: null,
    });
    tx.userSubscription.findUnique.mockResolvedValue(null);
    tx.userSubscription.findFirst.mockResolvedValue(null);
    tx.userSubscription.create.mockResolvedValue({
      id: "sub-1",
      expiresAt: new Date("2026-10-08T00:00:00.000Z"),
      plan: { durationMonths: 1, title: "Pro" },
    });
    tx.order.update.mockResolvedValue(paidOrder);

    const result = await service.confirmPayment("order-1", "manager-1");

    expect(result.alreadyConfirmed).toBe(false);
    const paymentUpdateCalls = tx.payment.update.mock.calls as Array<
      [{ data: { status: PaymentStatus; confirmedBy: string } }]
    >;
    expect(paymentUpdateCalls[0]?.[0].data.status).toBe(
      PaymentStatus.CONFIRMED,
    );
    expect(paymentUpdateCalls[0]?.[0].data.confirmedBy).toBe("manager-1");

    const subscriptionCreateCalls = tx.userSubscription.create.mock
      .calls as Array<
      [
        {
          data: {
            userId: string;
            planId: string;
            orderId: string;
            status: UserSubscriptionStatus;
          };
        },
      ]
    >;
    expect(subscriptionCreateCalls[0]?.[0].data.userId).toBe("user-1");
    expect(subscriptionCreateCalls[0]?.[0].data.planId).toBe("plan-1");
    expect(subscriptionCreateCalls[0]?.[0].data.orderId).toBe("order-1");
    expect(subscriptionCreateCalls[0]?.[0].data.status).toBe(
      UserSubscriptionStatus.ACTIVE,
    );
  });

  it("extends subscription from active expiresAt", async () => {
    const activeExpiresAt = new Date("2026-10-20T00:00:00.000Z");

    tx.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-TEST01",
      userId: "user-1",
      planId: "plan-1",
      status: OrderStatus.PAYMENT_REVIEW,
      plan: { durationMonths: 1, title: "Pro" },
      user: { telegramId: "123" },
      payment: { id: "payment-1", status: PaymentStatus.UNDER_REVIEW },
      subscription: null,
    });
    tx.userSubscription.findUnique.mockResolvedValue(null);
    tx.userSubscription.findFirst.mockResolvedValue({
      id: "sub-active",
      expiresAt: activeExpiresAt,
    });
    tx.userSubscription.create.mockResolvedValue({
      id: "sub-new",
      expiresAt: new Date("2026-11-20T00:00:00.000Z"),
      plan: { durationMonths: 1, title: "Pro" },
    });
    tx.order.update.mockResolvedValue({
      id: "order-1",
      status: OrderStatus.PAID,
    });

    await service.confirmPayment("order-1", "manager-1");

    const subscriptionCreateCalls = tx.userSubscription.create.mock
      .calls as Array<[{ data: { startsAt: Date; expiresAt: Date } }]>;
    expect(subscriptionCreateCalls[0]?.[0].data.startsAt).toEqual(
      activeExpiresAt,
    );
    expect(subscriptionCreateCalls[0]?.[0].data.expiresAt).toEqual(
      new Date("2026-11-20T00:00:00.000Z"),
    );
  });

  it("rejects payment with reason", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-TEST01",
      status: OrderStatus.PAYMENT_REVIEW,
      payment: { id: "payment-1" },
    });

    prisma.$transaction.mockImplementation((callback) => {
      const localTx = {
        payment: { update: jest.fn().mockResolvedValue(undefined) },
        order: {
          update: jest.fn().mockResolvedValue({
            id: "order-1",
            status: OrderStatus.REJECTED,
          }),
        },
      };
      return Promise.resolve(callback(localTx));
    });

    const result = await service.rejectPayment(
      "order-1",
      "Сумма платежа не совпадает",
      "manager-1",
    );

    expect(result.alreadyRejected).toBe(false);
  });

  it("throws when confirming non-review order", async () => {
    tx.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: OrderStatus.AWAITING_PAYMENT,
      payment: null,
      plan: { durationMonths: 1 },
      user: {},
    });

    await expect(
      service.confirmPayment("order-1", "manager-1"),
    ).rejects.toThrow(BadRequestException);
  });
});
