import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { OrderStatus, PaymentStatus } from "../../src/generated/prisma/client";
import { PaymentsService } from "../../src/payments/payments.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { apiPath, createTestApp } from "../helpers/app";

describe("Telegram payments (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let paymentsService: PaymentsService;

  const telegramId = `tg-${Date.now()}`;
  let userId = "";
  let planId = "";
  let orderId = "";

  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
    app = await createTestApp();
    prisma = app.get(PrismaService);
    paymentsService = app.get(PaymentsService);

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    if (!plan) {
      throw new Error("No active subscription plan found");
    }

    planId = plan.id;

    const user = await prisma.user.create({
      data: {
        email: `telegram-${Date.now()}@example.com`,
        firstName: "Telegram",
        lastName: "Buyer",
        passwordHash: "hash",
        telegramId,
      },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-E2E${Date.now().toString().slice(-4)}`,
        userId,
        planId,
        amount: plan.priceKzt,
        status: OrderStatus.PAYMENT_REVIEW,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    orderId = order.id;

    await prisma.payment.create({
      data: {
        orderId,
        receiptTelegramFileId: "telegram-file-id",
        status: PaymentStatus.UNDER_REVIEW,
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.userSubscription.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("rejects webhook without secret token", async () => {
    await request(app.getHttpServer())
      .post(apiPath("/telegram/webhook"))
      .send({ update_id: 1 })
      .expect(401);
  });

  it("accepts webhook with valid secret token", async () => {
    await request(app.getHttpServer())
      .post(apiPath("/telegram/webhook"))
      .set("x-telegram-bot-api-secret-token", "test-webhook-secret")
      .send({
        update_id: 2,
        message: {
          message_id: 1,
          chat: { id: 1, type: "private" },
          text: "/start",
        },
      })
      .expect(200);
  });

  it("confirms payment only once", async () => {
    const first = await paymentsService.confirmPayment(orderId, "manager-1");
    const second = await paymentsService.confirmPayment(orderId, "manager-1");

    expect(first.alreadyConfirmed).toBe(false);
    expect(second.alreadyConfirmed).toBe(true);

    const subscriptions = await prisma.userSubscription.findMany({
      where: { orderId },
    });
    const payments = await prisma.payment.findMany({ where: { orderId } });
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    expect(subscriptions).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(order?.status).toBe(OrderStatus.PAID);
  });
});
