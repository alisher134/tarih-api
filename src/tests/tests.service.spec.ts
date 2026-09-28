import { BadRequestException } from "@nestjs/common";
import { QuestionType } from "../generated/prisma/client";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("../prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

jest.mock("../common/access/course-access.service", () => ({
  CourseAccessService: class CourseAccessService {},
}));

import { TestsService } from "./tests.service";

describe("TestsService", () => {
  const prisma = {
    lessonTest: { findUnique: jest.fn() },
    userLessonProgress: { findUnique: jest.fn() },
    testAttempt: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    testAnswer: { createMany: jest.fn(), findMany: jest.fn() },
    testAnswerOption: { createMany: jest.fn() },
    courseEnrollment: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const courseAccess = {
    assertCourseContentAccess: jest.fn(),
  };

  const learningEvents = {
    recordTestStarted: jest.fn(),
    recordTestSubmitted: jest.fn(),
    recordCourseStarted: jest.fn(),
  };

  const subscriptionsService = {
    hasActiveSubscription: jest.fn(),
  };

  const service = new TestsService(
    prisma as never,
    courseAccess as never,
    learningEvents as never,
    subscriptionsService as never,
  );

  const user = {
    id: "user-1",
    email: "student@example.com",
    firstName: "Student",
    lastName: "User",
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  const inProgressAttempt = {
    id: "attempt-1",
    userId: user.id,
    completedAt: null,
    startedAt: new Date(),
    draftAnswers: null,
    test: {
      passingScore: 70,
      timeLimit: null,
      lesson: { id: "lesson-1", courseId: "course-1" },
      questions: [
        {
          id: "question-1",
          type: QuestionType.SINGLE_CHOICE,
          points: 1,
          options: [
            { id: "opt-1", isCorrect: true },
            { id: "opt-2", isCorrect: false },
          ],
        },
      ],
    },
  };

  it("returns empty draft when none saved", async () => {
    prisma.testAttempt.findUnique.mockResolvedValue(inProgressAttempt);

    await expect(service.getAttemptDraft(user, "attempt-1")).resolves.toEqual({
      answers: [],
    });
  });

  it("saves and returns draft answers", async () => {
    prisma.testAttempt.findUnique.mockResolvedValue(inProgressAttempt);
    prisma.testAttempt.update.mockResolvedValue({});

    await expect(
      service.saveAttemptDraft(user, "attempt-1", {
        answers: [{ questionId: "question-1", optionIds: ["opt-1"] }],
      }),
    ).resolves.toEqual({
      answers: [{ questionId: "question-1", optionIds: ["opt-1"] }],
    });

    expect(prisma.testAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt-1" },
      data: {
        draftAnswers: [{ questionId: "question-1", optionIds: ["opt-1"] }],
      },
    });
  });

  it("rejects duplicate question ids in submit payload", async () => {
    prisma.userLessonProgress.findUnique.mockResolvedValue({ completed: true });
    prisma.testAttempt.findUnique.mockResolvedValue({
      ...inProgressAttempt,
      test: {
        ...inProgressAttempt.test,
        questions: [
          {
            id: "question-1",
            type: QuestionType.SINGLE_CHOICE,
            points: 1,
            options: [{ id: "opt-1", isCorrect: true }],
          },
        ],
      },
    });

    await expect(
      service.submitAttempt(user, "attempt-1", {
        answers: [
          { questionId: "question-1", optionIds: ["opt-1"] },
          { questionId: "question-1", optionIds: ["opt-1"] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
