import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus } from "../generated/prisma/client";
import { OrdersService } from "./orders.service";
import { PrismaService } from "../prisma/prisma.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

describe("OrdersService", () => {
  let service: OrdersService;
  const prisma = {
    subscriptionPlan: {
      findFirst: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("60"),
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    jest.clearAllMocks();
  });

  it("reuses an existing pending order", async () => {
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      id: "plan-1",
      priceKzt: 5000,
    });
    prisma.order.findFirst.mockResolvedValue({
      id: "order-existing",
      orderNumber: "ORD-EXIST1",
      status: OrderStatus.AWAITING_PAYMENT,
    });

    const order = await service.createOrder("user-1", "plan-1");

    expect(order.id).toBe("order-existing");
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("creates an awaiting payment order", async () => {
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      id: "plan-1",
      priceKzt: 5000,
    });
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.order.create.mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-ABC123",
      amount: 5000,
      status: OrderStatus.AWAITING_PAYMENT,
    });

    const order = await service.createOrder("user-1", "plan-1");

    expect(order.orderNumber).toMatch(/^ORD-/);
    const createCalls = prisma.order.create.mock.calls as Array<
      [
        {
          data: {
            userId: string;
            planId: string;
            amount: number;
            status: OrderStatus;
          };
        },
      ]
    >;
    expect(createCalls[0]?.[0].data.userId).toBe("user-1");
    expect(createCalls[0]?.[0].data.planId).toBe("plan-1");
    expect(createCalls[0]?.[0].data.amount).toBe(5000);
    expect(createCalls[0]?.[0].data.status).toBe(OrderStatus.AWAITING_PAYMENT);
  });

  it("throws when plan is missing", async () => {
    prisma.subscriptionPlan.findFirst.mockResolvedValue(null);

    await expect(service.createOrder("user-1", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("expires stale awaiting payment orders", async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 2 });

    const count = await service.expireStaleOrders();

    expect(count).toBe(2);
    const updateCalls = prisma.order.updateMany.mock.calls as Array<
      [
        {
          where: { status: OrderStatus; expiresAt: { lte: Date } };
          data: { status: OrderStatus };
        },
      ]
    >;
    expect(updateCalls[0]?.[0].where.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(updateCalls[0]?.[0].data.status).toBe(OrderStatus.EXPIRED);
    expect(updateCalls[0]?.[0].where.expiresAt.lte).toBeInstanceOf(Date);
  });
});
