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
type AttemptBody = { id: string };
type TestPayloadBody = {
  questions: Array<{ id: string; options: Array<{ isCorrect?: boolean }> }>;
};
type PaginatedCoursesBody = { data: Array<{ id: string }> };
type PlaybackBody = { downloadUrl: string };

function readBody<T>(body: unknown): T {
  return body as T;
}

describe("Courses LMS (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const adminEmail = `lms-admin-${Date.now()}@example.com`;
  const studentEmail = `lms-student-${Date.now()}@example.com`;
  const password = "password1";

  let adminAccessToken = "";
  let studentAccessToken = "";
  let studentUserId = "";
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
      firstName: "Lms",
      lastName: "Admin",
    });

    const adminAuth = await signIn(app, { email: adminEmail, password });
    adminAccessToken = adminAuth.accessToken;

    const studentAuth = await signUp(app, {
      email: studentEmail,
      password,
      firstName: "Lms",
      lastName: "Student",
    });
    studentAccessToken = studentAuth.accessToken;
    studentUserId = studentAuth.user.id;

    const plansResponse = await request(app.getHttpServer())
      .get(apiPath("/subscription-plans"))
      .expect(200);
    const planId = readBody<Array<{ id: string; slug: string }>>(
      plansResponse.body,
    ).find((plan) => plan.slug === "1-month")!.id;

    await request(app.getHttpServer())
      .post(apiPath(`/admin/users/${studentUserId}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ planId })
      .expect(201);
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

  it("creates and publishes a course with lesson and test", async () => {
    const courseResponse = await request(app.getHttpServer())
      .post(apiPath("/admin/courses"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "History Basics",
        slug: `history-basics-${Date.now()}`,
        description: "Intro course",
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
        title: "First lesson",
        videoObjectKey: objectKey,
        videoDuration: 100,
      })
      .expect(201);

    lessonId = readBody<LessonBody>(lessonResponse.body).id;

    const testResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Lesson quiz",
        passingScore: 100,
      })
      .expect(201);

    testId = readBody<TestBody>(testResponse.body).id;

    const questionResponse = await request(app.getHttpServer())
      .post(apiPath(`/admin/tests/${testId}/questions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        text: "2 + 2 = ?",
        type: QuestionType.SINGLE_CHOICE,
        options: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
        ],
      })
      .expect(201);

    const question = readBody<QuestionBody>(questionResponse.body);
    questionOptionId = question.options.find((option) => option.isCorrect)!.id;

    await request(app.getHttpServer())
      .patch(apiPath(`/admin/courses/${courseId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ status: CourseStatus.PUBLISHED })
      .expect(200);
  });

  it("lists only published courses publicly", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/courses"))
      .expect(200);

    const list = readBody<PaginatedCoursesBody>(response.body);
    expect(list.data.some((course) => course.id === courseId)).toBe(true);
  });

  it("returns available courses in my courses before progress starts", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/courses/my"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const myCourses = readBody<
      Array<{ course: { id: string }; progress: number; isStarted: boolean }>
    >(response.body);

    expect(myCourses.some((item) => item.course.id === courseId)).toBe(true);
    expect(
      myCourses.find((item) => item.course.id === courseId)?.isStarted,
    ).toBe(false);
  });

  it("returns continue learning fallback for subscribed student", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/me/learning/continue"))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const body = readBody<{
      course: { id: string };
      nextAction: { type: string; lessonId: string };
    } | null>(response.body);

    expect(body).not.toBeNull();
    expect(body?.course.id).toBe(courseId);
    expect(body?.nextAction.type).toBe("LESSON");
    expect(body?.nextAction.lessonId).toBe(lessonId);
  });

  it("rejects test access before lesson completion", async () => {
    const freshStudentEmail = `lms-fresh-${Date.now()}@example.com`;
    const freshStudent = await signUp(app, {
      email: freshStudentEmail,
      password,
      firstName: "Fresh",
      lastName: "Student",
    });

    const plansResponse = await request(app.getHttpServer())
      .get(apiPath("/subscription-plans"))
      .expect(200);
    const planId = readBody<Array<{ id: string; slug: string }>>(
      plansResponse.body,
    ).find((plan) => plan.slug === "1-month")!.id;

    await request(app.getHttpServer())
      .post(apiPath(`/admin/users/${freshStudent.user.id}/subscriptions`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ planId })
      .expect(201);

    await request(app.getHttpServer())
      .get(apiPath(`/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${freshStudent.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(apiPath(`/tests/${testId}/attempts`))
      .set("Authorization", `Bearer ${freshStudent.accessToken}`)
      .expect(403);

    await prisma.user.delete({ where: { email: freshStudentEmail } });
  });

  it("returns testId in course details and lesson test after completion", async () => {
    const courseSlug = await prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { slug: true },
    });

    const courseDetails = await request(app.getHttpServer())
      .get(apiPath(`/courses/${courseSlug.slug}`))
      .expect(200);

    const lessons = readBody<{
      lessons: Array<{ id: string; testId: string | null; hasTest: boolean }>;
    }>(courseDetails.body).lessons;

    const lessonSummary = lessons.find((lesson) => lesson.id === lessonId);
    expect(lessonSummary?.hasTest).toBe(true);
    expect(lessonSummary?.testId).toBe(testId);

    await request(app.getHttpServer())
      .patch(apiPath(`/lessons/${lessonId}/progress`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({ watchedSeconds: 95 })
      .expect(200);

    const lessonTest = await request(app.getHttpServer())
      .get(apiPath(`/lessons/${lessonId}/test`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    expect(readBody<{ id: string }>(lessonTest.body).id).toBe(testId);
  });

  it("rejects test access for draft courses", async () => {
    const draftCourse = await request(app.getHttpServer())
      .post(apiPath("/admin/courses"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Draft course",
        slug: `draft-course-${Date.now()}`,
      })
      .expect(201);

    const draftCourseId = readBody<CourseBody>(draftCourse.body).id;

    const uploadIntent = await request(app.getHttpServer())
      .post(apiPath("/admin/uploads/intent"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        purpose: "video",
        fileName: "draft.mp4",
        contentType: "video/mp4",
        fileSize: 512,
        courseId: draftCourseId,
      })
      .expect(201);

    const draftObjectKey = readBody<UploadIntentBody>(
      uploadIntent.body,
    ).objectKey;

    await request(app.getHttpServer())
      .post(
        apiPath(
          `/admin/uploads/intent/${encodeURIComponent(draftObjectKey)}/confirm`,
        ),
      )
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(201);

    const draftLesson = await request(app.getHttpServer())
      .post(apiPath(`/admin/courses/${draftCourseId}/lessons`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Draft lesson",
        videoObjectKey: draftObjectKey,
        videoDuration: 60,
      })
      .expect(201);

    const draftLessonId = readBody<LessonBody>(draftLesson.body).id;

    const draftTest = await request(app.getHttpServer())
      .post(apiPath(`/admin/lessons/${draftLessonId}/test`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        title: "Draft quiz",
        passingScore: 100,
      })
      .expect(201);

    const draftTestId = readBody<TestBody>(draftTest.body).id;

    await request(app.getHttpServer())
      .get(apiPath(`/tests/${draftTestId}`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(404);

    await prisma.course.delete({ where: { id: draftCourseId } });
  });

  it("grants subscribed student progress tracking and test submit", async () => {
    await request(app.getHttpServer())
      .patch(apiPath(`/lessons/${lessonId}/progress`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({ watchedSeconds: 95 })
      .expect(200);

    const playback = await request(app.getHttpServer())
      .get(apiPath(`/lessons/${lessonId}/playback-url`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    expect(readBody<PlaybackBody>(playback.body).downloadUrl).toContain(
      "http://localhost:9000/",
    );

    const attempt = await request(app.getHttpServer())
      .post(apiPath(`/tests/${testId}/attempts`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(201);

    const testPayload = await request(app.getHttpServer())
      .get(apiPath(`/tests/${testId}`))
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .expect(200);

    const testBody = readBody<TestPayloadBody>(testPayload.body);
    expect(
      testBody.questions[0].options.every(
        (option) => option.isCorrect === undefined,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(
        apiPath(
          `/test-attempts/${readBody<AttemptBody>(attempt.body).id}/submit`,
        ),
      )
      .set("Authorization", `Bearer ${studentAccessToken}`)
      .send({
        answers: [
          {
            questionId: testBody.questions[0].id,
            optionIds: [questionOptionId],
          },
        ],
      })
      .expect(201);
  });
});
