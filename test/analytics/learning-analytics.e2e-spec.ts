import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { CourseStatus, QuestionType } from "../../src/generated/prisma/client";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createAdminUser } from "../helpers/admin";
import { apiPath, createTestApp } from "../helpers/app";
import { signIn, signUp } from "../helpers/auth";

type CourseBody = { id: string };
type UploadIntentBody = { objectKey: string };
type LessonBody = { id: string };
type TestBody = { id: string };
type QuestionBody = {
  id: string;
  options: Array<{ id: string; isCorrect: boolean }>;
};
type ContinueBody = {
  course: { id: string; progress: number };
  lesson: { id: string; watchedSeconds: number };
  nextAction: { type: string; lessonId: string; testId?: string };
} | null;

function readBody<T>(body: unknown): T {
  return body as T;
}

describe("Learning analytics (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const adminEmail = `analytics-admin-${Date.now()}@example.com`;
  const studentEmail = `analytics-student-${Date.now()}@example.com`;
  const password = "password1";

  let adminAccessToken = "";
  let studentAccessToken = "";
  let studentUserId = "";
  let planId = "";
  let courseId = "";
  let lessonId = "";
  let testId = "";
  let questionOptionId = "";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    await createAdminUser(prisma, {
      email: adminEmail,
      password,
      firstName: "Analytics",
      lastName: "Admin",
    });

    const adminAuth = await signIn(app, { email: adminEmail, password });
    adminAccessToken = adminAuth.accessToken;

    const studentAuth = await signUp(app, {
      email: studentEmail,
      password,
      firstName: "Analytics",
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

    await request(app.getHttpServer())
      .post(apiPath(`/admin/users/${studentUserId}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ planId })
      .expect(201);

    const courseResponse = await request(app.getHttpServer())
      .post(apiPath("/admin/courses"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Analytics course",
        slug: `analytics-course-${Date.now()}`,
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
        title: "Analytics lesson",
        videoObjectKey: objectKey,
        videoDuration: 100,
      })
      .expect(201);
    lessonId = readBody<LessonBody>(lessonResponse.body).id;

    const testResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Analytics quiz",
        passingScore: 100,
      })
      .expect(201);
    testId = readBody<TestBody>(testResponse.body).id;

    const questionResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/tests/${testId}/questions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        text: "Question 1",
        type: QuestionType.SINGLE_CHOICE,
        points: 1,
        options: [
          { text: "Correct", isCorrect: true },
          { text: "Wrong", isCorrect: false },
        ],
      })
      .expect(201);
    questionOptionId = readBody<QuestionBody>(
      questionResponse.body,
    ).options.find((option) => option.isCorrect)!.id;

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

  it("auto-enrolls subscriber on first progress and exposes continue learning", async () => {
    await request(app.getHttpServer())
      .patch(apiPath(`/lessons/${lessonId}/progress`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({ watchedSeconds: 30 })
      .expect(200);

    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: { userId: studentUserId, courseId },
      },
    });
    expect(enrollment).not.toBeNull();

    const continueResponse = await request(app.getHttpServer())
      .get(apiPath("/me/learning/continue"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const continueBody = readBody<ContinueBody>(continueResponse.body);
    expect(continueBody?.course.id).toBe(courseId);
    expect(continueBody?.lesson.id).toBe(lessonId);
    expect(continueBody?.nextAction.type).toBe("LESSON");
  });

  it("returns course learning summary and user analytics overview", async () => {
    const summaryResponse = await request(app.getHttpServer())
      .get(apiPath(`/courses/${courseId}/learning-summary`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const summary = readBody<{
      enrollment: { progress: number } | null;
      lessonsTotal: number;
      watchedSecondsTotal: number;
    }>(summaryResponse.body);
    expect(summary.enrollment).not.toBeNull();
    expect(summary.lessonsTotal).toBe(1);
    expect(summary.watchedSecondsTotal).toBeGreaterThanOrEqual(30);

    const overviewResponse = await request(app.getHttpServer())
      .get(apiPath("/me/analytics/overview"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const overview = readBody<{
      lessons: { watchedSecondsTotal: number };
      subscription: { isActive: boolean };
    }>(overviewResponse.body);
    expect(overview.lessons.watchedSecondsTotal).toBeGreaterThanOrEqual(30);
    expect(overview.subscription.isActive).toBe(true);
  });

  it("recommends next test after lesson completion and updates admin analytics", async () => {
    await request(app.getHttpServer())
      .patch(apiPath(`/lessons/${lessonId}/progress`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({ watchedSeconds: 95 })
      .expect(200);

    const continueResponse = await request(app.getHttpServer())
      .get(apiPath("/me/learning/continue"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const continueBody = readBody<ContinueBody>(continueResponse.body);
    expect(continueBody?.nextAction.type).toBe("TEST");
    expect(continueBody?.nextAction.testId).toBe(testId);

    const attemptResponse = await request(app.getHttpServer())
      .post(apiPath(`/tests/${testId}/attempts`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(201);

    const attemptId = readBody<{ id: string }>(attemptResponse.body).id;

    const testPayload = await request(app.getHttpServer())
      .get(apiPath(`/tests/${testId}`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const questionId = readBody<{ questions: Array<{ id: string }> }>(
      testPayload.body,
    ).questions[0].id;

    await request(app.getHttpServer())
      .post(apiPath(`/test-attempts/${attemptId}/submit`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({
        answers: [{ questionId, optionIds: [questionOptionId] }],
      })
      .expect(201);

    const adminOverview = await request(app.getHttpServer())
      .get(apiPath("/admin/analytics/overview"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(
      readBody<{ tests: { attempts: number } }>(adminOverview.body).tests
        .attempts,
    ).toBeGreaterThanOrEqual(1);

    const courseAnalytics = await request(app.getHttpServer())
      .get(apiPath(`/admin/analytics/courses/${courseId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(
      readBody<{ funnel: { enrolled: number } }>(courseAnalytics.body).funnel
        .enrolled,
    ).toBeGreaterThanOrEqual(1);

    const testAnalytics = await request(app.getHttpServer())
      .get(apiPath(`/admin/analytics/tests/${testId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(
      readBody<{ attempts: number }>(testAnalytics.body).attempts,
    ).toBeGreaterThanOrEqual(1);
  });
});
