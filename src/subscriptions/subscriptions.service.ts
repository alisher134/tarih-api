import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserSubscriptionStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  getRemainingDays,
  getRemainingSeconds,
  isSubscriptionActive,
  isSubscriptionUpcoming,
} from "./subscription.utils";

const SUBSCRIPTION_INCLUDE = {
  plan: {
    select: {
      id: true,
      slug: true,
      titleRu: true,
      titleKz: true,
      durationMonths: true,
      priceKzt: true,
      order: true,
    },
  },
} as const;

const ACTIVE_SUBSCRIPTION_WHERE = (userId: string, now: Date) => ({
  userId,
  status: UserSubscriptionStatus.ACTIVE,
  startsAt: { lte: now },
  expiresAt: { gt: now },
});

@Injectable()
export class SubscriptionsService {
  private readonly telegramBotUsername: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.telegramBotUsername =
      config.get<string>("TELEGRAM_BOT_USERNAME") ?? "";
  }

  findActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        titleRu: true,
        titleKz: true,
        description: true,
        durationMonths: true,
        priceKzt: true,
        order: true,
      },
    });
  }

  async getPurchaseLink(planId?: string) {
    if (!this.telegramBotUsername) {
      throw new NotFoundException("Telegram purchase is not configured");
    }

    let startParam = "purchase";

    if (planId) {
      const plan = await this.findActivePlanById(planId);
      if (!plan) {
        throw new NotFoundException(`Subscription plan ${planId} not found`);
      }
      startParam = `plan_${plan.slug}`;
    }

    return {
      channel: "telegram" as const,
      url: `https://t.me/${this.telegramBotUsername}?start=${startParam}`,
      instructions:
        "Open the Telegram bot, complete purchase, and upload your payment receipt there.",
    };
  }

  findActivePlanById(planId: string) {
    return this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
      select: {
        id: true,
        slug: true,
        titleRu: true,
        titleKz: true,
        durationMonths: true,
        priceKzt: true,
      },
    });
  }

  findActivePlanBySlug(slug: string) {
    return this.prisma.subscriptionPlan.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        slug: true,
        titleRu: true,
        titleKz: true,
        durationMonths: true,
        priceKzt: true,
      },
    });
  }

  async getCurrentSubscription(userId: string) {
    const now = new Date();
    const subscription = await this.prisma.userSubscription.findFirst({
      where: ACTIVE_SUBSCRIPTION_WHERE(userId, now),
      orderBy: { expiresAt: "desc" },
      include: SUBSCRIPTION_INCLUDE,
    });

    const upcomingSubscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: UserSubscriptionStatus.ACTIVE,
        startsAt: { gt: now },
        expiresAt: { gt: now },
      },
      orderBy: { startsAt: "asc" },
      include: SUBSCRIPTION_INCLUDE,
    });

    if (!subscription) {
      return {
        isActive: false,
        subscription: null,
        upcomingSubscription: upcomingSubscription
          ? this.toSubscriptionResponse(upcomingSubscription, now)
          : null,
      };
    }

    return {
      isActive: isSubscriptionActive(
        subscription.startsAt,
        subscription.expiresAt,
        subscription.status,
        now,
      ),
      subscription: this.toSubscriptionResponse(subscription, now),
      upcomingSubscription: upcomingSubscription
        ? this.toSubscriptionResponse(upcomingSubscription, now)
        : null,
    };
  }

  async hasActiveSubscription(userId: string): Promise<boolean> {
    const now = new Date();
    const subscription = await this.prisma.userSubscription.findFirst({
      where: ACTIVE_SUBSCRIPTION_WHERE(userId, now),
      select: { id: true },
    });

    return subscription != null;
  }

  toSubscriptionResponse(
    subscription: {
      id: string;
      status: UserSubscriptionStatus;
      startsAt: Date;
      expiresAt: Date;
      plan: {
        id: string;
        slug: string;
        titleRu: string;
        titleKz: string;
        durationMonths: number;
        priceKzt: number;
        order: number;
      };
    },
    now = new Date(),
  ) {
    const isCurrentlyActive = isSubscriptionActive(
      subscription.startsAt,
      subscription.expiresAt,
      subscription.status,
      now,
    );
    const isUpcoming = isSubscriptionUpcoming(
      subscription.startsAt,
      subscription.expiresAt,
      subscription.status,
      now,
    );
    const remainingSeconds = isCurrentlyActive
      ? getRemainingSeconds(subscription.expiresAt, now)
      : isUpcoming
        ? getRemainingSeconds(subscription.expiresAt, subscription.startsAt)
        : 0;
    const remainingDays = isCurrentlyActive
      ? getRemainingDays(subscription.expiresAt, now)
      : isUpcoming
        ? getRemainingDays(subscription.expiresAt, subscription.startsAt)
        : 0;

    return {
      id: subscription.id,
      status: subscription.status,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      remainingSeconds,
      remainingDays,
      isExpired: !isCurrentlyActive && !isUpcoming,
      isUpcoming,
      plan: subscription.plan,
      monthlyPriceKzt: Math.round(
        subscription.plan.priceKzt / subscription.plan.durationMonths,
      ),
    };
  }
}
