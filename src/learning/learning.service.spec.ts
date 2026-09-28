import { Test, TestingModule } from "@nestjs/testing";
import { CourseStatus } from "../generated/prisma/client";
import { CourseAccessService } from "../common/access/course-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { LearningService } from "./learning.service";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

describe("LearningService", () => {
  let service: LearningService;

  const prisma = {
    courseEnrollment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    course: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    lesson: {
      findMany: jest.fn(),
    },
    userLessonProgress: {
      findMany: jest.fn(),
    },
    testAttempt: {
      findMany: jest.fn(),
    },
  };

  const subscriptionsService = {
    hasActiveSubscription: jest.fn(),
  };

  const student = {
    id: "user-1",
    email: "student@example.com",
    firstName: "Student",
    lastName: "User",
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CourseAccessService,
          useValue: {},
        },
        {
          provide: SubscriptionsService,
          useValue: subscriptionsService,
        },
      ],
    }).compile();

    service = module.get(LearningService);
  });

  it("returns null for continue learning when subscription is inactive", async () => {
    subscriptionsService.hasActiveSubscription.mockResolvedValue(false);
    prisma.courseEnrollment.findFirst.mockResolvedValue({
      id: "enrollment-1",
      courseId: "course-1",
      progress: 40,
      course: {
        id: "course-1",
        title: "History",
        slug: "history",
      },
    });

    await expect(service.getContinueLearning(student)).resolves.toBeNull();
    expect(prisma.lesson.findMany).not.toHaveBeenCalled();
  });

  it("returns active enrollment course for subscribed student", async () => {
    subscriptionsService.hasActiveSubscription.mockResolvedValue(true);
    prisma.courseEnrollment.findFirst.mockResolvedValue({
      id: "enrollment-1",
      courseId: "course-1",
      progress: 40,
      course: {
        id: "course-1",
        title: "History",
        slug: "history",
      },
    });
    prisma.lesson.findMany.mockResolvedValue([
      {
        id: "lesson-1",
        title: "Lesson 1",
        order: 0,
        videoDuration: 100,
        test: null,
      },
    ]);
    prisma.userLessonProgress.findMany.mockResolvedValue([]);
    prisma.testAttempt.findMany.mockResolvedValue([]);

    const result = await service.getContinueLearning(student);

    expect(result?.course.id).toBe("course-1");
    expect(result?.nextAction).toEqual({
      type: "LESSON",
      lessonId: "lesson-1",
    });
  });

  it("allows admin continue learning without subscription", async () => {
    subscriptionsService.hasActiveSubscription.mockResolvedValue(false);
    prisma.courseEnrollment.findFirst.mockResolvedValue(null);
    prisma.course.findFirst.mockResolvedValue({
      id: "course-1",
      title: "History",
      slug: "history",
      status: CourseStatus.PUBLISHED,
    });
    prisma.lesson.findMany.mockResolvedValue([
      {
        id: "lesson-1",
        title: "Lesson 1",
        order: 0,
        videoDuration: 100,
        test: null,
      },
    ]);
    prisma.userLessonProgress.findMany.mockResolvedValue([]);
    prisma.testAttempt.findMany.mockResolvedValue([]);

    const result = await service.getContinueLearning({
      ...student,
      isAdmin: true,
    });

    expect(result?.course.id).toBe("course-1");
    expect(subscriptionsService.hasActiveSubscription).not.toHaveBeenCalled();
  });
});
