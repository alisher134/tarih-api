import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createAdminUser } from "../helpers/admin";
import { apiPath, createTestApp } from "../helpers/app";
import { signIn, signUp } from "../helpers/auth";

type PlanBody = {
  id: string;
  slug: string;
  durationMonths: number;
  priceKzt: number;
};

type SubscriptionMeBody = {
  isActive: boolean;
  subscription: {
    id: string;
    remainingSeconds: number;
    remainingDays: number;
    plan: PlanBody;
    monthlyPriceKzt: number;
  } | null;
};

type GrantSubscriptionBody = {
  id: string;
  remainingSeconds: number;
  plan: PlanBody;
};

function readBody<T>(body: unknown): T {
  return body as T;
}

describe("Subscriptions (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const adminEmail = `sub-admin-${Date.now()}@example.com`;
  const studentEmail = `sub-student-${Date.now()}@example.com`;
  const password = "password1";

  let adminAccessToken = "";
  let studentAccessToken = "";
  let studentUserId = "";
  let planId = "";
  let subscriptionId = "";

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_USERNAME = "tarih_bot";
    app = await createTestApp();
    prisma = app.get(PrismaService);

    await createAdminUser(prisma, {
      email: adminEmail,
      password,
      firstName: "Sub",
      lastName: "Admin",
    });

    const adminAuth = await signIn(app, { email: adminEmail, password });
    adminAccessToken = adminAuth.accessToken;

    const studentAuth = await signUp(app, {
      email: studentEmail,
      password,
      firstName: "Sub",
      lastName: "Student",
    });
    studentAccessToken = studentAuth.accessToken;
    studentUserId = studentAuth.user.id;
  });

  afterAll(async () => {
    if (subscriptionId) {
      await prisma.userSubscription.deleteMany({
        where: { id: subscriptionId },
      });
    }

    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, studentEmail] } },
    });
    await app.close();
  });

  it("lists active subscription plans publicly", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/subscription-plans"))
      .expect(200);

    const plans = readBody<PlanBody[]>(response.body);
    expect(plans.length).toBeGreaterThanOrEqual(4);
    expect(plans.some((plan) => plan.slug === "12-months")).toBe(true);
    planId = plans.find((plan) => plan.slug === "1-month")?.id ?? "";
    expect(planId).not.toBe("");
  });

  it("returns inactive subscription before grant", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/subscriptions/me"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const body = readBody<SubscriptionMeBody>(response.body);
    expect(body.isActive).toBe(false);
    expect(body.subscription).toBeNull();
  });

  it("returns telegram purchase link for authenticated user", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/subscriptions/purchase-link"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const body = readBody<{ channel: string; url: string }>(response.body);
    expect(body.channel).toBe("telegram");
    expect(body.url).toBe("https://t.me/tarih_bot?start=purchase");
  });

  it("returns telegram purchase link with plan slug when planId is provided", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath(`/subscriptions/purchase-link?planId=${planId}`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const body = readBody<{ channel: string; url: string }>(response.body);
    expect(body.channel).toBe("telegram");
    expect(body.url).toBe("https://t.me/tarih_bot?start=plan_1-month");
  });

  it("grants subscription via admin and returns remaining time", async () => {
    const grantResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/users/${studentUserId}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ planId })
      .expect(201);

    const granted = readBody<GrantSubscriptionBody>(grantResponse.body);
    subscriptionId = granted.id;
    expect(granted.remainingSeconds).toBeGreaterThan(0);
    expect(granted.plan.durationMonths).toBe(1);
    expect(granted.plan.priceKzt).toBe(9990);

    const meResponse = await request(app.getHttpServer())
      .get(apiPath("/subscriptions/me"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const meBody = readBody<SubscriptionMeBody>(meResponse.body);
    expect(meBody.isActive).toBe(true);
    expect(meBody.subscription?.remainingSeconds).toBeGreaterThan(0);
    expect(meBody.subscription?.monthlyPriceKzt).toBe(9990);
  });

  it("lists user subscription history for admin", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath(`/admin/users/${studentUserId}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    const body = readBody<{ data: Array<{ id: string }> }>(response.body);
    expect(body.data.some((item) => item.id === subscriptionId)).toBe(true);
  });

  it("cancels subscription via admin", async () => {
    await request(app.getHttpServer())
      .delete(
        apiPath(
          `/admin/users/${studentUserId}/subscriptions/${subscriptionId}`,
        ),
      )
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(204);

    const meResponse = await request(app.getHttpServer())
      .get(apiPath("/subscriptions/me"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const meBody = readBody<SubscriptionMeBody>(meResponse.body);
    expect(meBody.isActive).toBe(false);
    expect(meBody.subscription).toBeNull();
  });
});
