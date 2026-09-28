import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import {
  CourseEnrollmentStatus,
  CourseStatus,
  QuestionType,
  UserSubscriptionStatus,
} from "../../src/generated/prisma/client";
import { OrdersService } from "../../src/orders/orders.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createAdminUser } from "../helpers/admin";
import { apiPath, createTestApp } from "../helpers/app";
import { signIn, signUp } from "../helpers/auth";

type CourseBody = { id: string };
type UploadIntentBody = { objectKey: string };
type LessonBody = { id: string };

function readBody<T>(body: unknown): T {
  return body as T;
}

function expectNoContinueLearning(body: unknown) {
  if (body === null) {
    return;
  }

  expect(body).toEqual({});
}

describe("Purchase and learning flow (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ordersService: OrdersService;

  const adminEmail = `flow-admin-${Date.now()}@example.com`;
  const studentEmail = `flow-student-${Date.now()}@example.com`;
  const password = "password1";

  let adminAccessToken = "";
  let studentAccessToken = "";
  let studentUserId = "";
  let planId = "";
  let courseId = "";
  let lessonId = "";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ordersService = app.get(OrdersService);

    await createAdminUser(prisma, {
      email: adminEmail,
      password,
      firstName: "Flow",
      lastName: "Admin",
    });

    const adminAuth = await signIn(app, { email: adminEmail, password });
    adminAccessToken = adminAuth.accessToken;

    const studentAuth = await signUp(app, {
      email: studentEmail,
      password,
      firstName: "Flow",
      lastName: "Student",
    });
    studentAccessToken = studentAuth.accessToken;
    studentUserId = studentAuth.user.id;

    const plansResponse = await request(app.getHttpServer())
      .get(apiPath("/subscription-plans"))
      .expect(200);
    planId = readBody<Array<{ id: string; slug: string }>>(
      plansResponse.body,
    ).find((plan) => plan.slug === "1-month")!.id;

    const courseResponse = await request(app.getHttpServer())
      .post(apiPath("/admin/courses"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Flow course",
        slug: `flow-course-${Date.now()}`,
      })
      .expect(201);
    courseId = readBody<CourseBody>(courseResponse.body).id;

    const uploadIntent = await request(app.getHttpServer())
      .post(apiPath("/admin/uploads/intent"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        purpose: "video",
        fileName: "lesson.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
        courseId,
      })
      .expect(201);
    const objectKey = readBody<UploadIntentBody>(uploadIntent.body).objectKey;

    await request(app.getHttpServer())
      .post(
        apiPath(
          `/admin/uploads/intent/${encodeURIComponent(objectKey)}/confirm`,
        ),
      )
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(201);

    const lessonResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/courses/${courseId}/lessons`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Flow lesson",
        videoObjectKey: objectKey,
        videoDuration: 100,
      })
      .expect(201);
    lessonId = readBody<LessonBody>(lessonResponse.body).id;

    const testResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Flow quiz",
        passingScore: 100,
      })
      .expect(201);
    const testId = readBody<{ id: string }>(testResponse.body).id;

    await request(app.getHttpServer())
      .post(apiPath(`/admin/tests/${testId}/questions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        text: "Question 1",
        type: QuestionType.SINGLE_CHOICE,
        options: [
          { text: "Correct", isCorrect: true },
          { text: "Wrong", isCorrect: false },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(apiPath(`/admin/courses/${courseId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ status: CourseStatus.PUBLISHED })
      .expect(200);
  });

  afterAll(async () => {
    if (courseId) {
      await prisma.course.deleteMany({ where: { id: courseId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, studentEmail] } },
    });
    await app.close();
  });

  it("reuses pending order instead of creating duplicates", async () => {
    const first = await ordersService.createOrder(studentUserId, planId);
    const second = await ordersService.createOrder(studentUserId, planId);

    expect(second.id).toBe(first.id);

    await prisma.order.deleteMany({ where: { userId: studentUserId } });
  });

  it("returns null for continue learning without active subscription", async () => {
    await prisma.userSubscription.deleteMany({
      where: { userId: studentUserId },
    });
    await prisma.courseEnrollment.create({
      data: {
        userId: studentUserId,
        courseId,
        progress: 50,
      },
    });

    const response = await request(app.getHttpServer())
      .get(apiPath("/me/learning/continue"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    expectNoContinueLearning(response.body);
  });

  it("reactivates completed enrollment when a new lesson is added", async () => {
    await request(app.getHttpServer())
      .post(apiPath(`/admin/users/${studentUserId}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ planId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(apiPath(`/lessons/${lessonId}/progress`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({ watchedSeconds: 95 })
      .expect(200);

    const testPayload = await request(app.getHttpServer())
      .get(apiPath(`/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);
    const testId = readBody<{ id: string }>(testPayload.body).id;

    const attemptResponse = await request(app.getHttpServer())
      .post(apiPath(`/tests/${testId}/attempts`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(201);
    const attemptId = readBody<{ id: string }>(attemptResponse.body).id;

    const questionId = readBody<{
      questions: Array<{ id: string; options: Array<{ id: string }> }>;
    }>(testPayload.body).questions[0].id;
    const optionId = readBody<{
      questions: Array<{ id: string; options: Array<{ id: string }> }>;
    }>(testPayload.body).questions[0].options[0].id;

    const emptyDraft = await request(app.getHttpServer())
      .get(apiPath(`/test-attempts/${attemptId}/draft`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);
    expect(readBody<{ answers: unknown[] }>(emptyDraft.body).answers).toEqual(
      [],
    );

    await request(app.getHttpServer())
      .put(apiPath(`/test-attempts/${attemptId}/draft`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({
        answers: [{ questionId, optionIds: [optionId] }],
      })
      .expect(200);

    const savedDraft = await request(app.getHttpServer())
      .get(apiPath(`/test-attempts/${attemptId}/draft`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);
    expect(readBody<{ answers: unknown[] }>(savedDraft.body).answers).toEqual([
      { questionId, optionIds: [optionId] },
    ]);

    await request(app.getHttpServer())
      .post(apiPath(`/test-attempts/${attemptId}/submit`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({
        answers: [{ questionId, optionIds: [optionId] }],
      })
      .expect(201);

    const clearedDraft = await request(app.getHttpServer())
      .get(apiPath(`/test-attempts/${attemptId}/draft`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(400);

    expect(readBody<{ message: string }>(clearedDraft.body).message).toContain(
      "already submitted",
    );

    const completedEnrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: { userId: studentUserId, courseId },
      },
    });
    expect(completedEnrollment?.status).toBe(CourseEnrollmentStatus.COMPLETED);
    expect(completedEnrollment?.progress).toBe(100);

    const uploadIntent = await request(app.getHttpServer())
      .post(apiPath("/admin/uploads/intent"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        purpose: "video",
        fileName: "lesson-2.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
        courseId,
      })
      .expect(201);
    const objectKey = readBody<UploadIntentBody>(uploadIntent.body).objectKey;

    await request(app.getHttpServer())
      .post(
        apiPath(
          `/admin/uploads/intent/${encodeURIComponent(objectKey)}/confirm`,
        ),
      )
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(apiPath(`/admin/courses/${courseId}/lessons`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Flow lesson 2",
        videoObjectKey: objectKey,
        videoDuration: 120,
      })
      .expect(201);

    const reactivatedEnrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: { userId: studentUserId, courseId },
      },
    });
    expect(reactivatedEnrollment?.status).toBe(CourseEnrollmentStatus.ACTIVE);
    expect(reactivatedEnrollment?.progress).toBeLessThan(100);
  });

  it("blocks publishing a course with an empty test", async () => {
    const draftCourse = await request(app.getHttpServer())
      .post(apiPath("/admin/courses"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Invalid publish course",
        slug: `invalid-publish-${Date.now()}`,
      })
      .expect(201);
    const draftCourseId = readBody<CourseBody>(draftCourse.body).id;

    const uploadIntent = await request(app.getHttpServer())
      .post(apiPath("/admin/uploads/intent"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        purpose: "video",
        fileName: "invalid.mp4",
        contentType: "video/mp4",
        fileSize: 512,
        courseId: draftCourseId,
      })
      .expect(201);
    const objectKey = readBody<UploadIntentBody>(uploadIntent.body).objectKey;

    await request(app.getHttpServer())
      .post(
        apiPath(
          `/admin/uploads/intent/${encodeURIComponent(objectKey)}/confirm`,
        ),
      )
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(201);

    const draftLessonResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/courses/${draftCourseId}/lessons`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Invalid lesson",
        videoObjectKey: objectKey,
        videoDuration: 60,
      })
      .expect(201);
    const draftLessonId = readBody<LessonBody>(draftLessonResponse.body).id;

    await request(app.getHttpServer())
      .post(apiPath(`/admin/lessons/${draftLessonId}/test`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Empty quiz",
        passingScore: 100,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(apiPath(`/admin/courses/${draftCourseId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ status: CourseStatus.PUBLISHED })
      .expect(400);

    await prisma.course.delete({ where: { id: draftCourseId } });
  });

  it("denies lesson playback after subscription cancellation", async () => {
    const subscription = await prisma.userSubscription.findFirst({
      where: {
        userId: studentUserId,
        status: UserSubscriptionStatus.ACTIVE,
      },
    });

    if (subscription) {
      await request(app.getHttpServer())
        .delete(
          apiPath(
            `/admin/users/${studentUserId}/subscriptions/${subscription.id}`,
          ),
        )
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .expect(204);
    }

    await request(app.getHttpServer())
      .get(apiPath(`/lessons/${lessonId}/playback-url`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(403);

    const continueResponse = await request(app.getHttpServer())
      .get(apiPath("/me/learning/continue"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    expectNoContinueLearning(continueResponse.body);
  });
});
