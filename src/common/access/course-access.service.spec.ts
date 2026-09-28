import { NotFoundException } from "@nestjs/common";
import { CourseStatus } from "../../generated/prisma/client";
import { ForbiddenApiException } from "../errors/forbidden-api.exception";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

jest.mock("../../prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

import { CourseAccessService } from "./course-access.service";

describe("CourseAccessService", () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    lessonMaterial: { findUnique: jest.fn() },
  };

  const subscriptionsService = {
    hasActiveSubscription: jest.fn(),
  };

  const service = new CourseAccessService(
    prisma as never,
    subscriptionsService as never,
  );

  const student = {
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
    subscriptionsService.hasActiveSubscription.mockResolvedValue(false);
  });

  it("allows admin access to draft course content", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      status: CourseStatus.DRAFT,
    });

    await expect(
      service.assertCourseContentAccess(
        { ...student, isAdmin: true },
        "course-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("allows student with active subscription on published course", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      status: CourseStatus.PUBLISHED,
    });
    subscriptionsService.hasActiveSubscription.mockResolvedValue(true);

    await expect(
      service.assertCourseContentAccess(student, "course-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects student without active subscription on published course", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      status: CourseStatus.PUBLISHED,
    });

    await expect(
      service.assertCourseContentAccess(student, "course-1"),
    ).rejects.toThrow(ForbiddenApiException);
  });

  it("hides draft lessons from students", async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      id: "lesson-1",
      courseId: "course-1",
      course: { status: CourseStatus.DRAFT },
    });

    await expect(
      service.assertLessonPlaybackAccess(student, "lesson-1"),
    ).rejects.toThrow(NotFoundException);
  });
});
