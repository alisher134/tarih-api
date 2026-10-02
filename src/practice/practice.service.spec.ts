import { ForbiddenException } from "@nestjs/common";
import { QuestionType } from "../generated/prisma/client";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("../prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

import { PracticeService } from "./practice.service";

describe("PracticeService", () => {
  let service: PracticeService;
  let prisma: {
    testAttempt: { findMany: jest.Mock };
    lessonTest: { findMany: jest.Mock };
    question: { findMany: jest.Mock };
    practiceSession: { create: jest.Mock; findMany: jest.Mock };
  };
  let subscriptionsService: {
    hasActiveSubscription: jest.Mock;
  };

  const mockUser = {
    id: "user-1",
    email: "user@example.com",
    firstName: "Test",
    lastName: "User",
    isAdmin: false,
    tokenVersion: 0,
    telegramId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      testAttempt: { findMany: jest.fn() },
      lessonTest: { findMany: jest.fn() },
      question: { findMany: jest.fn() },
      practiceSession: { create: jest.fn(), findMany: jest.fn() },
    };

    subscriptionsService = {
      hasActiveSubscription: jest.fn().mockResolvedValue(true),
    };

    service = new PracticeService(prisma as any, subscriptionsService as any);
  });

  describe("assertActiveSubscription", () => {
    it("throws if user has no active subscription and is not admin", async () => {
      subscriptionsService.hasActiveSubscription.mockResolvedValue(false);
      await expect(service.getAvailableTopics(mockUser)).rejects.toThrow();
    });

    it("allows access if user is admin even without subscription", async () => {
      subscriptionsService.hasActiveSubscription.mockResolvedValue(false);
      prisma.testAttempt.findMany.mockResolvedValue([]);
      const result = await service.getAvailableTopics({
        ...mockUser,
        isAdmin: true,
      });
      expect(result).toEqual([]);
    });
  });

  describe("getAvailableTopics", () => {
    it("returns empty array if user has not passed any tests", async () => {
      prisma.testAttempt.findMany.mockResolvedValue([]);
      const result = await service.getAvailableTopics(mockUser);
      expect(result).toEqual([]);
      expect(prisma.lessonTest.findMany).not.toHaveBeenCalled();
    });

    it("returns only tests from lessons that the user has already passed", async () => {
      prisma.testAttempt.findMany.mockResolvedValue([
        { testId: "test-1", score: 90, completedAt: new Date("2026-01-01") },
        { testId: "test-1", score: 80, completedAt: new Date("2025-12-01") },
      ]);

      prisma.lessonTest.findMany.mockResolvedValue([
        {
          id: "test-1",
          lesson: {
            id: "lesson-1",
            title: "Lesson 1",
            order: 1,
            course: {
              id: "course-1",
              title: "Course 1",
              slug: "course-1",
              order: 1,
            },
          },
          _count: { questions: 10 },
        },
      ]);

      const result = await service.getAvailableTopics(mockUser);
      expect(result).toHaveLength(1);
      expect(result[0].testId).toBe("test-1");
      expect(result[0].bestScore).toBe(90);
      expect(result[0].attemptsCount).toBe(2);
      expect(result[0].questionsCount).toBe(10);
    });
  });

  describe("startPracticeSession", () => {
    it("throws ForbiddenException if user tries to practice unpassed test", async () => {
      prisma.testAttempt.findMany.mockResolvedValue([{ testId: "test-1" }]);

      await expect(
        service.startPracticeSession(mockUser, {
          testIds: ["test-1", "test-2"],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("returns questions with isCorrect stripped", async () => {
      prisma.testAttempt.findMany.mockResolvedValue([{ testId: "test-1" }]);

      prisma.question.findMany.mockResolvedValue([
        {
          id: "q-1",
          text: "Question 1",
          type: QuestionType.SINGLE_CHOICE,
          points: 1,
          testId: "test-1",
          test: {
            id: "test-1",
            title: "Test 1",
            lesson: { title: "Lesson 1" },
          },
          options: [
            { id: "opt-1", text: "A", order: 0 },
            { id: "opt-2", text: "B", order: 1 },
          ],
        },
      ]);

      const result = await service.startPracticeSession(mockUser, {
        testIds: ["test-1"],
        shuffle: false,
      });

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].options[0]).not.toHaveProperty("isCorrect");
      expect(result.questions[0].options[0].text).toBe("A");
    });
  });

  describe("submitPracticeSession", () => {
    it("evaluates answers and saves PracticeSession to database", async () => {
      prisma.testAttempt.findMany.mockResolvedValue([{ testId: "test-1" }]);

      prisma.question.findMany.mockResolvedValue([
        {
          id: "q-1",
          text: "What is 2+2?",
          type: QuestionType.SINGLE_CHOICE,
          points: 1,
          test: { lesson: { title: "Math" } },
          options: [
            { id: "opt-1", text: "4", isCorrect: true },
            { id: "opt-2", text: "5", isCorrect: false },
          ],
        },
      ]);

      prisma.practiceSession.create.mockResolvedValue({
        id: "session-1",
        title: "Math",
        testIds: ["test-1"],
        totalQuestions: 1,
        correctAnswers: 1,
        score: 100,
        timeSpentSeconds: 45,
        createdAt: new Date(),
      });

      const result = await service.submitPracticeSession(mockUser, {
        testIds: ["test-1"],
        timeSpentSeconds: 45,
        answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
      });

      expect(result.score).toBe(100);
      expect(result.correctAnswers).toBe(1);
      expect(result.passed).toBe(true);
      expect(prisma.practiceSession.create).toHaveBeenCalled();
    });
  });
});
