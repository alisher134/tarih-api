import { Injectable, NotFoundException } from "@nestjs/common";
import { UserSubscriptionStatus } from "../../generated/prisma/client";
import { addMonths } from "../../subscriptions/subscription.utils";
import { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { GrantSubscriptionDto } from "./dto/grant-subscription.dto";

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async grantSubscription(
    userId: string,
    dto: GrantSubscriptionDto,
    grantedById: string,
  ) {
    await this.ensureUserExists(userId);

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: dto.planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan ${dto.planId} not found`);
    }

    const now = new Date();
    const activeSubscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: UserSubscriptionStatus.ACTIVE,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });

    if (activeSubscription) {
      const subscription = await this.prisma.userSubscription.update({
        where: { id: activeSubscription.id },
        data: {
          planId: plan.id,
          expiresAt: addMonths(
            activeSubscription.expiresAt,
            plan.durationMonths,
          ),
          grantedById,
          cancelledAt: null,
        },
        include: {
          plan: {
            select: {
              id: true,
              slug: true,
              title: true,
              durationMonths: true,
              priceKzt: true,
              order: true,
            },
          },
        },
      });

      return this.subscriptionsService.toSubscriptionResponse(
        subscription,
        now,
      );
    }

    const subscription = await this.prisma.userSubscription.create({
      data: {
        userId,
        planId: plan.id,
        startsAt: now,
        expiresAt: addMonths(now, plan.durationMonths),
        grantedById,
      },
      include: {
        plan: {
          select: {
            id: true,
            slug: true,
            title: true,
            durationMonths: true,
            priceKzt: true,
            order: true,
          },
        },
      },
    });

    return this.subscriptionsService.toSubscriptionResponse(subscription, now);
  }

  async findUserSubscriptions(userId: string) {
    await this.ensureUserExists(userId);

    const subscriptions = await this.prisma.userSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        plan: {
          select: {
            id: true,
            slug: true,
            title: true,
            durationMonths: true,
            priceKzt: true,
            order: true,
          },
        },
      },
    });

    const now = new Date();

    return {
      data: subscriptions.map((subscription) =>
        this.subscriptionsService.toSubscriptionResponse(subscription, now),
      ),
    };
  }

  async cancelSubscription(userId: string, subscriptionId: string) {
    await this.ensureUserExists(userId);

    const subscription = await this.prisma.userSubscription.findFirst({
      where: { id: subscriptionId, userId },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Subscription ${subscriptionId} not found for user ${userId}`,
      );
    }

    if (subscription.status === UserSubscriptionStatus.CANCELLED) {
      return;
    }

    await this.prisma.userSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: UserSubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }
}
